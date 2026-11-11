import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockPayments, MOCK_FAILURES } from "../src/mock.ts";
import { memoryLedger } from "../src/types.ts";

const usd = (value: string) => ({ currency_code: "USD", value });

test("vault save then charge writes ledger rows", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const { setupTokenId } = await p.createSetupToken("donor-1");
  const { paymentTokenId } = await p.savePaymentMethod("donor-1", setupTokenId);
  const charge = await p.chargePledge({ pledgeId: "pledge-1", chargeKey: "pledge-1:remal:t1", paymentTokenId, amount: usd("10.00") });
  assert.equal(charge.status, "COMPLETED");
  assert.deepEqual(ledger.rows.map((r) => r.kind), ["vault_setup", "vault_saved", "charge"]);
});

test("retrying a charge with the same key does not charge twice", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const input = { pledgeId: "pledge-1", chargeKey: "pledge-1:remal:t1", paymentTokenId: "tok", amount: usd("10.00") };
  const first = await p.chargePledge(input);
  const second = await p.chargePledge(input);
  assert.deepEqual(second, first);
  assert.equal(ledger.rows.filter((r) => r.kind === "charge").length, 1);
});

test("ledger ignores a repeated row", async () => {
  const ledger = memoryLedger();
  const row = { kind: "charge" as const, ref: "p", paypalId: "CAP-1", status: "COMPLETED", at: "now" };
  await ledger.record(row);
  await ledger.record(row);
  assert.equal(ledger.rows.length, 1);
});

test("rejects bad amounts", async () => {
  const p = createMockPayments(memoryLedger());
  for (const value of ["0", "-5", "10.001", "abc", ""]) {
    await assert.rejects(p.chargePledge({ pledgeId: "p", chargeKey: `k${value}`, paymentTokenId: "tok", amount: usd(value) }));
  }
});

test("payout batch totals in cents and is idempotent", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const allocations = [
    { allocationId: "a1", partnerEmail: "partner1@example.com", amount: usd("0.10") },
    { allocationId: "a2", partnerEmail: "partner2@example.com", amount: usd("0.20") },
  ];
  const first = await p.sendPayoutBatch("remal:t1", allocations);
  assert.deepEqual(await p.sendPayoutBatch("remal:t1", allocations), first);
  const rows = ledger.rows.filter((r) => r.kind === "payout_batch");
  assert.deepEqual(rows.map((r) => r.status), ["PENDING", "SUCCESS"]);
  assert.equal(new Set(rows.map((r) => r.paypalId)).size, 1);
  assert.equal(rows[0].amount?.value, "0.30");
  assert.equal(ledger.rows.filter((r) => r.kind === "payout_item").length, 2);
});

test("mock simulates declined and pending charges", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger);
  const declined = await p.chargePledge({ pledgeId: "p1", chargeKey: "k1", paymentTokenId: MOCK_FAILURES.declinedToken, amount: usd("10.00") });
  assert.deepEqual(declined, { status: "DECLINED", reason: "INSTRUMENT_DECLINED" });
  const pending = await p.chargePledge({ pledgeId: "p2", chargeKey: "k2", paymentTokenId: MOCK_FAILURES.pendingToken, amount: usd("10.00") });
  assert.equal(pending.status, "PENDING");
  assert.deepEqual(ledger.rows.map((r) => [r.ref, r.status, r.reason]), [["p1", "DECLINED", "INSTRUMENT_DECLINED"], ["p2", "PENDING", "PENDING_REVIEW"]]);
  await assert.rejects(p.refund(pending.captureId!), /Unknown capture/);
});

test("mock denies a batch over the balance, and the same key works once funds arrive", async () => {
  const ledger = memoryLedger();
  const p = createMockPayments(ledger, { balance: "10.00" });
  const allocations = [{ allocationId: "a1", partnerEmail: "p1@example.com", amount: usd("25.00") }];
  assert.deepEqual(await p.sendPayoutBatch("remal:t1", allocations), { status: "DENIED", reason: "INSUFFICIENT_FUNDS" });
  await p.chargePledge({ pledgeId: "p", chargeKey: "k", paymentTokenId: "tok", amount: usd("20.00") });
  assert.equal((await p.sendPayoutBatch("remal:t1", allocations)).status, "PENDING");
});

test("mock marks unclaimed and failed partners per item while the batch still succeeds", async () => {
  const ledger = memoryLedger();
  await createMockPayments(ledger).sendPayoutBatch("remal:t1", [
    { allocationId: "ok", partnerEmail: "p1@example.com", amount: usd("1.00") },
    { allocationId: "nobody", partnerEmail: `${MOCK_FAILURES.unclaimedEmailPrefix}@example.com`, amount: usd("1.00") },
    { allocationId: "locked", partnerEmail: `${MOCK_FAILURES.failedEmailPrefix}@example.com`, amount: usd("1.00") },
  ]);
  const items = ledger.rows.filter((r) => r.kind === "payout_item").map((r) => [r.ref, r.status, r.reason]);
  assert.deepEqual(items, [["ok", "SUCCESS", undefined], ["nobody", "UNCLAIMED", "RECEIVER_UNREGISTERED"], ["locked", "FAILED", "RECEIVER_ACCOUNT_LOCKED"]]);
  assert.equal(ledger.rows.at(-1)?.status, "SUCCESS");
});

test("payout batch rejects mixed currencies, duplicate allocations and missing emails", async () => {
  const p = createMockPayments(memoryLedger());
  const a = { allocationId: "a1", partnerEmail: "p1@example.com", amount: usd("10.00") };
  await assert.rejects(p.sendPayoutBatch("k1", [a, { ...a, allocationId: "a2", amount: { currency_code: "EUR", value: "10.00" } }]), /Mixed currencies/);
  await assert.rejects(p.sendPayoutBatch("k2", [a, a]), /Duplicate allocationId/);
  await assert.rejects(p.sendPayoutBatch("k3", [{ ...a, partnerEmail: "" }]), /partnerEmail/);
  await assert.rejects(p.sendPayoutBatch("k4", []), /No allocations/);
});

test("refund only works on a known capture", async () => {
  const p = createMockPayments(memoryLedger());
  await assert.rejects(p.refund("MOCK-CAPTURE-999"));
  const { captureId } = await p.chargePledge({ pledgeId: "p", chargeKey: "k", paymentTokenId: "tok", amount: usd("5.00") });
  assert.equal((await p.refund(captureId!)).status, "COMPLETED");
});
