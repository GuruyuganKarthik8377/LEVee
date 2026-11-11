import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ThreatBrief } from "../../agents/src/sentinel/agent.ts";
import { createMockPayments } from "../../payments/src/mock.ts";
import { memoryLedger, type Payments } from "../../payments/src/types.ts";
import { createPolicyEngine, memoryReviews, memoryStore, type AuditEntry, type Notice } from "../src/engine.ts";
import { BAY_OF_BENGAL_CYCLONE as playbook, type Partner, type Pledge } from "../src/playbook.ts";
import { planTopUp, reserveBalanceCents, reserveDrawCents } from "../src/rules.ts";

const usd = (value: string) => ({ currency_code: "USD", value });
const partners: Partner[] = [{ id: "a", email: "a@example.com" }, { id: "b", email: "b@example.com" }];
const pledge = (over: Partial<Pledge> = {}): Pledge => ({
  id: "p1", donorId: "d1", paymentTokenId: "tok", hazards: ["cyclone"], regions: ["bay-of-bengal-north"], amountPerEvent: usd("100.00"), annualCap: usd("500.00"), preference: "early", ...over,
});
const firing: ThreatBrief = JSON.parse(readFileSync(new URL("../../agents/fixtures/remal/briefs/advisory-3.json", import.meta.url), "utf8")).brief;
const acme = { id: "acme", email: "giving@acme.example.com", businessName: "Acme", matchBps: 5000, maxCentsPerTranche: 100_000 };
const landfall = { confirmedAt: "2024-05-26T18:30:00.000Z", source: "IMD bulletin" };
const passA = [{ partnerId: "a", verdict: "pass" as const }, { partnerId: "b", verdict: "human" as const }];

function setup(over: { payments?: Partial<Payments> } = {}) {
  const ledger = memoryLedger();
  const mock = createMockPayments(ledger);
  const batches: { key: string; amounts: Record<string, number> }[] = [];
  const payments: Payments = {
    ...mock,
    sendPayoutBatch: async (key, allocations) => {
      batches.push({ key, amounts: Object.fromEntries(allocations.map((a) => [a.partnerEmail[0], Math.round(Number(a.amount.value) * 100)])) });
      return mock.sendPayoutBatch(key, allocations);
    },
    ...over.payments,
  };
  const clock = { now: new Date(firing.asOf) };
  const notices: Notice[] = [];
  const audit: AuditEntry[] = [];
  const engine = createPolicyEngine({
    payments,
    ledger,
    store: memoryStore(),
    reviews: memoryReviews(),
    playbook,
    readLedger: async () => ledger.rows,
    notify: async (n) => void notices.push(n),
    audit: async (e) => void audit.push(e),
    now: () => clock.now,
  });
  const advance = (minutes: number) => (clock.now = new Date(clock.now.getTime() + minutes * 60_000));
  const gift = (id: string, net: string) => ledger.record({ kind: "reserve_payment", ref: "I-SUB", paypalId: id, status: "COMPLETED", amount: usd("99.00"), net: usd(net), at: "t" });
  return { engine, ledger, batches, notices, audit, clock, advance, gift, balance: () => reserveBalanceCents(ledger.rows) };
}
type S = ReturnType<typeof setup>;
const fire = (s: S, pledges: Pledge[] = [pledge()], sponsors = [] as (typeof acme)[], eventKey = "remal") => s.engine.evaluateTranche1({ eventKey, brief: firing, pledges, partners, sponsors });
const paid = (s: S, invoiceId: string, value: string, status = "PAID") => s.ledger.record({ kind: "invoice", ref: "m", paypalId: invoiceId, status, amount: usd(value), at: "t" });

test("the Reserve balance counts what was really received, and what storms have drawn", () => {
  const rows = [
    { kind: "reserve_payment", ref: "s", paypalId: "1", status: "COMPLETED", amount: usd("10.00"), net: usd("9.16"), at: "t" },
    { kind: "reserve_payment", ref: "s", paypalId: "2", status: "COMPLETED", amount: usd("10.00"), at: "t" },
    { kind: "reserve_credit", ref: "x", paypalId: "3", status: "CREDITED", amount: usd("5.00"), at: "t" },
    { kind: "reserve_draw", ref: "x", paypalId: "4", status: "COMMITTED", amount: usd("4.00"), at: "t" },
  ] as const;
  assert.equal(reserveBalanceCents([...rows]), 2016);
  assert.equal(reserveBalanceCents([rows[3]]), 0, "never below zero");
});

test("a draw takes its share of the balance, up to the limit and what partners have room for", () => {
  assert.equal(reserveDrawCents(10_000, Infinity, playbook), 5000);
  assert.equal(reserveDrawCents(1_000_000, Infinity, playbook), 50_000);
  assert.equal(reserveDrawCents(10_000, 300, playbook), 300);
  assert.equal(reserveDrawCents(0, Infinity, playbook), 0);
});

test("late money follows the split already paid, and what nobody has room for is held", () => {
  const a = { partner: partners[0], weightCents: 600, alreadyCents: 600 };
  const b = { partner: partners[1], weightCents: 400, alreadyCents: 400 };
  assert.deepEqual(planTopUp(1001, [a, b], playbook).paidTo, [{ partnerId: "a", cents: 601 }, { partnerId: "b", cents: 400 }]);

  const full = { partner: { ...partners[0], capacityCents: 700 }, weightCents: 600, alreadyCents: 600 };
  assert.deepEqual(planTopUp(1000, [full, b], playbook), { paidTo: [{ partnerId: "a", cents: 100 }, { partnerId: "b", cents: 900 }], heldCents: 0 });
  const onlyFull = planTopUp(1000, [full], playbook);
  assert.deepEqual(onlyFull, { paidTo: [{ partnerId: "a", cents: 100 }], heldCents: 900 });
  assert.deepEqual(planTopUp(1000, [], playbook), { paidTo: [], heldCents: 1000 });
});

test("tranche 1 adds the Reserve's share to what donors gave, and donors' pool stays their own", async () => {
  const s = setup();
  await s.gift("S1", "20.00");
  await fire(s);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.status, "paid");
  assert.equal(state.payout?.poolCents, 3811);
  assert.equal(state.payout?.reserveCents, 1000);
  assert.deepEqual(s.batches, [{ key: "remal:t1", amounts: { a: 2406, b: 2405 } }]);
  assert.equal(s.balance(), 1000);
});

test("a sponsor's match is worked out on donors' money, not on Reserve money", async () => {
  const s = setup();
  await s.gift("S1", "20.00");
  await fire(s, [pledge()], [acme]);
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).invoices?.[0].cents, 1905);
});

test("a draw is counted once, even when the payout is refused and sent again", async () => {
  let refuse = true;
  const ledger = memoryLedger();
  const s = setup({ payments: { sendPayoutBatch: async (key, allocations) => (refuse ? { status: "DENIED", reason: "ACCOUNT_RESTRICTED" } : createMockPayments(ledger).sendPayoutBatch(key, allocations)) } });
  await s.gift("S1", "20.00");
  await fire(s);
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).status, "payout_denied");
  assert.equal(s.balance(), 1000);
  refuse = false;
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.status, "paid");
  assert.equal(state.payout?.reserveCents, 1000);
  assert.equal(s.balance(), 1000);
});

test("if PayPal doesn't have the Reserve's money, donors' money goes straight away without it", async () => {
  const mock = createMockPayments(memoryLedger());
  const totals: number[] = [];
  const s = setup({
    payments: {
      sendPayoutBatch: async (key, allocations) => {
        const total = allocations.reduce((sum, a) => sum + Math.round(Number(a.amount.value) * 100), 0);
        totals.push(total);
        return total > 3811 ? { status: "DENIED", reason: "INSUFFICIENT_FUNDS" } : mock.sendPayoutBatch(key, allocations);
      },
    },
  });
  await s.gift("S1", "20.00");
  await fire(s);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.deepEqual(totals, [4811, 3811]);
  assert.equal(state.status, "paid");
  assert.equal(state.payout?.reserveCents, undefined);
  assert.equal(state.reserveRefused, true);
  assert.equal(s.balance(), 2000, "the draw goes back");
  assert.ok(s.audit.some((e) => e.action === "reserve_draw_refused"));
  await s.engine.execute("remal:t1");
  assert.equal(totals.length, 2);
});

test("a refusal for another reason keeps the plan, so the same payout goes next time", async () => {
  const mock = createMockPayments(memoryLedger());
  let refuse = true;
  const s = setup({ payments: { sendPayoutBatch: async (key, allocations) => (refuse ? { status: "DENIED", reason: "VALIDATION_ERROR" } : mock.sendPayoutBatch(key, allocations)) } });
  await s.gift("S1", "20.00");
  await fire(s);
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).status, "payout_denied");
  refuse = false;
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.status, "paid");
  assert.equal(state.payout?.reserveCents, 1000);
});

test("two storms draw one after the other, so neither spends the same money", async () => {
  const s = setup();
  await s.gift("S1", "20.00");
  await fire(s, [pledge()], [], "one");
  await fire(s, [pledge({ id: "p2" })], [], "two");
  s.advance(60);
  assert.equal((await s.engine.execute("one:t1")).payout?.reserveCents, 1000);
  assert.equal((await s.engine.execute("two:t1")).payout?.reserveCents, 500);
  assert.equal(s.balance(), 500);
});

test("tranche 2 doesn't draw on the Reserve", async () => {
  const s = setup();
  await fire(s);
  s.advance(60);
  await s.engine.execute("remal:t1");
  await s.gift("S1", "20.00");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: [{ partnerId: "a", verdict: "pass" }, { partnerId: "b", verdict: "pass" }], pledges: [pledge()], partners });
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t2")).payout?.reserveCents, undefined);
  assert.equal(s.balance(), 2000);
});

test("the ops limit counts the Reserve draw too", async () => {
  const s = setup();
  await s.gift("S1", "1500.00");
  const large = { amountPerEvent: usd("1000.00"), annualCap: usd("5000.00") };
  const decision = await fire(s, [pledge(large), pledge({ ...large, id: "p2" })]);
  assert.equal(decision.state?.status, "awaiting_approval", "$800 of charges alone is under the limit, and a $500 draw takes it over");
});

test("while charges are still settling, the Reserve lets tranche 1 go out", async () => {
  const s = setup();
  await s.gift("S1", "20.00");
  await fire(s, [pledge({ paymentTokenId: "MOCK-PENDING" })]);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.status, "paid");
  assert.equal(state.payout?.poolCents, 0);
  assert.equal(state.payout?.pendingCents, 4000);
  assert.deepEqual(s.batches, [{ key: "remal:t1", amounts: { a: 500, b: 500 } }]);
});

test("a charge that completes after the payout refills the Reserve, once", async () => {
  const s = setup();
  await s.gift("S1", "20.00");
  await fire(s, [pledge({ paymentTokenId: "MOCK-PENDING" })]);
  s.advance(60);
  const captureId = (await s.engine.execute("remal:t1")).items[0].result!.captureId!;
  assert.equal(s.balance(), 1000);

  await s.ledger.record({ kind: "charge", ref: "p1", paypalId: captureId, status: "COMPLETED", amount: usd("40.00"), net: usd("38.11"), at: "t" });
  const after = await s.engine.execute("remal:t1");
  assert.equal(after.items[0].result?.status, "COMPLETED");
  assert.equal(after.items[0].joinedReserve, true);
  assert.equal(after.payout?.pendingCents, 0);
  assert.equal(s.balance(), 4811);
  await s.engine.execute("remal:t1");
  assert.equal(s.balance(), 4811);
  assert.equal(s.batches.length, 1, "it doesn't try to catch the payout");
});

test("a late decline adds nothing, and a tranche with no money at all still settles", async () => {
  const s = setup();
  await fire(s, [pledge({ paymentTokenId: "MOCK-PENDING" })]);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.status, "no_funds");
  await s.ledger.record({ kind: "charge", ref: "p1", paypalId: state.items[0].result!.captureId!, status: "DECLINED", amount: usd("40.00"), reason: "DENIED", at: "t" });
  assert.equal((await s.engine.execute("remal:t1")).items[0].result?.status, "DECLINED");
  assert.equal(s.balance(), 0);
});

test("with no pledges, the Reserve alone fires tranche 1 and goes at once", async () => {
  const s = setup();
  await s.gift("S1", "20.00");
  const decision = await fire(s, []);
  assert.equal(decision.fired, true);
  assert.equal(s.notices.length, 0);
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.status, "paid");
  assert.deepEqual(s.batches[0].amounts, { a: 500, b: 500 });

  const empty = setup();
  assert.equal((await fire(empty, [])).fired, false);
});

test("nothing goes out for a sponsor until its invoice is paid, then what arrived follows the tranche's split, once", async () => {
  const s = setup();
  const proposal = [{ partnerId: "a", shareBps: 7500 }, { partnerId: "b", shareBps: 2500 }];
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge()], partners, proposal, sponsors: [acme] });
  s.advance(60);
  const first = await s.engine.execute("remal:t1");
  assert.equal(s.batches.length, 1);
  assert.equal(first.invoices?.[0].payout, undefined);

  await s.engine.execute("remal:t1");
  assert.equal(s.batches.length, 1, "still unpaid");

  await paid(s, first.invoices![0].result!.invoiceId!, "19.05");
  const after = await s.engine.execute("remal:t1");
  const payout = after.invoices![0].payout!;
  assert.equal(payout.status, "done");
  assert.equal(payout.netCents, 1790);
  assert.deepEqual(s.batches[1], { key: "remal:t1:match:acme", amounts: { a: 1343, b: 447 } });
  assert.deepEqual(after.payout?.allocations.map((a) => a.cents), [2859, 952], "what donors see of their pool doesn't change");

  await s.engine.execute("remal:t1");
  assert.equal(s.batches.length, 2, "not paid twice");
});

test("a cancelled invoice pays nothing and stops being checked", async () => {
  let checks = 0;
  const s = setup({ payments: { checkInvoice: async () => { checks++; return { status: "CLOSED" }; } } });
  await fire(s, [pledge()], [acme]);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.invoices?.[0].closed, true);
  await s.engine.execute("remal:t1");
  assert.equal(checks, 1);
  assert.equal(s.batches.length, 1);
});

test("a sponsor's money waits for an open review, and never reaches a rejected partner", async () => {
  const s = setup();
  await fire(s, [pledge()], [acme]);
  s.advance(60);
  const t1 = await s.engine.execute("remal:t1");
  await paid(s, t1.invoices![0].result!.invoiceId!, "19.05");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners });

  // The review is open now, so the tranche 1 match can't go to Partner B yet, or to Partner A alone.
  const before = s.batches.length;
  assert.equal((await s.engine.execute("remal:t1")).invoices?.[0].payout, undefined);
  assert.equal(s.batches.length, before);

  await s.engine.decideReview("remal", "b", { decision: "reject", by: "ops" });
  const after = await s.engine.execute("remal:t1");
  assert.deepEqual(after.invoices?.[0].payout?.paidTo, [{ partnerId: "a", cents: 1790 }]);
});

test("a match that fills every partner's room is held and reported", async () => {
  const s = setup();
  const tight = [{ ...partners[0], capacityCents: 2000 }, { ...partners[1], capacityCents: 2000 }];
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge()], partners: tight, sponsors: [acme] });
  s.advance(60);
  const t1 = await s.engine.execute("remal:t1");
  await paid(s, t1.invoices![0].result!.invoiceId!, "19.05");
  const payout = (await s.engine.execute("remal:t1")).invoices![0].payout!;
  assert.deepEqual(payout.paidTo.map((p) => p.cents), [94, 95]);
  assert.equal(payout.heldCents, 1601);
});

test("a failed check or refused payout changes nothing, and the same payout goes next time", async () => {
  let down = true;
  let refuse = true;
  const ledger = memoryLedger();
  const mock = createMockPayments(ledger);
  const keys: string[] = [];
  const s = setup({
    payments: {
      checkInvoice: async () => {
        if (down) throw new Error("outage");
        return { status: "PAID", net: usd("17.90") };
      },
      sendPayoutBatch: async (key, allocations) => {
        keys.push(key);
        if (key.includes(":match:") && refuse) return { status: "DENIED", reason: "INSUFFICIENT_FUNDS" };
        return mock.sendPayoutBatch(key, allocations);
      },
    },
  });
  await fire(s, [pledge()], [acme]);
  s.advance(60);
  const first = await s.engine.execute("remal:t1");
  assert.equal(first.status, "paid");
  assert.equal(first.invoices?.[0].payout, undefined);
  assert.ok(s.audit.some((e) => e.action === "match_check_failed"));

  down = false;
  const denied = await s.engine.execute("remal:t1");
  assert.equal(denied.invoices?.[0].payout?.status, "sending");
  assert.ok(s.audit.some((e) => e.action === "match_payout_denied"));

  refuse = false;
  const done = await s.engine.execute("remal:t1");
  assert.equal(done.invoices?.[0].payout?.status, "done");
  assert.deepEqual(keys.filter((k) => k.includes(":match:")), ["remal:t1:match:acme", "remal:t1:match:acme"]);
});
