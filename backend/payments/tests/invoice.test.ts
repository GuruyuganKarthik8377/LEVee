import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockPayments } from "../src/mock.ts";
import { createPaypalPayments, PaypalError } from "../src/paypal.ts";
import { memoryLedger } from "../src/types.ts";
import { toLedgerRow } from "../src/webhook.ts";

const usd = (value: string) => ({ currency_code: "USD", value });
const match = { matchKey: "remal:t1:acme", sponsor: { email: "giving@acme.example.com", businessName: "Acme" }, amount: usd("500.00"), description: "Cyclone Remal, tranche 1" };
const invoice = (status: string) => ({ id: "INV2-1", status, detail: { invoice_number: "0007", metadata: { recipient_view_url: "https://pp/pay/INV2-1" } } });

function fakeClient(answer: (method: "post" | "get", path: string) => unknown) {
  const calls: { method: string; path: string; body?: any; requestId?: string }[] = [];
  return {
    calls,
    post: async <T>(path: string, body: unknown, requestId?: string) => {
      calls.push({ method: "post", path, body, requestId });
      return answer("post", path) as T;
    },
    get: async <T>(path: string) => {
      calls.push({ method: "get", path });
      return answer("get", path) as T;
    },
  };
}
const payments = (client: Parameters<typeof createPaypalPayments>[0], ledger = memoryLedger()) =>
  createPaypalPayments(client, ledger, { returnUrl: "https://r", cancelUrl: "https://c" });

test("invoiceMatch creates the invoice under the matchKey, sends it, and returns the pay link", async () => {
  const ledger = memoryLedger();
  const client = fakeClient((method, path) => (method === "get" ? invoice("SENT") : path.endsWith("/send") ? {} : invoice("DRAFT")));
  assert.deepEqual(await payments(client, ledger).invoiceMatch(match), { status: "SENT", invoiceId: "INV2-1", invoiceNumber: "0007", payUrl: "https://pp/pay/INV2-1" });

  const [create, send] = client.calls;
  assert.match(create.body.detail.invoice_number, /^LV-[0-9a-f]{16}$/);
  assert.equal(create.body.detail.reference, "remal:t1:acme");
  assert.equal(create.body.primary_recipients[0].billing_info.email_address, "giving@acme.example.com");
  assert.deepEqual(create.body.items[0].unit_amount, usd("500.00"));
  assert.equal(send.path, "/v2/invoicing/invoices/INV2-1/send");
  assert.deepEqual([ledger.rows[0].ref, ledger.rows[0].status, ledger.rows[0].amount?.value], ["remal:t1:acme", "SENT", "500.00"]);
});

test("the same matchKey always gets the same invoice number", async () => {
  const numbers: string[] = [];
  for (let i = 0; i < 2; i++) {
    const client = fakeClient((method) => (method === "get" ? invoice("SENT") : invoice("DRAFT")));
    await payments(client).invoiceMatch(match);
    numbers.push(client.calls[0].body.detail.invoice_number);
  }
  assert.equal(numbers[0], numbers[1]);
});

test("a retry hits DUPLICATE_INVOICE_NUMBER, finds the original by number, and does not send it again", async () => {
  const ledger = memoryLedger();
  let number = "";
  const client = fakeClient((method, path) => {
    if (path === "/v2/invoicing/invoices") throw new PaypalError(path, 422, JSON.stringify({ details: [{ issue: "DUPLICATE_INVOICE_NUMBER" }] }));
    if (path === "/v2/invoicing/search-invoices") return { items: [{ ...invoice("SENT"), detail: { invoice_number: number } }] };
    return invoice("PAID");
  });
  const p = payments(client, ledger);
  number = `LV-${(await import("node:crypto")).createHash("sha256").update(match.matchKey).digest("hex").slice(0, 16)}`;
  assert.equal((await p.invoiceMatch(match)).status, "PAID");
  assert.deepEqual(client.calls.map((c) => c.path), ["/v2/invoicing/invoices", "/v2/invoicing/search-invoices", "/v2/invoicing/invoices/INV2-1"]);
  assert.deepEqual(client.calls[1].body, { invoice_number: number });
});

test("if the original can't be found yet, the outcome is unknown, so it throws for a later retry", async () => {
  const client = fakeClient((_method, path) => {
    if (path === "/v2/invoicing/invoices") throw new PaypalError(path, 422, JSON.stringify({ details: [{ issue: "DUPLICATE_INVOICE_NUMBER" }] }));
    return { items: [] };
  });
  await assert.rejects(payments(client).invoiceMatch(match), /retry later/);
});

test("an invoice PayPal refuses returns FAILED with the reason", async () => {
  const client = fakeClient(() => {
    throw new PaypalError("/x", 422, JSON.stringify({ details: [{ issue: "CURRENCY_NOT_SUPPORTED" }], debug_id: "dbg" }));
  });
  assert.deepEqual(await payments(client).invoiceMatch(match), { status: "FAILED", reason: "CURRENCY_NOT_SUPPORTED" });
});

test("a bad sponsor email is rejected before calling PayPal", async () => {
  const client = fakeClient(() => assert.fail("must not call PayPal"));
  await assert.rejects(payments(client).invoiceMatch({ ...match, sponsor: { email: "not-an-email", businessName: "X" } }), /Invalid sponsor email/);
});

test("mock invoiceMatch is idempotent per matchKey", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const first = await p.invoiceMatch(match);
  assert.deepEqual(await p.invoiceMatch(match), first);
  assert.equal(ledger.rows.length, 1);
});

test("webhook: a paid invoice is tied back to its matchKey", () => {
  const row = toLedgerRow({
    event_type: "INVOICING.INVOICE.PAID",
    create_time: "t",
    resource: { id: "INV2-1", status: "PAID", detail: { reference: "remal:t1:acme", currency_code: "USD" }, amount: usd("500.00") },
  });
  assert.deepEqual(row, { kind: "invoice", ref: "remal:t1:acme", paypalId: "INV2-1", status: "PAID", amount: usd("500.00"), at: "t" });
});

const paidInvoice = (status: string, transactions: object[]) => ({ ...invoice(status), amount: usd("500.00"), payments: { paid_amount: usd("500.00"), transactions } });

test("checkInvoice: unpaid, partly paid and closed invoices have no money to send", async () => {
  for (const [status, expected] of [["SENT", "UNPAID"], ["UNPAID", "UNPAID"], ["PARTIALLY_PAID", "UNPAID"], ["PAYMENT_PENDING", "UNPAID"], ["CANCELLED", "CLOSED"], ["REFUNDED", "CLOSED"]]) {
    const ledger = memoryLedger();
    assert.deepEqual(await payments(fakeClient(() => invoice(status)), ledger).checkInvoice("remal:t1:acme", "INV2-1"), { status: expected }, status);
    assert.equal(ledger.rows.length, 0);
  }
});

test("checkInvoice: a PayPal payment counts what arrived after PayPal's fee, and writes it to the ledger", async () => {
  const ledger = memoryLedger();
  const client = fakeClient((_m, path) => (path.includes("/captures/") ? { id: "CAP", status: "COMPLETED", seller_receivable_breakdown: { net_amount: usd("482.06") } } : paidInvoice("PAID", [{ payment_id: "CAP", method: "PAYPAL", amount: usd("500.00") }])));
  assert.deepEqual(await payments(client, ledger).checkInvoice("remal:t1:acme", "INV2-1"), { status: "PAID", net: usd("482.06") });
  assert.deepEqual([ledger.rows[0].kind, ledger.rows[0].ref, ledger.rows[0].status, ledger.rows[0].net?.value], ["invoice", "remal:t1:acme", "PAID", "482.06"]);
});

test("checkInvoice: an older payment made as a sale is read too", async () => {
  const client = fakeClient((_m, path) => {
    if (path.includes("/captures/")) throw new PaypalError("/captures", 404, "{}");
    if (path.includes("/sale/")) return { amount: { total: "500.00", currency: "USD" }, transaction_fee: { value: "17.94" } };
    return paidInvoice("PAID", [{ payment_id: "S-1", method: "PAYPAL", amount: usd("500.00") }]);
  });
  assert.deepEqual(await payments(client).checkInvoice("m", "INV2-1"), { status: "PAID", net: usd("482.06") });
});

test("checkInvoice: a payment recorded by hand has no fee, and any other failure is left to retry", async () => {
  const recorded = fakeClient(() => paidInvoice("MARKED_AS_PAID", [{ payment_id: "EXTR-1", method: "BANK_TRANSFER", amount: usd("500.00") }]));
  assert.deepEqual(await payments(recorded).checkInvoice("m", "INV2-1"), { status: "PAID", net: usd("500.00") });
  const outage = fakeClient((_m, path) => {
    if (path.includes("/captures/")) throw new PaypalError("/outage", 503, "{}");
    return paidInvoice("PAID", [{ payment_id: "CAP", method: "PAYPAL", amount: usd("500.00") }]);
  });
  await assert.rejects(payments(outage).checkInvoice("m", "INV2-1"), /outage/);
});

test("the mock says what a webhook row says, and takes the sandbox's fee", async () => {
  const ledger = memoryLedger();
  const mock = createMockPayments(ledger);
  const { invoiceId } = await mock.invoiceMatch(match);
  assert.deepEqual(await mock.checkInvoice(match.matchKey, invoiceId!), { status: "UNPAID" });
  await ledger.record({ kind: "invoice", ref: match.matchKey, paypalId: invoiceId!, status: "PAID", amount: usd("500.00"), at: "t" });
  assert.deepEqual(await mock.checkInvoice(match.matchKey, invoiceId!), { status: "PAID", net: usd("482.06") });
  await ledger.record({ kind: "invoice", ref: match.matchKey, paypalId: invoiceId!, status: "REFUNDED", at: "t" });
  assert.deepEqual(await mock.checkInvoice(match.matchKey, invoiceId!), { status: "CLOSED" });
});

test("a sponsor's bank transfer is recorded on its invoice once, and then reads as paid with no PayPal fee", async () => {
  let status = "SENT";
  const client = fakeClient((method, path) => {
    if (method === "post" && path.endsWith("/payments")) {
      status = "MARKED_AS_PAID";
      return {};
    }
    return { ...invoice(status), amount: usd("3.37"), payments: status === "SENT" ? undefined : { paid_amount: usd("3.37"), transactions: [{ method: "BANK_TRANSFER", amount: usd("3.37") }] } };
  });
  const paypal = payments(client);
  await paypal.recordInvoicePayment!("helene:t1:sponsor", "INV2-1", usd("3.37"));
  await paypal.recordInvoicePayment!("helene:t1:sponsor", "INV2-1", usd("3.37"));
  const recorded = client.calls.filter((c) => c.method === "post");
  assert.equal(recorded.length, 1, "recording again doesn't pay twice");
  assert.deepEqual([recorded[0].path, recorded[0].body.method, recorded[0].body.amount], ["/v2/invoicing/invoices/INV2-1/payments", "BANK_TRANSFER", usd("3.37")]);
  assert.deepEqual(await paypal.checkInvoice("helene:t1:sponsor", "INV2-1"), { status: "PAID", net: usd("3.37") });

  const mock = createMockPayments(memoryLedger());
  const sent = await mock.invoiceMatch({ ...match, amount: usd("3.37") });
  assert.equal((await mock.checkInvoice(match.matchKey, sent.invoiceId!)).status, "UNPAID");
  await mock.recordInvoicePayment!(match.matchKey, sent.invoiceId!, usd("3.37"));
  await mock.recordInvoicePayment!(match.matchKey, sent.invoiceId!, usd("3.37"));
  assert.deepEqual(await mock.checkInvoice(match.matchKey, sent.invoiceId!), { status: "PAID", net: usd("3.37") });
});
