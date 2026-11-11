import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ThreatBrief } from "../../agents/src/sentinel/agent.ts";
import { completePledge, openVault } from "../../agents/src/concierge/agent.ts";
import { cardHash, policyFrom } from "../../agents/src/concierge/policy.ts";
import { createMockPayments } from "../../payments/src/mock.ts";
import { memoryLedger, type Payments } from "../../payments/src/types.ts";
import { createPolicyEngine, memoryReviews, memoryStore, type AuditEntry, type Notice } from "../src/engine.ts";
import { BAY_OF_BENGAL_CYCLONE as playbook, type Partner, type Pledge } from "../src/playbook.ts";

const usd = (value: string) => ({ currency_code: "USD", value });
const partners = [{ id: "a", email: "a@example.com" }, { id: "b", email: "b@example.com" }];
const pledge = (over: Partial<Pledge> = {}): Pledge => ({
  id: "p1", donorId: "d1", paymentTokenId: "tok", hazards: ["cyclone"], regions: ["bay-of-bengal-north"], amountPerEvent: usd("10.00"), annualCap: usd("60.00"), preference: "early", ...over,
});
const savedBrief = (n: number): ThreatBrief => JSON.parse(readFileSync(new URL(`../../agents/fixtures/remal/briefs/advisory-${n}.json`, import.meta.url), "utf8")).brief;
const firing = savedBrief(3);

function setup(over: { payments?: Partial<Payments>; notify?: (n: Notice) => Promise<void>; playbook?: typeof playbook } = {}) {
  const ledger = memoryLedger();
  const mock = createMockPayments(ledger);
  const calls = { charges: [] as { chargeKey: string; value: string }[], batches: [] as { key: string; total: number; partners: string[] }[] };
  const payments: Payments = {
    ...mock,
    chargePledge: async (input) => {
      calls.charges.push({ chargeKey: input.chargeKey, value: input.amount.value });
      return mock.chargePledge(input);
    },
    sendPayoutBatch: async (key, allocations) => {
      calls.batches.push({ key, total: allocations.reduce((s, a) => s + Math.round(Number(a.amount.value) * 100), 0), partners: allocations.map((a) => a.partnerEmail) });
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
    playbook: over.playbook ?? playbook,
    readLedger: async () => ledger.rows,
    notify: over.notify ?? (async (n) => void notices.push(n)),
    audit: async (e) => void audit.push(e),
    now: () => clock.now,
  });
  const advance = (minutes: number) => (clock.now = new Date(clock.now.getTime() + minutes * 60_000));
  return { engine, ledger, calls, notices, audit, clock, advance };
}
const fire = (s: ReturnType<typeof setup>, pledges: Pledge[] = [pledge()], eventKey = "remal") => s.engine.evaluateTranche1({ eventKey, brief: firing, pledges, partners });
const landfall = { confirmedAt: "2024-05-26T18:30:00.000Z", source: "IMD bulletin" };

test("Remal's real briefs: advisories 1 and 2 don't fire, advisory 3 does, with a full checklist", async () => {
  for (const [n, fires] of [[1, false], [2, false], [3, true]] as const) {
    const s = setup();
    const brief = savedBrief(n);
    s.clock.now = new Date(brief.asOf);
    const d = await s.engine.evaluateTranche1({ eventKey: "remal", brief, pledges: [pledge()], partners });
    assert.equal(d.fired, fires, `advisory ${n}`);
    assert.equal(d.checks.length, 5);
    assert.equal(d.checks.every((c) => c.passed), fires);
    if (!fires) assert.match(d.reason, /Sentinel confidence/);
    assert.equal(s.calls.charges.length, 0, "deciding never charges");
  }
});

test("advisory 6 scores 88 but is too close to landfall to fire", async () => {
  const s = setup();
  const brief = savedBrief(6);
  s.clock.now = new Date(brief.asOf);
  const d = await s.engine.evaluateTranche1({ eventKey: "remal", brief, pledges: [pledge()], partners });
  assert.equal(d.fired, false);
  assert.match(d.reason, /Landfall within the window/);
});

const failing: [string, Partial<ThreatBrief>, RegExp][] = [
  ["a Green alert", { alertLevel: "Green" }, /alert level/],
  ["no landfall", { landfall: null }, /Landfall/],
  ["another region", { landfall: { ...firing.landfall!, regionId: "elsewhere" } }, /in this region/],
  ["landfall beyond 72 hours", { landfall: { ...firing.landfall!, leadHours: 73 } }, /within the window/],
  ["landfall already passed", { landfall: { ...firing.landfall!, leadHours: -1 } }, /within the window/],
  ["confidence of 69", { confidence: 69 }, /confidence/],
];
for (const [name, over, reason] of failing) {
  test(`${name} does not fire`, async () => {
    const s = setup();
    const d = await s.engine.evaluateTranche1({ eventKey: "remal", brief: { ...firing, ...over }, pledges: [pledge()], partners });
    assert.equal(d.fired, false);
    assert.match(d.reason, reason);
  });
}

test("exact thresholds fire: confidence 70, 72 hours and 6 hours", async () => {
  for (const over of [{ confidence: 70 }, { landfall: { ...firing.landfall!, leadHours: 72 } }, { landfall: { ...firing.landfall!, leadHours: 6 } }]) {
    assert.equal((await setup().engine.evaluateTranche1({ eventKey: "remal", brief: { ...firing, ...over }, pledges: [pledge()], partners })).fired, true);
  }
});

test("a brief older than 6 hours, or from the future, does not fire", async () => {
  for (const minutes of [6 * 60 + 1, -1]) {
    const s = setup();
    s.advance(minutes);
    const d = await fire(s);
    assert.equal(d.fired, false);
    assert.match(d.reason, /Brief is current/);
  }
});

test("a tranche fires once per event, however often Sentinel re-scores", async () => {
  const s = setup();
  assert.equal((await fire(s)).fired, true);
  const again = await fire(s);
  assert.equal(again.fired, false);
  assert.match(again.reason, /already fired/);
  assert.equal(s.notices.length, 1);
  s.advance(61);
  await s.engine.execute("remal:t1");
  await s.engine.execute("remal:t1");
  await fire(s);
  assert.equal(s.calls.charges.length, 1);
  assert.equal(s.calls.batches.length, 1);
});

test("a second storm is a separate tranche", async () => {
  const s = setup();
  await fire(s, [pledge()], "storm-a");
  assert.equal((await fire(s, [pledge()], "storm-b")).fired, true);
});

test("no charge before the notice's skip window closes", async () => {
  const s = setup();
  await fire(s);
  s.advance(59);
  assert.equal((await s.engine.execute("remal:t1")).status, "notice_open");
  assert.equal(s.calls.charges.length, 0);
  s.advance(1);
  assert.equal((await s.engine.execute("remal:t1")).status, "paid");
});

test("the notice states the real amount and the skip deadline", async () => {
  const s = setup();
  await fire(s);
  assert.deepEqual(s.notices[0], { kind: "pre_charge", trancheKey: "remal:t1", pledgeId: "p1", donorId: "d1", amount: usd("4.00"), skipUntil: new Date(new Date(firing.asOf).getTime() + 3_600_000).toISOString(), eventName: "REMAL-24" });
});

test("a donor who skips is not charged; the window closes after it ends", async () => {
  const s = setup();
  await fire(s, [pledge(), pledge({ id: "p2", donorId: "d2" })]);
  assert.equal(await s.engine.skip("remal:t1", "p1"), true);
  s.advance(60);
  assert.equal(await s.engine.skip("remal:t1", "p2"), false);
  await s.engine.execute("remal:t1");
  assert.deepEqual(s.calls.charges.map((c) => c.chargeKey), ["p2:remal:t1"]);
});

test("a donor the notice failed to reach is not charged", async () => {
  const s = setup({ notify: async (n) => { if (n.pledgeId === "p1") throw new Error("mail down"); } });
  await fire(s, [pledge(), pledge({ id: "p2", donorId: "d2" })]);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.deepEqual(s.calls.charges.map((c) => c.chargeKey), ["p2:remal:t1"]);
  assert.equal(state.items[0].notCharged, "notice_failed");
});

test("early donors split 40/60 with no cent lost; confirmed-only donors pay nothing until tranche 2", async () => {
  const s = setup();
  const pledges = [pledge({ amountPerEvent: usd("10.01") }), pledge({ id: "p2", donorId: "d2", preference: "confirmed" })];
  const d = await fire(s, pledges);
  assert.deepEqual(d.state?.items.map((i) => [i.pledgeId, i.cents]), [["p1", 400]]);
  assert.deepEqual(d.excluded, [{ pledgeId: "p2", reason: "donor chose confirmed only" }]);
  s.advance(60);
  await s.engine.execute("remal:t1");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  const t2 = await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: [{ partnerId: "a", verdict: "pass" }], pledges, partners });
  assert.deepEqual(t2.state?.items.map((i) => [i.pledgeId, i.cents]), [["p1", 601], ["p2", 1000]]);
});

test("the annual cap trims a charge, and an exhausted pledge is left out", async () => {
  const s = setup();
  const d = await fire(s, [pledge({ annualCap: usd("3.00") })]);
  assert.equal(d.state?.items[0].cents, 300);
  const spent = setup();
  await spent.ledger.record({ kind: "charge", ref: "p1", paypalId: "CAP-OLD", status: "COMPLETED", amount: usd("60.00"), at: firing.asOf });
  const none = await fire(spent);
  assert.equal(none.fired, false);
  assert.deepEqual(none.excluded, [{ pledgeId: "p1", reason: "annual cap reached" }]);
});

test("the cap counts a capture once, ignores declines and other years, and gives back refunds", async () => {
  const s = setup();
  const row = (paypalId: string, status: string, value: string, at = firing.asOf) => s.ledger.record({ kind: "charge", ref: "p1", paypalId, status, amount: usd(value), at });
  await row("CAP-1", "PENDING", "20.00");
  await row("CAP-1", "COMPLETED", "20.00");
  await row("CAP-2", "PENDING", "9.00");
  await row("CAP-2", "DECLINED", "9.00");
  await row("DEBUG-1", "DECLINED", "9.00");
  await row("CAP-OLD", "COMPLETED", "500.00", "2023-05-01T00:00:00.000Z");
  await row("CAP-3", "COMPLETED", "38.00");
  await s.ledger.record({ kind: "refund", ref: "CAP-3", paypalId: "R-1", status: "COMPLETED", amount: usd("38.00"), at: firing.asOf });
  await s.ledger.record({ kind: "refund", ref: "CAP-1", paypalId: "R-F", status: "FAILED", amount: usd("20.00"), at: firing.asOf });
  // 20.00 spent of a 60.00 cap, so the full 4.00 is allowed; with a 22.00 cap only 2.00 is.
  assert.equal((await fire(s)).state?.items[0].cents, 400);
  assert.equal((await fire(s, [pledge({ annualCap: usd("22.00") })], "storm-b")).state?.items[0].cents, 200);
});

test("pledges for another hazard, region or currency are left out", async () => {
  const d = await fire(setup(), [
    pledge(),
    pledge({ id: "flood", hazards: ["flood"] }),
    pledge({ id: "pacific", regions: ["pacific"] }),
    pledge({ id: "eur", amountPerEvent: { currency_code: "EUR", value: "10.00" } }),
  ]);
  assert.deepEqual(d.state?.items.map((i) => i.pledgeId), ["p1"]);
  assert.equal(d.excluded.length, 3);
});

test("partners are paid from net receipts, never more than arrived", async () => {
  const s = setup();
  await fire(s, [pledge({ amountPerEvent: usd("25.00") })]);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  // $10.00 charged at 3.49% + $0.49 nets $9.16.
  assert.equal(state.payout?.poolCents, 916);
  assert.deepEqual(state.payout?.allocations, [{ partnerId: "a", cents: 458 }, { partnerId: "b", cents: 458 }]);
  assert.equal(s.calls.batches[0].total, 916);
});

test("declined and pending charges don't fund the payout", async () => {
  const s = setup();
  await fire(s, [pledge(), pledge({ id: "bad", donorId: "d2", paymentTokenId: "MOCK-DECLINE" }), pledge({ id: "slow", donorId: "d3", paymentTokenId: "MOCK-PENDING" })]);
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.equal(state.payout?.poolCents, 337);
  assert.equal(state.payout?.pendingCents, 400);
  assert.equal(s.calls.batches[0].total, 337);
});

test("if nothing was collected, nothing is paid", async () => {
  const s = setup();
  await fire(s, [pledge({ paymentTokenId: "MOCK-DECLINE" })]);
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).status, "no_funds");
  assert.equal(s.calls.batches.length, 0);
});

test("a charge with an unknown outcome blocks the payout and retries under the same key", async () => {
  let attempts = 0;
  const base = setup();
  const mock = createMockPayments(base.ledger);
  const s = setup({ payments: { chargePledge: async (input) => { if (++attempts === 1) throw new Error("network down"); return mock.chargePledge(input); } } });
  await fire(s);
  s.advance(60);
  const first = await s.engine.execute("remal:t1");
  assert.equal(first.status, "charging");
  assert.equal(s.calls.batches.length, 0, "no payout while a charge is unresolved");
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).status, "paid");
  assert.equal(attempts, 2);
});

test("past 5 hours an unknown charge goes to a person, because PayPal's retry key is about to expire", async () => {
  let attempts = 0;
  const s = setup({ payments: { chargePledge: async () => { attempts++; throw new Error("network down"); } } });
  await fire(s);
  s.advance(60);
  await s.engine.execute("remal:t1");
  s.advance(5 * 60 + 1);
  assert.equal((await s.engine.execute("remal:t1")).status, "needs_review");
  assert.equal(attempts, 1, "no retry past the limit");
  assert.equal((await s.engine.execute("remal:t1")).status, "needs_review");
  assert.equal(attempts, 1);
  assert.ok(s.audit.some((e) => e.action === "charge_needs_review"));
});

test("a refused payout can be re-run with the same batch and amounts, without re-charging", async () => {
  let refuse = true;
  const base = setup();
  const mock = createMockPayments(base.ledger);
  const batches: string[] = [];
  const s = setup({ payments: { sendPayoutBatch: async (key, a) => { batches.push(`${key}:${a[0].amount.value}`); return refuse ? { status: "DENIED", reason: "INSUFFICIENT_FUNDS" } : mock.sendPayoutBatch(key, a); } } });
  await fire(s);
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).status, "payout_denied");
  refuse = false;
  assert.equal((await s.engine.execute("remal:t1")).status, "paid");
  assert.equal(s.calls.charges.length, 1);
  assert.equal(batches[0], batches[1]);
});

test("a payout that throws stays retryable, with no duplicate charges", async () => {
  let fail = true;
  const base = setup();
  const mock = createMockPayments(base.ledger);
  const s = setup({ payments: { sendPayoutBatch: async (key, a) => { if (fail) throw new Error("outage"); return mock.sendPayoutBatch(key, a); } } });
  await fire(s);
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).status, "paying");
  fail = false;
  assert.equal((await s.engine.execute("remal:t1")).status, "paid");
  assert.equal(s.calls.charges.length, 1);
});

test("over the ops limit, nothing happens until a person approves", async () => {
  const s = setup();
  const big = [pledge({ amountPerEvent: usd("3000.00"), annualCap: usd("9000.00") })];
  const d = await fire(s, big);
  assert.equal(d.state?.status, "awaiting_approval");
  assert.equal(s.notices.length, 0);
  s.advance(600);
  assert.equal((await s.engine.execute("remal:t1")).status, "awaiting_approval");
  assert.equal(s.calls.charges.length, 0);
  assert.equal((await s.engine.approve("remal:t1", "ops@levee")).status, "notice_open");
  assert.equal(s.notices.length, 1);
});

test("the Allocator's split is used when valid, rejected when not, and caps are enforced", async () => {
  const run = async (proposal: { partnerId: string; shareBps: number }[]) => {
    const s = setup();
    await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge({ amountPerEvent: usd("25.00") })], partners, proposal });
    s.advance(60);
    return (await s.engine.execute("remal:t1")).payout!;
  };
  assert.deepEqual((await run([{ partnerId: "a", shareBps: 7500 }, { partnerId: "b", shareBps: 2500 }])).allocations, [{ partnerId: "a", cents: 687 }, { partnerId: "b", cents: 229 }]);
  const unvetted = await run([{ partnerId: "stranger", shareBps: 10000 }]);
  assert.match(unvetted.proposalRejected!, /stranger/);
  assert.deepEqual(unvetted.allocations.map((a) => a.partnerId), ["a", "b"]);
  assert.match((await run([{ partnerId: "a", shareBps: 8000 }, { partnerId: "b", shareBps: 8000 }])).proposalRejected!, /160%/);
  const partial = await run([{ partnerId: "a", shareBps: 5000 }]);
  assert.match(partial.proposalRejected!, /50%, not 100%/);
  assert.deepEqual(partial.allocations, [{ partnerId: "a", cents: 458 }, { partnerId: "b", cents: 458 }]);
  assert.match((await run([{ partnerId: "a", shareBps: 5000 }, { partnerId: "a", shareBps: 5000 }])).proposalRejected!, /appears twice/);

  const capped = setup({ playbook: { ...playbook, maxPerPartnerCents: 300 } });
  await fire(capped, [pledge({ amountPerEvent: usd("25.00") })]);
  capped.advance(60);
  const payout = (await capped.engine.execute("remal:t1")).payout!;
  assert.deepEqual(payout.allocations, [{ partnerId: "a", cents: 300 }, { partnerId: "b", cents: 300 }]);
  assert.equal(payout.heldCents, 316);
});

async function paidTranche1(pledges = [pledge()]) {
  const s = setup();
  await fire(s, pledges);
  s.advance(60);
  await s.engine.execute("remal:t1");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  return s;
}
const passA = [{ partnerId: "a", verdict: "pass" as const }, { partnerId: "b", verdict: "human" as const }];

test("tranche 2 pays only the partner the Verifier passed", async () => {
  const s = await paidTranche1();
  const d = await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners });
  assert.equal(d.fired, true);
  s.advance(60);
  const state = await s.engine.execute("remal:t2");
  assert.equal(state.status, "paid");
  assert.deepEqual(s.calls.batches[1].partners, ["a@example.com"]);
  assert.equal(s.calls.charges[1].chargeKey, "p1:remal:t2");
  assert.equal(s.calls.charges[1].value, "6.00");
});

const t2Blocks: [string, () => Promise<ReturnType<typeof setup>>, object, RegExp][] = [
  ["landfall isn't confirmed", paidTranche1, { landfall: undefined }, /Landfall confirmed/],
  ["the confirmation is in the future", paidTranche1, { landfall: { confirmedAt: "2030-01-01T00:00:00.000Z", source: "x" } }, /Landfall confirmed/],
  ["no partner passed", paidTranche1, { verdicts: [{ partnerId: "a", verdict: "partial" }, { partnerId: "b", verdict: "human" }] }, /Verifier pass/],
  ["tranche 1 never fired", async () => setup(), {}, /Tranche 1 paid/],
];
for (const [name, make, over, reason] of t2Blocks) {
  test(`tranche 2 does not fire, and charges nobody, when ${name}`, async () => {
    const s = await make();
    const before = s.calls.charges.length;
    const d = await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners, ...over });
    assert.equal(d.fired, false);
    assert.match(d.reason, reason);
    assert.equal(s.calls.charges.length, before);
  });
}

test("a donor who skipped tranche 1 isn't charged for tranche 2 of that storm", async () => {
  const s = setup();
  const pledges = [pledge(), pledge({ id: "p2", donorId: "d2" })];
  await fire(s, pledges);
  await s.engine.skip("remal:t1", "p1");
  s.advance(60);
  await s.engine.execute("remal:t1");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  const d = await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges, partners });
  assert.deepEqual(d.state?.items.map((i) => i.pledgeId), ["p2"]);
  assert.deepEqual(d.excluded, [{ pledgeId: "p1", reason: "donor skipped this event" }]);
});

test("every decision reaches the audit log with its checks, including ones that didn't fire", async () => {
  const s = setup();
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: { ...firing, confidence: 50 }, pledges: [pledge()], partners });
  await fire(s);
  s.advance(60);
  await s.engine.execute("remal:t1");
  const actions = s.audit.map((e) => e.action);
  assert.deepEqual(actions, ["tranche_not_fired", "notices_sent", "tranche_fired", "charge_result", "payout_sent"]);
  assert.equal(s.audit[0].checks?.find((c) => c.rule === "Sentinel confidence")?.passed, false);
});

test("a pledge made through the Concierge is one the engine can charge, for the amounts on its card", async () => {
  const s = setup();
  const payments = createMockPayments(s.ledger);
  const policy = { ...policyFrom({ amountPerEvent: 25, annualCap: 100, currency: "USD", hazardsAsked: ["cyclone"], coveredRegionAsked: true, otherPlacesAsked: [], preference: null, reserveMonthly: null, ambiguous: false }), regions: [playbook.regionId] };
  const confirmedHash = cardHash(policy);
  const { setupTokenId } = await openVault({ donorId: "d1", policy, confirmedHash, payments });
  const made = await completePledge({ donorId: "d1", policy, confirmedHash, setupTokenId, payments });
  const d = await fire(s, [made]);
  assert.equal(d.fired, true);
  assert.deepEqual(d.excluded, []);
  assert.equal(d.state?.items[0].cents, 1000);
  assert.equal(d.state?.items[0].paymentTokenId, made.paymentTokenId);
});

async function charged() {
  const s = setup();
  await fire(s);
  s.advance(60);
  await s.engine.execute("remal:t1");
  return s;
}

test("a refund inside the review window goes through, once", async () => {
  const s = await charged();
  s.advance(47 * 60);
  const r = await s.engine.refundCharge("remal:t1", "p1", "d1");
  assert.equal(r.refunded, true);
  assert.equal(r.result?.status, "COMPLETED");
  const again = await s.engine.refundCharge("remal:t1", "p1", "d1");
  assert.equal(again.reason, "already refunded");
  assert.equal(s.ledger.rows.filter((row) => row.kind === "refund").length, 1);
});

test("a refund outside the window, for someone else's charge, or for a missing charge is refused", async () => {
  const s = await charged();
  assert.match((await s.engine.refundCharge("remal:t1", "p1", "intruder")).reason, /another donor/);
  assert.match((await s.engine.refundCharge("remal:t1", "nope", "d1")).reason, /no such charge/);
  assert.match((await s.engine.refundCharge("remal:t9", "p1", "d1")).reason, /no such charge/);
  s.advance(48 * 60 + 1);
  assert.match((await s.engine.refundCharge("remal:t1", "p1", "d1")).reason, /48 hour review window/);
  assert.equal(s.ledger.rows.filter((row) => row.kind === "refund").length, 0);
  assert.ok(s.audit.some((e) => e.action === "refund_refused"));
});

test("a declined charge has nothing to refund, and a refunded amount returns to the donor's yearly cap", async () => {
  const declined = setup();
  await fire(declined, [pledge({ paymentTokenId: "MOCK-DECLINE" })]);
  declined.advance(60);
  await declined.engine.execute("remal:t1");
  assert.match((await declined.engine.refundCharge("remal:t1", "p1", "d1")).reason, /nothing was charged/);

  const s = await charged();
  await s.engine.refundCharge("remal:t1", "p1", "d1");
  const next = await fire(s, [pledge({ annualCap: usd("4.00") })], "storm-b");
  assert.equal(next.state?.items[0].cents, 400);
});

test("a partner's stated capacity caps its share, and the rest is held and reported", async () => {
  const s = setup();
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge({ amountPerEvent: usd("25.00") })], partners: [{ id: "a", email: "a@example.com", capacityCents: 100 }, partners[1]] });
  s.advance(60);
  const payout = (await s.engine.execute("remal:t1")).payout!;
  assert.deepEqual(payout.allocations, [{ partnerId: "a", cents: 100 }, { partnerId: "b", cents: 458 }]);
  assert.equal(payout.heldCents, 358);
});

test("the Allocator's reasons reach the public audit log with the payout", async () => {
  const s = setup();
  const proposal = [{ partnerId: "a", shareBps: 6000, rationale: "Closest to landfall." }, { partnerId: "b", shareBps: 4000, rationale: "Further east." }];
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge()], partners, proposal });
  s.advance(60);
  await s.engine.execute("remal:t1");
  const entry = s.audit.find((e) => e.action === "payout_sent")!;
  assert.deepEqual((entry.detail as any).proposal[0].rationale, "Closest to landfall.");
});

test("the Allocator can't get a flagged partner paid: its proposed share is only held", async () => {
  const s = await paidTranche1();
  await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners, proposal: [{ partnerId: "b", shareBps: 10000 }] });
  s.advance(60);
  const state = await s.engine.execute("remal:t2");
  assert.equal(state.status, "held_for_review");
  assert.equal(s.calls.batches.length, 1, "only tranche 1's batch, nothing new");
  assert.deepEqual(state.payout!.heldForReview?.map((h) => [h.partnerId, h.cents]), [["b", 530]]);
});

const acme = { id: "acme", email: "giving@acme.example.com", businessName: "Acme", matchBps: 5000, maxCentsPerTranche: 100_000 };

test("when a tranche pays, the sponsor is invoiced its agreed match on what went out, once", async () => {
  const s = setup();
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge({ amountPerEvent: usd("25.00") })], partners, sponsors: [acme] });
  s.advance(60);
  const state = await s.engine.execute("remal:t1");
  assert.deepEqual(state.invoices?.map((i) => [i.matchKey, i.cents, i.result?.status]), [["remal:t1:acme", 458, "SENT"]]);
  await s.engine.execute("remal:t1");
  assert.equal(s.ledger.rows.filter((r) => r.kind === "invoice").length, 1);
});

test("a sponsor's limit caps its invoice", async () => {
  const s = setup();
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge({ amountPerEvent: usd("25.00") })], partners, sponsors: [{ ...acme, maxCentsPerTranche: 100 }] });
  s.advance(60);
  assert.equal((await s.engine.execute("remal:t1")).invoices?.[0].cents, 100);
});

test("no invoice if nothing paid out, and no invoice without a sponsor", async () => {
  const none = setup();
  await none.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge({ paymentTokenId: "MOCK-DECLINE" })], partners, sponsors: [acme] });
  none.advance(60);
  assert.equal((await none.engine.execute("remal:t1")).invoices, undefined);
  const plain = setup();
  await fire(plain);
  plain.advance(60);
  assert.equal((await plain.engine.execute("remal:t1")).invoices, undefined);
});

test("a failed invoice doesn't touch the payout, and the next run retries it", async () => {
  let fail = true;
  const base = setup();
  const mock = createMockPayments(base.ledger);
  const s = setup({ payments: { invoiceMatch: async (input) => { if (fail) throw new Error("outage"); return mock.invoiceMatch(input); } } });
  await s.engine.evaluateTranche1({ eventKey: "remal", brief: firing, pledges: [pledge()], partners, sponsors: [acme] });
  s.advance(60);
  const first = await s.engine.execute("remal:t1");
  assert.equal(first.status, "paid");
  assert.equal(first.invoices?.[0].result, undefined);
  assert.ok(s.audit.some((e) => e.action === "match_invoice_outcome_unknown"));
  fail = false;
  assert.equal((await s.engine.execute("remal:t1")).invoices?.[0].result?.status, "SENT");
  assert.equal(s.calls.batches.length, 1, "the payout isn't repeated");
});

// $6.00 charged nets $5.30, split equally: $2.65 paid to the partner who passed, $2.65 held.
async function heldTranche2(over: { verdicts?: { partnerId: string; verdict: "pass" | "partial" | "human"; summary?: string; failedChecks?: string[] }[]; list?: Partner[] } = {}) {
  const s = await paidTranche1();
  const d = await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: over.verdicts ?? [{ partnerId: "a", verdict: "pass" }, { partnerId: "b", verdict: "human", summary: "Photo reused.", failedChecks: ["No photo was used before: photo-2"] }], pledges: [pledge()], partners: over.list ?? partners });
  s.advance(60);
  const state = await s.engine.execute("remal:t2");
  return { ...s, d, state };
}

test("a flagged partner's share is held, the verified partner is paid, and a review opens with the reasons", async () => {
  const s = await heldTranche2();
  assert.equal(s.state.status, "paid");
  assert.deepEqual(s.state.payout!.allocations, [{ partnerId: "a", cents: 265 }]);
  assert.deepEqual(s.state.payout!.heldForReview?.map((h) => [h.partnerId, h.cents, h.status]), [["b", 265, "awaiting_review"]]);
  assert.deepEqual(s.calls.batches[1].partners, ["a@example.com"]);
  const [open] = await s.engine.listOpenReviews();
  assert.deepEqual([open.partnerId, open.verdict, open.status, open.summary, open.failedChecks], ["b", "human", "open", "Photo reused.", ["No photo was used before: photo-2"]]);
});

test("re-running while a review is open moves nothing", async () => {
  const s = await heldTranche2();
  await s.engine.execute("remal:t2");
  await s.engine.execute("remal:t2");
  assert.equal(s.calls.batches.length, 2);
  assert.equal(s.calls.charges.length, 2);
});

test("approving pays the held share to that partner, under its own batch, once", async () => {
  const s = await heldTranche2();
  const { review, state } = await s.engine.decideReview("remal", "b", { decision: "approve", by: "ops@levee", note: "Checked with the partner." });
  assert.deepEqual([review.status, review.decidedBy, review.note], ["approved", "ops@levee", "Checked with the partner."]);
  assert.deepEqual(state!.payout!.allocations, [{ partnerId: "a", cents: 265 }, { partnerId: "b", cents: 265 }]);
  assert.equal(s.calls.batches[2].key, "remal:t2:release:b");
  assert.equal(s.calls.batches[2].total, 265);
  await s.engine.decideReview("remal", "b", { decision: "approve", by: "ops@levee" });
  await s.engine.execute("remal:t2");
  assert.equal(s.calls.batches.length, 3, "same decision again sends nothing");
  assert.deepEqual(await s.engine.listOpenReviews(), []);
});

test("rejecting sends the held share to the partner who passed, and the flagged partner gets nothing", async () => {
  const s = await heldTranche2();
  const { state } = await s.engine.decideReview("remal", "b", { decision: "reject", by: "ops@levee" });
  assert.deepEqual(state!.payout!.allocations, [{ partnerId: "a", cents: 530 }]);
  assert.equal(s.calls.batches[2].key, "remal:t2:reallocate:b");
  assert.deepEqual(s.calls.batches[2].partners, ["a@example.com"]);
  assert.equal(s.calls.batches[2].total, 265);
});

test("what a verified partner has no room for stays with Levee and is reported", async () => {
  const s = await heldTranche2({ list: [{ id: "a", email: "a@example.com", capacityCents: 300 }, partners[1]] });
  const { state } = await s.engine.decideReview("remal", "b", { decision: "reject", by: "ops@levee" });
  const held = state!.payout!.heldForReview![0];
  assert.deepEqual(held.paidTo, [{ partnerId: "a", cents: 35 }]);
  assert.equal(held.strandedCents, 230);
  assert.equal(state!.payout!.heldCents, 230);
});

test("a decision can't be flipped, needs a name, and needs a case", async () => {
  const s = await heldTranche2();
  await assert.rejects(s.engine.decideReview("remal", "b", { decision: "approve", by: " " }), /name of the person/);
  await assert.rejects(s.engine.decideReview("remal", "nobody", { decision: "approve", by: "ops" }), /No review/);
  await s.engine.decideReview("remal", "b", { decision: "reject", by: "ops@levee" });
  await assert.rejects(s.engine.decideReview("remal", "b", { decision: "approve", by: "someone-else" }), /already rejected by ops@levee/);
  assert.equal(s.calls.batches.length, 3);
});

test("a refused or failed release keeps its amounts and retries under the same batch", async () => {
  let mode: "deny" | "throw" | "ok" = "deny";
  const base = setup();
  const mock = createMockPayments(base.ledger);
  const sent: string[] = [];
  const s = setup({ payments: { sendPayoutBatch: async (key, a) => {
    if (key.includes("release")) {
      sent.push(`${key}:${a[0].amount.value}`);
      if (mode === "deny") return { status: "DENIED", reason: "INSUFFICIENT_FUNDS" };
      if (mode === "throw") throw new Error("outage");
    }
    return mock.sendPayoutBatch(key, a);
  } } });
  await fire(s);
  s.advance(60);
  await s.engine.execute("remal:t1");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners });
  s.advance(60);
  await s.engine.execute("remal:t2");
  const first = await s.engine.decideReview("remal", "b", { decision: "approve", by: "ops" });
  assert.equal(first.state!.payout!.heldForReview![0].status, "releasing");
  mode = "throw";
  await s.engine.execute("remal:t2");
  mode = "ok";
  const final = await s.engine.execute("remal:t2");
  assert.equal(final.payout!.heldForReview![0].status, "done");
  assert.equal(new Set(sent).size, 1, "same batch and amount every time");
  assert.equal(sent.length, 3);
  assert.deepEqual(final.payout!.allocations, [{ partnerId: "a", cents: 265 }, { partnerId: "b", cents: 265 }]);
});

test("a partner with no proof yet gets a held share and a review, not nothing", async () => {
  const s = await heldTranche2({ verdicts: [{ partnerId: "a", verdict: "pass" }] });
  assert.equal((await s.engine.listOpenReviews())[0].verdict, "no_proof");
  assert.deepEqual(s.state.payout!.heldForReview?.map((h) => h.partnerId), ["b"]);
});

test("if nobody has passed, nobody is charged, and an approval lets tranche 2 fire", async () => {
  const s = await paidTranche1();
  const verdicts = [{ partnerId: "a", verdict: "partial" as const }, { partnerId: "b", verdict: "human" as const }];
  const args = { eventKey: "remal", eventName: "REMAL-24", landfall, verdicts, pledges: [pledge()], partners };
  const before = s.calls.charges.length;
  assert.equal((await s.engine.evaluateTranche2(args)).fired, false);
  assert.equal(s.calls.charges.length, before);
  assert.equal((await s.engine.listOpenReviews()).length, 2);
  await s.engine.decideReview("remal", "a", { decision: "approve", by: "ops" });
  const d = await s.engine.evaluateTranche2(args);
  assert.equal(d.fired, true);
  s.advance(60);
  const state = await s.engine.execute("remal:t2");
  assert.deepEqual(state.payout!.allocations.map((x) => x.partnerId), ["a"]);
  assert.deepEqual(state.payout!.heldForReview?.map((h) => h.partnerId), ["b"]);
});

test("a decision made before the payout counts: rejected partners get no share, approved ones are paid straight away", async () => {
  const rejected = await paidTranche1();
  const args = { eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners };
  await rejected.engine.evaluateTranche2(args);
  await rejected.engine.decideReview("remal", "b", { decision: "reject", by: "ops" });
  rejected.advance(60);
  const r = await rejected.engine.execute("remal:t2");
  assert.deepEqual(r.payout!.allocations, [{ partnerId: "a", cents: 530 }]);
  assert.equal(r.payout!.heldForReview, undefined);

  const approved = await paidTranche1();
  await approved.engine.evaluateTranche2(args);
  await approved.engine.decideReview("remal", "b", { decision: "approve", by: "ops" });
  approved.advance(60);
  const a = await approved.engine.execute("remal:t2");
  assert.deepEqual(a.payout!.allocations, [{ partnerId: "a", cents: 265 }, { partnerId: "b", cents: 265 }]);
});

test("the \"reallocate\" setting pays verified partners the whole pool at once", async () => {
  const s = setup({ playbook: { ...playbook, unverifiedShare: "reallocate" } });
  await fire(s);
  s.advance(60);
  await s.engine.execute("remal:t1");
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners });
  s.advance(60);
  const state = await s.engine.execute("remal:t2");
  assert.deepEqual(state.payout!.allocations, [{ partnerId: "a", cents: 530 }]);
  assert.equal(state.payout!.heldForReview, undefined);
});

test("every review step reaches the audit log with who decided", async () => {
  const s = await heldTranche2();
  await s.engine.decideReview("remal", "b", { decision: "approve", by: "ops@levee" });
  const actions = s.audit.map((e) => e.action);
  for (const a of ["review_opened", "review_decided", "held_share_released"]) assert.ok(actions.includes(a), a);
  assert.equal((s.audit.find((e) => e.action === "review_decided")!.detail as any).by, "ops@levee");
});

test("a sponsor's invoice for tranche 2 isn't repeated when a held share is released", async () => {
  const s = await paidTranche1();
  await s.engine.evaluateTranche2({ eventKey: "remal", eventName: "REMAL-24", landfall, verdicts: passA, pledges: [pledge()], partners, sponsors: [acme] });
  s.advance(60);
  await s.engine.execute("remal:t2");
  await s.engine.decideReview("remal", "b", { decision: "approve", by: "ops" });
  await s.engine.execute("remal:t2");
  assert.equal(s.ledger.rows.filter((r) => r.kind === "invoice").length, 1);
});
