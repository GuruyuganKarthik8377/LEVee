import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockPayments } from "../src/mock.ts";
import { createPaypalPayments, PaypalError } from "../src/paypal.ts";
import { memoryLedger } from "../src/types.ts";
import { toLedgerRow } from "../src/webhook.ts";

const usd = (value: string) => ({ currency_code: "USD", value });

// Fake PayPal client that records calls and answers from a handler.
function fakeClient(answer: (method: "post" | "get", path: string, body?: any) => unknown) {
  const calls: { method: string; path: string; body?: any; requestId?: string }[] = [];
  return {
    calls,
    post: async <T>(path: string, body: unknown, requestId?: string) => {
      calls.push({ method: "post", path, body, requestId });
      return answer("post", path, body) as T;
    },
    get: async <T>(path: string) => {
      calls.push({ method: "get", path });
      return answer("get", path) as T;
    },
  };
}
const payments = (client: Parameters<typeof createPaypalPayments>[0], ledger = memoryLedger(), reservePlanId = "P-PLAN") =>
  createPaypalPayments(client, ledger, { returnUrl: "https://r", cancelUrl: "https://c", reservePlanId });

test("full refund uses a stable retry key and records the refunded amount", async () => {
  const ledger = memoryLedger();
  const client = fakeClient(() => ({ id: "R-1", status: "COMPLETED", amount: usd("10.00") }));
  assert.deepEqual(await payments(client, ledger).refund("C-1"), { status: "COMPLETED", refundId: "R-1" });
  assert.equal(client.calls[0].path, "/v2/payments/captures/C-1/refund");
  assert.equal(client.calls[0].requestId, "refund:C-1:full");
  assert.equal(client.calls[0].body.amount, undefined);
  assert.deepEqual(ledger.rows[0], { kind: "refund", ref: "C-1", paypalId: "R-1", status: "COMPLETED", amount: usd("10.00"), at: ledger.rows[0].at });
});

test("a refund PayPal refuses (422) returns FAILED with the reason instead of throwing", async () => {
  const ledger = memoryLedger();
  const client = fakeClient(() => {
    throw new PaypalError("/x", 422, JSON.stringify({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "CAPTURE_FULLY_REFUNDED" }], debug_id: "dbg" }));
  });
  assert.deepEqual(await payments(client, ledger).refund("C-1", usd("1.00")), { status: "FAILED", reason: "CAPTURE_FULLY_REFUNDED" });
  assert.equal(client.calls[0].requestId, "refund:C-1:1.00USD");
  assert.deepEqual([ledger.rows[0].status, ledger.rows[0].reason], ["FAILED", "CAPTURE_FULLY_REFUNDED"]);
});

test("Reserve subscription bills quantity x 1.00 and tags the donor", async () => {
  const ledger = memoryLedger();
  const client = fakeClient(() => ({ id: "I-SUB", status: "APPROVAL_PENDING", links: [{ rel: "approve", href: "https://pp/approve" }] }));
  assert.deepEqual(await payments(client, ledger).createReserveSubscription("donor-1", usd("15.00")), { subscriptionId: "I-SUB", approveUrl: "https://pp/approve" });
  const body = client.calls[0].body;
  assert.deepEqual([body.plan_id, body.quantity, body.custom_id], ["P-PLAN", "15", "donor-1"]);
  assert.deepEqual([ledger.rows[0].ref, ledger.rows[0].status, ledger.rows[0].amount?.value], ["donor-1", "APPROVAL_PENDING", "15.00"]);
});

test("Reserve amount '10' is stored as '10.00', matching the webhook's rows", async () => {
  const ledger = memoryLedger();
  const client = fakeClient(() => ({ id: "I-SUB", status: "APPROVAL_PENDING", links: [{ rel: "approve", href: "https://pp/approve" }] }));
  await payments(client, ledger).createReserveSubscription("donor-1", usd("10"));
  assert.equal(client.calls[0].body.quantity, "10");
  assert.deepEqual(ledger.rows[0].amount, usd("10.00"));
  const mockLedger = memoryLedger();
  await createMockPayments(mockLedger).createReserveSubscription("donor-1", usd("10"));
  assert.deepEqual(mockLedger.rows.map((r) => r.amount?.value), ["10.00", "10.00", "10.00"]);
});

test("Reserve rejects cents, other currencies and a missing plan before calling PayPal", async () => {
  const client = fakeClient(() => assert.fail("must not call PayPal"));
  await assert.rejects(payments(client).createReserveSubscription("d", usd("9.50")), /whole amounts/);
  await assert.rejects(payments(client).createReserveSubscription("d", { currency_code: "EUR", value: "10" }), /USD/);
  await assert.rejects(payments(client, memoryLedger(), "").createReserveSubscription("d", usd("10")), /PAYPAL_RESERVE_PLAN_ID/);
});

test("cancelling twice is safe: PayPal's 422 on the repeat is fine once the subscription reads CANCELLED", async () => {
  const ledger = memoryLedger();
  const client = fakeClient((method) => {
    if (method === "post") throw new PaypalError("/x", 422, JSON.stringify({ details: [{ issue: "SUBSCRIPTION_STATUS_INVALID" }] }));
    return { status: "CANCELLED", custom_id: "donor-1" };
  });
  await payments(client, ledger).cancelReserveSubscription("I-SUB", "donor asked");
  assert.deepEqual([ledger.rows[0].ref, ledger.rows[0].status], ["donor-1", "CANCELLED"]);
});

test("cancel throws if the subscription is not actually cancelled", async () => {
  const client = fakeClient((method) => (method === "post" ? undefined : { status: "APPROVAL_PENDING" }));
  await assert.rejects(payments(client).cancelReserveSubscription("I-SUB", "x"), /APPROVAL_PENDING/);
});

test("mock refunds once per capture, repeats the same answer, refuses a second refund", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const { captureId } = await p.chargePledge({ pledgeId: "p", chargeKey: "k", paymentTokenId: "tok", amount: usd("10.00") });
  const first = await p.refund(captureId!);
  assert.equal(first.status, "COMPLETED");
  assert.deepEqual(await p.refund(captureId!), first);
  assert.deepEqual(await p.refund(captureId!, usd("1.00")), { status: "FAILED", reason: "CAPTURE_FULLY_REFUNDED" });
  assert.equal(ledger.rows.find((r) => r.kind === "refund")?.amount?.value, "10.00");
});

test("mock Reserve subscription activates, bills the first month, and cancels", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const { subscriptionId } = await p.createReserveSubscription("donor-1", usd("20"));
  await p.cancelReserveSubscription(subscriptionId, "donor asked");
  assert.deepEqual(ledger.rows.map((r) => [r.kind, r.status]), [
    ["subscription", "APPROVAL_PENDING"], ["subscription", "ACTIVE"], ["reserve_payment", "COMPLETED"], ["subscription", "CANCELLED"],
  ]);
});

test("webhook: refund event is tied to its capture through the 'up' link", () => {
  const row = toLedgerRow({
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    create_time: "t",
    resource: { id: "R-1", status: "COMPLETED", amount: usd("10.00"), links: [{ rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/C-1" }] },
  });
  assert.deepEqual(row, { kind: "refund", ref: "C-1", paypalId: "R-1", status: "COMPLETED", amount: usd("10.00"), at: "t" });
});

test("webhook: subscription lifecycle and monthly Reserve payments", () => {
  const sub = (event_type: string, status: string) =>
    toLedgerRow({ event_type, create_time: "t", resource: { id: "I-SUB", status, custom_id: "donor-1", quantity: "15" } });
  assert.deepEqual(sub("BILLING.SUBSCRIPTION.ACTIVATED", "ACTIVE"), { kind: "subscription", ref: "donor-1", paypalId: "I-SUB", status: "ACTIVE", amount: usd("15.00"), at: "t" });
  assert.equal(sub("BILLING.SUBSCRIPTION.PAYMENT.FAILED", "ACTIVE")?.status, "PAYMENT_FAILED");

  const sale = { id: "S-1", state: "completed", amount: { total: "15.00", currency: "USD" }, billing_agreement_id: "I-SUB" };
  assert.deepEqual(toLedgerRow({ event_type: "PAYMENT.SALE.COMPLETED", create_time: "t", resource: sale }), {
    kind: "reserve_payment", ref: "I-SUB", paypalId: "S-1", status: "COMPLETED", amount: usd("15.00"), at: "t",
  });
  assert.equal(toLedgerRow({ event_type: "PAYMENT.SALE.COMPLETED", create_time: "t", resource: { ...sale, billing_agreement_id: undefined } }), undefined);
});
