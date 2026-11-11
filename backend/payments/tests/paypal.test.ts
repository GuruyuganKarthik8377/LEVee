import { test } from "node:test";
import assert from "node:assert/strict";
import { createPaypalClient, createPaypalPayments, PaypalError } from "../src/paypal.ts";
import { memoryLedger } from "../src/types.ts";

const allocations = [{ allocationId: "a1", partnerEmail: "p1@example.com", amount: { currency_code: "USD", value: "25.00" } }];

// Shape of PayPal's real answer when a sender_batch_id is reused (seen live in sandbox).
const alreadyExists = JSON.stringify({
  name: "USER_BUSINESS_ERROR",
  details: [{ field: "SENDER_BATCH_ID", issue: "Batch with given sender_batch_id already exists", link: [{ href: "https://api.sandbox.paypal.com/v1/payments/payouts/PB-1", rel: "self" }] }],
});

test("payout retry returns the original batch when PayPal says it already exists", async () => {
  const gets: string[] = [];
  const client = {
    post: async () => { throw new PaypalError("/v1/payments/payouts", 400, alreadyExists); },
    get: async <T>(path: string) => {
      gets.push(path);
      return { batch_header: { payout_batch_id: "PB-1", batch_status: "SUCCESS" } } as T;
    },
  };
  const ledger = memoryLedger();
  const result = await createPaypalPayments(client, ledger, { returnUrl: "https://r", cancelUrl: "https://c" }).sendPayoutBatch("remal:t1", allocations);
  assert.deepEqual(result, { payoutBatchId: "PB-1", status: "SUCCESS" });
  assert.deepEqual(gets, ["/v1/payments/payouts/PB-1"]);
  assert.equal(ledger.rows[0].paypalId, "PB-1");
});

const failingClient = (status: number, body: unknown) => ({
  post: async (): Promise<never> => { throw new PaypalError("/x", status, JSON.stringify(body)); },
  get: async <T>(): Promise<T> => { throw new Error("must not look anything up"); },
});
const payments = (client: Parameters<typeof createPaypalPayments>[0], ledger = memoryLedger()) =>
  createPaypalPayments(client, ledger, { returnUrl: "https://r", cancelUrl: "https://c" });
const charge = { pledgeId: "pledge-1", chargeKey: "pledge-1:remal:t1", paymentTokenId: "tok", amount: { currency_code: "USD", value: "10.00" } };

test("insufficient funds denies the batch instead of throwing, and records why", async () => {
  const ledger = memoryLedger();
  const result = await payments(failingClient(422, { name: "INSUFFICIENT_FUNDS", debug_id: "dbg-1" }), ledger).sendPayoutBatch("remal:t1", allocations);
  assert.deepEqual(result, { status: "DENIED", reason: "INSUFFICIENT_FUNDS" });
  assert.deepEqual([ledger.rows[0].status, ledger.rows[0].reason, ledger.rows[0].paypalId], ["DENIED", "INSUFFICIENT_FUNDS", "dbg-1"]);
});

test("a malformed payout request still throws", async () => {
  await assert.rejects(payments(failingClient(400, { name: "VALIDATION_ERROR" })).sendPayoutBatch("k", allocations), /VALIDATION_ERROR/);
});

test("a declined charge (422) and a revoked saved PayPal (403) both return DECLINED with PayPal's reason", async () => {
  for (const [status, body, reason] of [
    [422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INSTRUMENT_DECLINED" }], debug_id: "d1" }, "INSTRUMENT_DECLINED"],
    [403, { name: "NOT_AUTHORIZED", details: [{ issue: "PERMISSION_DENIED" }], debug_id: "d2" }, "PERMISSION_DENIED"],
  ] as const) {
    const ledger = memoryLedger();
    assert.deepEqual(await payments(failingClient(status, body), ledger).chargePledge(charge), { status: "DECLINED", reason });
    assert.deepEqual([ledger.rows[0].ref, ledger.rows[0].status, ledger.rows[0].reason], ["pledge-1", "DECLINED", reason]);
  }
});

test("an outage after retries throws, so the caller retries later with the same chargeKey", async () => {
  const ledger = memoryLedger();
  await assert.rejects(payments(failingClient(503, { name: "SERVICE_UNAVAILABLE" }), ledger).chargePledge(charge), /503/);
  assert.equal(ledger.rows.length, 0);
});

test("a capture declined inside a successful order response is DECLINED", async () => {
  const client = {
    post: async <T>() => ({ id: "O-1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "C-1", status: "DECLINED" }] } }] }) as T,
    get: async <T>(): Promise<T> => { throw new Error("unused"); },
  };
  assert.deepEqual(await payments(client).chargePledge(charge), { status: "DECLINED", orderId: "O-1", captureId: "C-1", reason: "DECLINED" });
});

// Client-level retries, with fetch replaced by a script of responses.
function scriptedFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; requestId: string | null }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, requestId: new Headers(init.headers).get("PayPal-Request-Id") });
    if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: `tok-${calls.length}`, expires_in: 3600 }));
    const next = responses.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}
const client = () => createPaypalClient({ clientId: "id", clientSecret: "secret", apiBase: "https://api-m.sandbox.paypal.com", retryDelayMs: 0 });

test("client retries a 503 with the same PayPal-Request-Id, so PayPal can't act twice", async () => {
  const f = scriptedFetch([{ status: 503, body: {} }, { status: 201, body: { ok: true } }]);
  try {
    assert.deepEqual(await client().post("/v2/checkout/orders", {}, "charge-key-1"), { ok: true });
    const orderCalls = f.calls.filter((c) => c.url.endsWith("/orders"));
    assert.deepEqual(orderCalls.map((c) => c.requestId), ["charge-key-1", "charge-key-1"]);
  } finally {
    f.restore();
  }
});

test("client gets a fresh token once on 401", async () => {
  const f = scriptedFetch([{ status: 401, body: {} }, { status: 200, body: { ok: true } }]);
  try {
    assert.deepEqual(await client().get("/v1/x"), { ok: true });
    assert.equal(f.calls.filter((c) => c.url.endsWith("/oauth2/token")).length, 2);
  } finally {
    f.restore();
  }
});

test("client does not retry PayPal's final answers (4xx)", async () => {
  const f = scriptedFetch([{ status: 422, body: { name: "UNPROCESSABLE_ENTITY" } }]);
  try {
    await assert.rejects(client().post("/v2/checkout/orders", {}, "k"), (err: unknown) => err instanceof PaypalError && err.status === 422);
    assert.equal(f.calls.filter((c) => c.url.endsWith("/orders")).length, 1);
  } finally {
    f.restore();
  }
});

test("client gives up after 3 attempts", async () => {
  const f = scriptedFetch([{ status: 500, body: {} }, { status: 500, body: {} }, { status: 500, body: {} }]);
  try {
    await assert.rejects(client().get("/v1/x"), /500/);
    assert.equal(f.calls.filter((c) => c.url.endsWith("/v1/x")).length, 3);
  } finally {
    f.restore();
  }
});
