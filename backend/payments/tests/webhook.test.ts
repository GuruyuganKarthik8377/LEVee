import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryLedger } from "../src/types.ts";
import { createWebhookHandler, toLedgerRow } from "../src/webhook.ts";

// Fake PayPal client: records what we asked it to verify, answers with the given status.
function fakeClient(verification_status: string) {
  const bodies: unknown[] = [];
  return {
    bodies,
    post: async <T>(_path: string, body: unknown) => {
      bodies.push(body);
      return { verification_status } as T;
    },
  };
}

// Odd spacing on purpose: verification must forward these exact bytes, not a re-serialized copy.
const captureEvent = `{"id":"WH-1",  "event_type":"PAYMENT.CAPTURE.COMPLETED","create_time":"2026-11-03T10:00:00Z",
  "resource":{"id":"CAP-1","status":"COMPLETED","custom_id":"pledge-1","amount":{"currency_code":"USD","value":"10.00"}}}`;

const post = (body: string) =>
  new Request("http://localhost/webhooks/paypal", { method: "POST", body, headers: { "paypal-transmission-id": "T-1" } });

test("verified capture event writes one ledger row, even when PayPal resends it", async () => {
  const ledger = memoryLedger();
  const client = fakeClient("SUCCESS");
  const handle = createWebhookHandler(client, ledger, "WH-ID");
  assert.equal((await handle(post(captureEvent))).status, 200);
  assert.equal((await handle(post(captureEvent))).status, 200);
  assert.deepEqual(ledger.rows, [
    { kind: "charge", ref: "pledge-1", paypalId: "CAP-1", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" }, at: "2026-11-03T10:00:00Z" },
  ]);
  const sent = client.bodies[0] as string;
  assert.ok(sent.endsWith(`"webhook_event":${captureEvent}}`), "raw event must be forwarded byte for byte");
  assert.equal(JSON.parse(sent).transmission_id, "T-1");
  assert.equal(JSON.parse(sent).webhook_id, "WH-ID");
});

test("failed signature check writes nothing", async () => {
  const ledger = memoryLedger();
  const res = await createWebhookHandler(fakeClient("FAILURE"), ledger, "WH-ID")(post(captureEvent));
  assert.equal(res.status, 400);
  assert.equal(ledger.rows.length, 0);
});

test("invalid JSON is rejected before calling PayPal", async () => {
  const client = fakeClient("SUCCESS");
  const res = await createWebhookHandler(client, memoryLedger(), "WH-ID")(post(`{"a":1}, "webhook_id":"evil"`));
  assert.equal(res.status, 400);
  assert.equal(client.bodies.length, 0);
});

test("payout batch event converts Payouts' currency field", async () => {
  const ledger = memoryLedger();
  const event = JSON.stringify({
    event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
    create_time: "2026-11-03T11:00:00Z",
    resource: { batch_header: { payout_batch_id: "PB-1", batch_status: "SUCCESS", sender_batch_header: { sender_batch_id: "remal:t1" }, amount: { currency: "USD", value: "30.00" } } },
  });
  await createWebhookHandler(fakeClient("SUCCESS"), ledger, "WH-ID")(post(event));
  assert.deepEqual(ledger.rows[0], { kind: "payout_batch", ref: "remal:t1", paypalId: "PB-1", status: "SUCCESS", amount: { currency_code: "USD", value: "30.00" }, at: "2026-11-03T11:00:00Z" });
});

test("declined capture (Orders v2 event name) is recorded as DECLINED", async () => {
  const ledger = memoryLedger();
  const event = JSON.stringify({
    event_type: "PAYMENT.CAPTURE.DECLINED",
    create_time: "t",
    resource: { id: "CAP-2", status: "DECLINED", custom_id: "pledge-2", amount: { currency_code: "USD", value: "10.00" } },
  });
  await createWebhookHandler(fakeClient("SUCCESS"), ledger, "WH-ID")(post(event));
  assert.deepEqual([ledger.rows[0].kind, ledger.rows[0].ref, ledger.rows[0].status, ledger.rows[0].reason], ["charge", "pledge-2", "DECLINED", "DECLINED"]);
});

test("unclaimed payout item is recorded per partner with PayPal's reason", async () => {
  const ledger = memoryLedger();
  // Item fields as seen live in sandbox for a receiver with no PayPal account.
  const event = JSON.stringify({
    event_type: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
    create_time: "t",
    resource: {
      payout_item_id: "47QARA7N2F8C4",
      transaction_status: "UNCLAIMED",
      payout_batch_id: "JATJYWS7JENKW",
      errors: { name: "RECEIVER_UNREGISTERED", message: "The recipient for this payout does not have an account." },
      payout_item: { sender_item_id: "alloc-2", receiver: "nobody@example.com", amount: { currency: "USD", value: "1.00" } },
    },
  });
  await createWebhookHandler(fakeClient("SUCCESS"), ledger, "WH-ID")(post(event));
  assert.deepEqual(ledger.rows[0], {
    kind: "payout_item", ref: "alloc-2", paypalId: "47QARA7N2F8C4", status: "UNCLAIMED",
    amount: { currency_code: "USD", value: "1.00" }, reason: "RECEIVER_UNREGISTERED", at: "t",
  });
});

test("unknown event types are acknowledged but not recorded", async () => {
  const ledger = memoryLedger();
  const res = await createWebhookHandler(fakeClient("SUCCESS"), ledger, "WH-ID")(post(`{"event_type":"CHECKOUT.ORDER.APPROVED","create_time":"x","resource":{}}`));
  assert.equal(res.status, 200);
  assert.equal(ledger.rows.length, 0);
});

test("capture and Reserve rows carry what Levee really received, when PayPal says", () => {
  const usd = (value: string) => ({ currency_code: "USD", value });
  const capture = toLedgerRow({ event_type: "PAYMENT.CAPTURE.COMPLETED", create_time: "t", resource: { id: "C", custom_id: "p1", amount: usd("10.00"), seller_receivable_breakdown: { net_amount: usd("9.16") } } });
  assert.equal(capture?.net?.value, "9.16");
  const sale = { id: "S", amount: { total: "10.00", currency: "USD" }, billing_agreement_id: "I-SUB" };
  assert.equal(toLedgerRow({ event_type: "PAYMENT.SALE.COMPLETED", create_time: "t", resource: { ...sale, transaction_fee: { value: "0.84", currency: "USD" } } })?.net?.value, "9.16");
  assert.equal(toLedgerRow({ event_type: "PAYMENT.SALE.COMPLETED", create_time: "t", resource: sale })?.net, undefined);
});
