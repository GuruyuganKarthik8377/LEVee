// /run's buttons through the real backend on mock PayPal, with no keys and no Claude. Run: node --test src/server/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import partnerProfiles from "../../../backend/agents/fixtures/helene/partners.json" with { type: "json" };
import { createMockPayments } from "../../../backend/payments/src/mock.ts";
import { reserveBalanceCents } from "../../../backend/policy/src/rules.ts";
import { newRun, type Action, type Session } from "../lib/liveSession.ts";
import { askAboutRun, MAX_QUESTIONS, runAction, type RunDeps } from "./liveRun.ts";
import { runSentinel } from "../../../backend/agents/src/sentinel/agent.ts";
import type { proposeAllocation } from "../../../backend/agents/src/allocator/agent.ts";
import { fileStore } from "./store.ts";

function setup(reserveCents = 0, timing?: "early" | "confirmed") {
  const store = fileStore(join(mkdtempSync(join(tmpdir(), "levee-run-")), "store.json"));
  const deps: RunDeps = { ...store, payments: createMockPayments(store.ledger), partners: () => partnerProfiles.map((p) => ({ ...p, email: `${p.id}@example.com` })) };
  if (reserveCents) void store.ledger.record({ kind: "reserve_credit", ref: "gift:1", paypalId: "GIFT-1", status: "CREDITED", amount: { currency_code: "USD", value: (reserveCents / 100).toFixed(2) }, at: new Date().toISOString() });
  const session: Session = { id: "browser-1", pledge: { amountCents: 1000, capCents: 6000, paymentToken: "TOKEN-1", chargedCents: 0, ...(timing && { timing }) }, gifts: [], run: newRun(), activity: [] };
  const press = async (...actions: Action[]) => {
    for (const action of actions) await runAction(session, action, deps);
    assert.equal(session.run.error, undefined, session.run.error);
  };
  return { store, session, press, deps };
}

test("a $10 pledge: $4 before landfall, $6 after, and Partner B's held share released on approval", async () => {
  const { session, press, store } = setup(5000);
  await press("fire");
  assert.equal(session.run.stage, "notice");
  await press("charge1");
  assert.deepEqual(session.run.t1?.charge && [session.run.t1.charge.grossCents, session.run.t1.charge.netCents], [400, 337]);
  // The Reserve adds half its balance with tranche 1.
  assert.equal(session.run.t1?.reserveCents, 2500);
  assert.equal(session.run.t1?.payout?.items.reduce((sum, i) => sum + i.cents, 0), 337 + 2500);
  assert.equal(reserveBalanceCents(await store.readLedger()), 2500);
  assert.ok(session.run.t1!.leadHours! > 50 && session.run.t1!.leadHours! < 54, `paid ${session.run.t1!.leadHours} hours before landfall`);
  // The sponsor matched the donor's $3.37 1:1: invoiced, paid by bank transfer, and paid on, split the way tranche 1 was.
  const match = session.run.t1!.match!;
  assert.deepEqual([match.sponsor, match.cents, match.paid], ["Harbor & Pine Co.", 337, true]);
  assert.ok(match.invoiceId);
  assert.equal(match.payout?.items.reduce((sum, i) => sum + i.cents, 0), 337);
  assert.ok(match.payout!.items.every((i) => i.status === "SUCCESS"));
  assert.ok(session.activity.some((x) => x.title === "PayPal invoice sent to Harbor & Pine Co. for its $3.37 match"));
  assert.ok(session.activity.some((x) => x.title === "Sent the sponsor's match to the partners' PayPal accounts"));

  await press("proof", "charge2");
  assert.equal(session.run.stage, "t2_paid");
  assert.equal(session.run.t2?.charge?.grossCents, 600);
  assert.deepEqual(session.run.t2?.payout?.items.map((i) => [i.partner, i.cents]), [["a", 318]]);
  assert.equal(session.run.t2?.heldCents, 212);

  await press("approve");
  assert.equal(session.run.stage, "done");
  assert.deepEqual(session.run.t2?.release?.items.map((i) => [i.partner, i.cents, i.status]), [["b", 212, "SUCCESS"]]);
  assert.equal(session.pledge?.chargedCents, 1000);
  // Real notices and a receipt reached the donor, and the story used its plain version: no Claude.
  assert.ok(session.activity.some((a) => a.title === "Notice sent to you" && a.detail.includes("$4.00")));
  assert.ok(session.activity.some((a) => a.title === "LEVee told you what your money did"));
  // The donor's own page finds them by kind: two notices, two charges with PayPal references, a receipt for each, one story.
  const kinds = (k: string) => session.activity.filter((a) => a.kind === k);
  assert.deepEqual([kinds("notice").length, kinds("charge").length, kinds("story").length], [2, 2, 1]);
  assert.ok(kinds("charge").every((c) => c.ref));
});

test("rejecting Partner B sends its held share to Partner A, and a skip charges nothing", async () => {
  const rejected = setup();
  await rejected.press("fire", "charge1", "proof", "charge2", "reject");
  assert.deepEqual(rejected.session.run.t2?.release?.items.map((i) => [i.partner, i.cents]), [["a", 212]]);

  const skipped = setup();
  await skipped.press("fire", "skip", "charge1");
  assert.equal(skipped.session.run.stage, "skipped");
  assert.equal(skipped.session.run.t1, undefined);
  assert.equal(skipped.session.pledge?.chargedCents, 0);
});

test("the yearly cap carries over between runs", async () => {
  const { session, press } = setup();
  for (let run = 0; run < 6; run++) await press("fire", "charge1", "proof", "charge2", "approve", "reset");
  assert.equal(session.pledge?.chargedCents, 6000);
  await press("fire");
  assert.equal(session.run.stage, "done");
  assert.ok(session.activity.some((a) => a.title === "Tranche 1: yearly cap reached"));
});

test("a confirmed-only pledge: nothing before landfall, the whole $10 after, and nothing at all with an empty Reserve", async () => {
  const withReserve = setup(5000, "confirmed");
  await withReserve.press("fire");
  // No donor charge in tranche 1, so there's no skip window: the Reserve's share goes out as the rules fire.
  assert.equal(withReserve.session.run.stage, "t1_paid");
  assert.equal(withReserve.session.run.t1?.charge, undefined);
  assert.equal(withReserve.session.run.t1?.reserveCents, 2500);
  assert.ok(withReserve.session.activity.some((a) => a.title === "Tranche 1: nothing charged to you"));
  await withReserve.press("proof", "charge2", "approve");
  assert.equal(withReserve.session.run.t2?.charge?.grossCents, 1000);
  assert.equal(withReserve.session.pledge?.chargedCents, 1000);
  assert.equal(withReserve.session.run.stage, "done");

  const alone = setup(0, "confirmed");
  await alone.press("fire");
  assert.equal(alone.session.run.stage, "done");
  assert.equal(alone.session.pledge?.chargedCents, 0);
  assert.ok(alone.session.activity.some((a) => a.title === "Tranche 1: nothing to collect"));
});

test("asking the Narrator about a run: it reads this donor's own charges, and each browser has a question limit", async (t) => {
  // No key, so the Narrator can't reach Claude and answers with its plain summary of the records. No call is made.
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t.after(() => {
    if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
  });
  const { session, press, deps } = setup(5000);
  const reader = { charge: async () => null, refund: async () => null };
  const ask = () => askAboutRun(session, "Where did my money go?", { ...deps, reader });

  const before = await ask();
  assert.equal(before.fromClaude, false);
  assert.doesNotMatch(before.text, /\$4\.00/, "nothing charged yet");

  await press("fire", "charge1");
  const after = await ask();
  assert.equal(after.fromClaude, false);
  assert.match(after.text, /\$4\.00/, "the plain summary has this run's $4 charge");
  assert.equal(session.asked, 2);

  session.asked = MAX_QUESTIONS;
  assert.match((await ask()).text, new RegExp(`${MAX_QUESTIONS} questions`));
  assert.equal(session.asked, MAX_QUESTIONS, "the limit isn't passed");
});

/** Claude, faked: Sentinel answers with this score, or a score for each advisory, and its signals are still worked out by code. */
const sentinelScoring = (score: number | ((advisory: number) => number)): typeof runSentinel => (snapshot) => {
  const confidence = typeof score === "number" ? score : score(snapshot.advisories.length);
  return runSentinel(snapshot, {
    beta: {
      messages: {
        parse: async () => ({
          stop_reason: "end_turn",
          model: "fake",
          id: "fake",
          usage: { input_tokens: 3000, output_tokens: 3000 },
          parsed_output: { confidence, sourcesAgree: "agree", summary: `Fake brief scoring ${confidence}.`, reasons: [{ text: "The advisories agree.", sources: ["gdacs-event"] }], exposed: [] },
        }),
      },
    },
  } as unknown as Parameters<typeof runSentinel>[1]);
};

const allocateSixtyForty: typeof proposeAllocation = async () => ({
  proposal: [
    { partnerId: "partner-a", shareBps: 6000, rationale: "Perry is where the track lands." },
    { partnerId: "partner-b", shareBps: 4000, rationale: "Valdosta is inland, on the right of the track." },
  ],
  summary: "Most to Perry.",
  source: "claude",
  excluded: [],
  audit: { agent: "allocator", at: new Date().toISOString(), inputSha256: "fake", llm: { model: "fake", messageId: "fake", usage: { inputTokens: 1000, outputTokens: 1000 } } },
});

test("live AI: unsure at advisory 6, Sentinel reads advisory 7, and the rules pass with the Allocator's split", async () => {
  const { session, deps } = setup(5000);
  await runAction(session, "fire", { ...deps, liveAgents: { sentinel: sentinelScoring((n) => (n <= 6 ? 66 : 74)), allocate: allocateSixtyForty } }, "live");
  assert.equal(session.run.error, undefined, session.run.error);
  assert.equal(session.run.stage, "notice");
  assert.equal(session.run.advisory, 7);
  assert.ok(session.activity.some((a) => a.title === "Advisory 6: no money moves yet" && a.detail.includes("confidence 66")));
  assert.ok(session.activity.some((a) => a.title === "Fixed rules met for Hurricane Helene" && a.detail.startsWith("GDACS advisory 7:") && a.detail.includes("Sentinel confidence 74")));
  assert.ok(session.activity.some((a) => a.tone === "ai" && a.title === "The Allocator proposed the split" && a.detail.includes("Partner A 60%")));
  // Two fake Sentinel calls at 3,000 tokens each way, and one Allocator call at 1,000.
  assert.equal(Number(session.run.aiCostUsd?.toFixed(4)), 0.0042);
  assert.deepEqual(session.run.aiSteps?.map((s) => [s.agent, s.decided]), [["Sentinel", "Confidence 66"], ["Sentinel", "Confidence 74"], ["Allocator", "Partner A 60%, Partner B 40%"]]);

  await runAction(session, "charge1", deps);
  assert.equal(session.run.error, undefined, session.run.error);
  const [a, b] = session.run.t1!.payout!.items;
  assert.ok(a.cents > b.cents, "Partner A gets the larger share");
});

test("live AI: still unsure at advisory 8, no money moves and the person chooses what next", async () => {
  const { session, deps } = setup(5000);
  await runAction(session, "fire", { ...deps, liveAgents: { sentinel: sentinelScoring(60), allocate: allocateSixtyForty } }, "live");
  assert.equal(session.run.error, undefined, session.run.error);
  assert.equal(session.run.stage, "idle");
  assert.deepEqual(session.run.belowLine, { confidence: 60, summary: "Fake brief scoring 60." });
  assert.equal(session.run.t1, undefined, "nothing charged or paid");
  assert.deepEqual(session.run.aiSteps?.map((s) => s.decided), ["Confidence 60", "Confidence 60", "Confidence 60"], "advisories 6, 7 and 8");
  assert.ok(session.activity.some((a) => a.title === "Rules not met: Sentinel scored 60 at advisory 8, and the rule needs 70"));

  await runAction(session, "fire", deps, "saved");
  assert.equal(session.run.error, undefined, session.run.error);
  assert.equal(session.run.stage, "notice", "the recorded run still works after");
  assert.equal(session.run.advisory, 6);
});
