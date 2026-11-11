import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { createMockPayments } from "../../payments/src/mock.ts";
import { memoryLedger, type Payments } from "../../payments/src/types.ts";
import { BAY_OF_BENGAL_CYCLONE as playbook, type MatchSponsor } from "../../policy/src/playbook.ts";
import type { AllocationResult, PartnerProfile } from "../src/allocator/agent.ts";
import { cardHash, policyFrom } from "../src/concierge/policy.ts";
import { createLevee, memoryKeyValue, type LeveePartner, type ProofUpload } from "../src/levee.ts";
import type { DonorMessage } from "../src/narrator/messages.ts";
import type { ThreatBrief } from "../src/sentinel/agent.ts";
import { replaySnapshot, type Snapshot } from "../src/sentinel/feeds.ts";
import type { VerifierResult } from "../src/verifier/agent.ts";

const fixtures = new URL("../fixtures/remal/", import.meta.url);
const briefOf = (n: number): ThreatBrief => JSON.parse(readFileSync(new URL(`briefs/advisory-${n}.json`, fixtures), "utf8")).brief;
const profiles = (): LeveePartner[] => JSON.parse(readFileSync(new URL("partners.json", fixtures), "utf8")).map((p: LeveePartner) => ({ ...p, email: `${p.id}@example.com` }));
const usd = (value: string) => ({ currency_code: "USD", value });
const landfall = { confirmedAt: "2024-05-26T18:30:00.000Z", source: "IMD bulletin" };
const reading = { amountPerEvent: 25, annualCap: 100, currency: "USD", hazardsAsked: ["cyclone"], coveredRegionAsked: true, otherPlacesAsked: [], preference: null, reserveMonthly: null, ambiguous: false };

function verdict(partnerId: string, value: VerifierResult["verdict"]): VerifierResult {
  return { partnerId, eventKey: "x", verdict: value, summary: `${partnerId} ${value}`, checks: value === "pass" ? [] : [{ rule: "No photo was used before", required: "none", actual: "photo-2", passed: false, severity: "integrity" }], concerns: [], photoFindings: [], caveats: [], audit: { agent: "verifier", at: "t", imagesSha256: [], llm: null } };
}

function setup(over: { deliver?: (m: DonorMessage) => Promise<void>; partners?: LeveePartner[]; payments?: Partial<Payments>; client?: Anthropic; assess?: (s: Snapshot) => Promise<{ brief: ThreatBrief }>; sponsors?: MatchSponsor[] } = {}) {
  const ledger = memoryLedger();
  const mock = createMockPayments(ledger);
  // Set to make every charge wait on PayPal, as a capture under review does.
  const pending = { nextPending: false };
  const payments: Payments = {
    ...mock,
    chargePledge: (input) => mock.chargePledge(pending.nextPending ? { ...input, paymentTokenId: "MOCK-PENDING" } : input),
    ...over.payments,
  };
  const clock = { now: new Date("2024-05-25T12:00:00.000Z") };
  const current: { snapshots: Snapshot[] } = { snapshots: [replaySnapshot(1)] };
  const delivered: DonorMessage[] = [];
  const audit: any[] = [];
  const calls = { assess: 0, allocate: [] as { tranche: number; partners: PartnerProfile[]; others: ThreatBrief[] }[], verify: [] as any[] };
  const flags = { allocateDown: false };
  const verdicts = new Map<string, VerifierResult["verdict"]>();
  const levee = createLevee({
    kv: memoryKeyValue(),
    ledger,
    readLedger: async () => ledger.rows,
    audit: async (e) => void audit.push(e),
    payments,
    reader: { charge: async () => null, refund: async () => null },
    playbook,
    snapshots: async () => current.snapshots,
    partners: async () => over.partners ?? profiles(),
    ...(over.sponsors && { sponsors: async () => over.sponsors! }),
    deliver: over.deliver ?? (async (m) => void delivered.push(m)),
    skipUrl: (t, p) => `https://levee.example/skip/${t}/${p}`,
    usdPerUnit: { USD: 1, BDT: 1 / 117 },
    now: () => clock.now,
    replayRunId: "test",
    ...(over.client && { client: over.client }),
    agents: {
      assess: over.assess ?? (async (s) => {
        calls.assess++;
        return { brief: briefOf(s.advisories.length) };
      }),
      allocate: async ({ partners, otherActive, tranche }): Promise<AllocationResult> => {
        if (flags.allocateDown) throw new Error("allocator down");
        calls.allocate.push({ tranche, partners, others: otherActive });
        const ids = partners.map((p) => p.id);
        const proposal = ids.length === 2 ? [{ partnerId: ids[0], shareBps: 6000, rationale: "closer" }, { partnerId: ids[1], shareBps: 4000, rationale: "further" }] : [{ partnerId: ids[0], shareBps: 10_000, rationale: "only one" }];
        return { proposal, summary: "split", source: "claude", excluded: [], audit: { agent: "allocator", at: "t", inputSha256: "x", llm: null } };
      },
      verify: async (pack) => {
        calls.verify.push(pack);
        return verdict(pack.partnerId, verdicts.get(pack.partnerId) ?? "pass");
      },
    },
  });
  const advisory = (n: number) => {
    const s = replaySnapshot(n);
    current.snapshots = [s];
    clock.now = new Date(s.asOf);
  };
  const advance = (minutes: number) => (clock.now = new Date(clock.now.getTime() + minutes * 60_000));
  return { levee, ledger, payments: pending, clock, current, delivered, audit, calls, flags, verdicts, advisory, advance };
}

// These tests replay Remal, so their pledges cover its region rather than the default Gulf Coast.
const remalPolicy = (r: never) => ({ ...policyFrom(r), regions: [playbook.regionId] });

const EVENT = "replay-test-1001064";
const upload = (partnerId: string): ProofUpload => ({ eventKey: EVENT, partnerId, photos: [], receipts: [], distribution: [{ beneficiaryId: "H-1", item: "rice sack", quantity: 60, date: "2024-05-26", location: "x" }] });

async function pledgeFor(s: ReturnType<typeof setup>, donorId = "d1", language = "en", over: Partial<typeof reading> = {}) {
  const policy = remalPolicy({ ...reading, ...over } as never);
  const { setupTokenId } = await s.levee.confirmPledge({ donorId, policy, confirmedHash: cardHash(policy), language });
  return s.levee.completePledge(setupTokenId);
}

// A pledge, then tranche 1 fired at advisory 3 and paid an hour later.
async function paidTranche1() {
  const s = setup();
  await pledgeFor(s);
  s.advisory(3);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  return s;
}
async function proofIn(partnersAndVerdicts: [string, VerifierResult["verdict"]][]) {
  const s = await paidTranche1();
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.levee.confirmLandfall(EVENT, landfall);
  for (const [id, v] of partnersAndVerdicts) {
    s.verdicts.set(id, v);
    await s.levee.submitProof(upload(id));
  }
  return s;
}

test("an advisory below the rules is assessed, doesn't fire, and pays for no Allocator", async () => {
  const s = setup();
  await pledgeFor(s);
  s.advisory(1);
  const [r] = await s.levee.tick();
  assert.deepEqual(r.actions[0], "assessed: confidence 50");
  assert.match(r.actions[1], /tranche 1 not fired: not met: Sentinel confidence/);
  assert.equal(s.calls.allocate.length, 0);
  assert.equal(s.ledger.rows.some((x) => x.kind === "charge"), false);
});

test("hourly ticks on the same advisory make no LLM calls", async () => {
  const s = setup();
  s.advisory(1);
  await s.levee.tick();
  s.advance(60);
  const [r] = await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  assert.equal(s.calls.assess, 1);
  assert.ok(r.actions.includes("nothing new to assess, no LLM call"));
});

test("once tranche 1 has fired an old brief isn't replaced, and after landfall nothing is assessed", async () => {
  const s = await paidTranche1();
  const before = s.calls.assess;
  s.advance(7 * 60);
  await s.levee.tick();
  assert.equal(s.calls.assess, before);
  s.advisory(4);
  await s.levee.tick();
  assert.equal(s.calls.assess, before + 1, "a new advisory still updates the map");
  await s.levee.confirmLandfall(EVENT, landfall);
  s.advisory(5);
  await s.levee.tick();
  assert.equal(s.calls.assess, before + 1);
});

test("a new advisory is assessed, and so is an old one once its brief is too old to act on", async () => {
  const s = setup();
  s.advisory(1);
  await s.levee.tick();
  s.advisory(2);
  await s.levee.tick();
  assert.equal(s.calls.assess, 2);
  s.advance(6 * 60 + 1);
  await s.levee.tick();
  assert.equal(s.calls.assess, 3);
});

test("a storm with no Levee coast in its path costs nothing", async () => {
  const s = setup();
  const far = replaySnapshot(1);
  s.current.snapshots = [{ ...far, advisories: far.advisories.map((a) => ({ ...a, points: a.points.map((p) => ({ ...p, lon: p.lon + 40 })) })) }];
  const [r] = await s.levee.tick();
  assert.equal(s.calls.assess, 0);
  assert.match(r.actions[0], /no Levee coast/);
});

test("the full tranche 1: fires at advisory 3, charges after the skip window, pays by the Allocator's split, sends one receipt", async () => {
  const s = setup();
  await pledgeFor(s);
  s.advisory(3);
  const [fired] = await s.levee.tick();
  assert.ok(fired.actions.includes("tranche 1 fired"));
  assert.equal(s.calls.allocate.length, 1);
  assert.equal(s.delivered.filter((m) => m.kind === "notice_tranche1").length, 1);
  assert.equal(s.ledger.rows.some((x) => x.kind === "charge"), false, "nothing charged during the skip window");

  s.advance(60);
  await s.levee.tick();
  const view = await s.levee.getEvent(EVENT);
  assert.equal(view?.tranches[0].status, "paid");
  assert.deepEqual(view?.tranches[0].paid.map((p) => [p.partnerName, p.cents]), [["Partner A", 550], ["Partner B", 366]]);
  assert.equal(s.delivered.filter((m) => m.kind === "receipt").length, 1);

  s.advance(60);
  await s.levee.tick();
  s.advisory(4);
  await s.levee.tick();
  assert.equal(s.delivered.filter((m) => m.kind === "receipt").length, 1, "no second receipt");
  assert.equal(s.ledger.rows.filter((x) => x.kind === "charge").length, 1, "no second charge");
  assert.equal(s.calls.allocate.length, 1, "no second allocation");
});

test("a notice that can't be delivered means that donor isn't charged", async () => {
  const s = setup({ deliver: async (m) => { if (m.kind.startsWith("notice") && m.donorId === "d1") throw new Error("mail down"); } });
  await pledgeFor(s, "d1");
  await pledgeFor(s, "d2");
  s.advisory(3);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  assert.equal(s.ledger.rows.filter((x) => x.kind === "charge").length, 1);
});

test("a receipt that can't be delivered is retried on the next tick", async () => {
  let down = true;
  const sent: DonorMessage[] = [];
  const s = setup({ deliver: async (m) => { if (m.kind === "receipt" && down) throw new Error("mail down"); sent.push(m); } });
  await pledgeFor(s);
  s.advisory(3);
  await s.levee.tick();
  s.advance(60);
  const [r] = await s.levee.tick();
  assert.ok(r.actions.some((a) => a.includes("failed, will retry")));
  down = false;
  await s.levee.tick();
  await s.levee.tick();
  assert.equal(sent.filter((m) => m.kind === "receipt").length, 1);
});

test("one storm failing doesn't stop another", async () => {
  const s = setup({ assess: async (snapshot) => {
    if (snapshot.event.id === 1) throw new Error("Claude declined");
    return { brief: briefOf(3) };
  } });
  await pledgeFor(s);
  const base = replaySnapshot(3);
  s.current.snapshots = [{ ...base, event: { ...base.event, id: 1 } }, base];
  s.clock.now = new Date(base.asOf);
  const report = await s.levee.tick();
  assert.match(report.find((r) => r.eventKey.endsWith("-1"))!.error!, /declined/);
  assert.ok(report.find((r) => r.eventKey === EVENT)!.actions.includes("tranche 1 fired"));
});

test("if firing throws, the next tick tries again without waiting for a new assessment", async () => {
  const s = setup();
  await pledgeFor(s);
  s.advisory(3);
  s.flags.allocateDown = true;
  const [failed] = await s.levee.tick();
  assert.match(failed.error!, /allocator down/);
  s.flags.allocateDown = false;
  s.advance(5);
  const [retried] = await s.levee.tick();
  assert.ok(retried.actions.includes("tranche 1 fired"));
  assert.equal(s.calls.assess, 1);
  s.advance(60);
  await s.levee.tick();
  assert.equal(s.calls.allocate.length, 1, "fires once");
  assert.equal(s.ledger.rows.filter((x) => x.kind === "charge").length, 1);
});

test("two storms at once: the Allocator sees the other, and a partner's commitments lower its capacity", async () => {
  const s = setup();
  await pledgeFor(s);
  const base = replaySnapshot(3);
  s.current.snapshots = [base];
  s.clock.now = new Date(base.asOf);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  const second = { ...base, event: { ...base.event, id: 2 } };
  s.current.snapshots = [second, { ...base, event: { ...base.event, id: 3 } }];
  await s.levee.tick();
  const call = s.calls.allocate.at(-1)!;
  assert.equal(call.others.length, 1);
  assert.equal(call.partners.find((p) => p.id === "partner-a")!.committedUsd, 5.5);
});

test("proof uses Levee's own figures, whatever the upload claims", async () => {
  const s = await proofIn([]);
  const forged = { ...upload("partner-a"), fundsReceivedAt: "2000-01-01T00:00:00.000Z", landfallAt: "2099-01-01T00:00:00.000Z", amountReceived: usd("99999.00"), serviceArea: { name: "Anywhere", lat: 0, lon: 0, radiusKm: 99999, utcOffsetMinutes: 0 } } as ProofUpload;
  await s.levee.submitProof(forged);
  const pack = s.calls.verify[0];
  assert.equal(pack.amountReceived.value, "5.50");
  assert.equal(pack.landfallAt, landfall.confirmedAt);
  assert.equal(pack.fundsReceivedAt, "2024-05-26T01:00:00.000Z");
  assert.deepEqual([pack.serviceArea.name, pack.serviceArea.radiusKm, pack.serviceArea.utcOffsetMinutes], ["Mongla, Bagerhat", 150, 360]);
});

test("proof is refused before landfall, from an unknown partner, or for an unknown storm", async () => {
  const s = await paidTranche1();
  await assert.rejects(s.levee.submitProof(upload("partner-a")), /once landfall is confirmed/);
  await s.levee.confirmLandfall(EVENT, landfall);
  await assert.rejects(s.levee.submitProof(upload("stranger")), /Unknown partner/);
  await assert.rejects(s.levee.submitProof({ ...upload("partner-a"), eventKey: "nope" }), /No event/);
});

test("landfall needs a source and a known storm", async () => {
  const s = await paidTranche1();
  await assert.rejects(s.levee.confirmLandfall(EVENT, { confirmedAt: "t", source: " " }), /source/);
  await assert.rejects(s.levee.confirmLandfall("nope", landfall), /No event/);
});

test("tranche 2 waits for every partner's proof", async () => {
  const s = await proofIn([["partner-a", "pass"]]);
  await s.levee.tick();
  assert.equal((await s.levee.getEvent(EVENT))?.tranches.length, 1);
  s.verdicts.set("partner-b", "human");
  await s.levee.submitProof(upload("partner-b"));
  const [r] = await s.levee.tick();
  assert.ok(r.actions.includes("tranche 2 fired"));
});

test("after the proof deadline tranche 2 goes ahead, with a held share for the partner who sent nothing", async () => {
  const s = await proofIn([["partner-a", "pass"]]);
  s.clock.now = new Date(new Date(landfall.confirmedAt).getTime() + 24 * 3_600_000 + 60_000);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  const view = await s.levee.getEvent(EVENT);
  assert.deepEqual(view?.tranches[1].heldForReview.map((h) => [h.partnerName, h.status]), [["Partner B", "awaiting_review"]]);
  assert.equal((await s.levee.listOpenReviews())[0].verdict, "no_proof");
});

test("nobody passing means no charge and no Allocator, and approving one person's review lets it go ahead", async () => {
  const s = await proofIn([["partner-a", "partial"], ["partner-b", "human"]]);
  const before = s.ledger.rows.filter((x) => x.kind === "charge").length;
  const allocations = s.calls.allocate.length;
  const [r] = await s.levee.tick();
  assert.ok(r.actions.some((a) => a.includes("tranche 2 waiting")));
  assert.equal(s.calls.allocate.length, allocations);
  assert.equal(s.ledger.rows.filter((x) => x.kind === "charge").length, before);
  const { actions } = await s.levee.decideReview(EVENT, "partner-a", { decision: "approve", by: "ops" });
  assert.ok(actions.includes("tranche 2 fired"));
});

test("the whole storm: a flagged partner is held, a person rejects, the money moves, and each donor gets one story with the real lead time", async () => {
  const s = await proofIn([["partner-a", "pass"], ["partner-b", "human"]]);
  await s.levee.tick();
  s.advance(60);
  const [paid] = await s.levee.tick();
  assert.ok(paid.actions.some((a) => a.includes("story to d1")));
  const held = await s.levee.getEvent(EVENT);
  assert.deepEqual(held?.tranches[1].paid.map((p) => p.partnerId), ["partner-a"]);
  assert.equal(held?.reviews[0].summary, "partner-b human");

  await s.levee.decideReview(EVENT, "partner-b", { decision: "reject", by: "ops@levee", note: "Reused photo" });
  const after = await s.levee.getEvent(EVENT);
  assert.deepEqual(after?.tranches[1].paid.map((p) => p.partnerId), ["partner-a"]);
  assert.equal(after?.tranches[1].paid[0].cents, after?.tranches[1].poolCents);
  assert.deepEqual(await s.levee.listOpenReviews(), []);

  await s.levee.tick();
  const stories = s.delivered.filter((m) => m.kind === "story");
  assert.equal(stories.length, 1);
  assert.match(stories[0].text, /you gave \$25\.00/);
});

test("a partner sees only its own share, money, proof and review, and not who decided", async () => {
  const s = await proofIn([["partner-a", "pass"], ["partner-b", "human"]]);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  await s.levee.decideReview(EVENT, "partner-b", { decision: "reject", by: "ops@levee", note: "Reused photo" });
  const event = await s.levee.getEvent(EVENT);

  const [a] = await s.levee.partnerEvents("partner-a");
  assert.equal(a.eventKey, EVENT);
  assert.equal(a.proofOpen, true);
  assert.equal(a.proof?.verdict, "pass");
  assert.equal(a.review, null);
  const split = (i: number) => event!.tranches[i].paid.filter((p) => p.partnerId === "partner-a").reduce((sum, p) => sum + p.cents, 0);
  assert.equal(a.tranches[0].paidCents, split(0), "tranche 1 counts only partner-a's money");
  assert.ok(split(1) > 0 && a.tranches[1].paidCents > split(1), "tranche 2 adds partner-b's rejected share, which went to partner-a");
  assert.ok(a.tranches[0].rationale, "it sees the Allocator's reason for its own share");

  const [b] = await s.levee.partnerEvents("partner-b");
  assert.equal(b.proof?.verdict, "human");
  assert.deepEqual(b.review, { status: "rejected", verdict: "human", note: "Reused photo", decidedAt: b.review?.decidedAt });
  assert.equal(b.tranches[1].paidCents, 0);
  assert.equal(b.tranches[1].heldCents, 0, "a rejected share is no longer held for it");
  assert.doesNotMatch(JSON.stringify(b), /ops@levee|partner-a/, "no ops email and no other partner");

  assert.deepEqual(await s.levee.partnerEvents("someone-else"), []);
});

test("the lead time in a story is worked out from the real payment and landfall times", async () => {
  const seen: string[] = [];
  const client = { beta: { messages: { create: async (p: any) => {
    seen.push(p.messages[0].content);
    return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: "You gave {{youGave}}, and {{reachedResponders}} reached responders." }] };
  } } } } as unknown as Anthropic;
  const s = setup({ client });
  await pledgeFor(s);
  s.advisory(3);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.levee.confirmLandfall(EVENT, landfall);
  await s.levee.submitProof(upload("partner-a"));
  await s.levee.submitProof(upload("partner-b"));
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  assert.match(seen[0], /"firstPaymentHoursBeforeLandfall":17\.5/);
});

test("a pledge can't be finished without a confirmed card, and finishing twice makes one pledge", async () => {
  const s = setup();
  await assert.rejects(s.levee.completePledge("made-up-token"), /No confirmed pledge/);
  const policy = remalPolicy(reading as never);
  await assert.rejects(s.levee.confirmPledge({ donorId: "d1", policy, confirmedHash: "wrong" }), /doesn't match/);
  const { setupTokenId } = await s.levee.confirmPledge({ donorId: "d1", policy, confirmedHash: cardHash(policy) });
  const first = await s.levee.completePledge(setupTokenId);
  const again = await s.levee.completePledge(setupTokenId);
  assert.equal(first.id, again.id);
  assert.equal(s.ledger.rows.filter((r) => r.kind === "vault_saved").length, 1);
  s.advisory(3);
  await s.levee.tick();
  assert.equal(s.delivered.filter((m) => m.kind === "notice_tranche1").length, 1);
});

test("a donor's language from their pledge reaches their notices", async () => {
  const client = { beta: { messages: { create: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: "Tempête {{storm}}, {{amount}}, {{chargeAt}}, {{skipUrl}}" }] }) } } } as unknown as Anthropic;
  const s = setup({ client });
  await pledgeFor(s, "d1", "fr");
  s.advisory(3);
  await s.levee.tick();
  const notice = s.delivered.find((m) => m.kind === "notice_tranche1")!;
  assert.equal(notice.language, "fr");
  assert.match(notice.text, /^Tempête REMAL-24, \$10\.00/);
});

test("a skip from the notice's link reaches the engine", async () => {
  const s = setup();
  const pledge = await pledgeFor(s);
  s.advisory(3);
  await s.levee.tick();
  assert.equal(await s.levee.skip(`${EVENT}:t1`, pledge.id), true);
  s.advance(60);
  await s.levee.tick();
  assert.equal(s.ledger.rows.some((x) => x.kind === "charge"), false);
  assert.deepEqual((await s.levee.donorActivity("d1")).map((c) => c.status), ["SKIPPED"]);
});

test("asking for a refund goes through the engine's rules", async () => {
  const client = { beta: { messages: { toolRunner: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ answer: "A review will check that.", refundRequestedFor: "charge-1" }) }] }) } } } as unknown as Anthropic;
  const inWindow = setup({ client });
  await pledgeFor(inWindow);
  inWindow.advisory(3);
  await inWindow.levee.tick();
  inWindow.advance(60);
  await inWindow.levee.tick();
  const yes = await inWindow.levee.askNarrator("d1", "I want my money back");
  assert.equal(yes.refund?.refunded, true);
  assert.ok(inWindow.audit.some((e) => e.agent === "narrator"), "the question reaches the audit log");

  inWindow.advance(48 * 60 + 1);
  const late = setup({ client });
  await pledgeFor(late);
  late.advisory(3);
  await late.levee.tick();
  late.advance(60);
  await late.levee.tick();
  late.advance(49 * 60);
  const no = await late.levee.askNarrator("d1", "I want my money back");
  assert.equal(no.refund?.refunded, false);
  assert.match(no.refund!.reason, /review window/);
});

test("a large tranche waits for one click from ops", async () => {
  const s = setup();
  for (const d of ["d1", "d2", "d3"]) await pledgeFor(s, d, "en", { amountPerEvent: 1000, annualCap: 2000 });
  s.advisory(3);
  await s.levee.tick();
  assert.equal(s.delivered.length, 0);
  assert.equal((await s.levee.getEvent(EVENT))?.tranches[0].status, "awaiting_approval");
  await s.levee.approveTranche(`${EVENT}:t1`, "ops@levee");
  assert.equal(s.delivered.length, 3);
});

test("every agent's decision reaches the audit log", async () => {
  const s = await proofIn([["partner-a", "pass"], ["partner-b", "human"]]);
  const agents = new Set(s.audit.map((e) => e.agent));
  for (const a of ["policy-engine", "allocator", "verifier"]) assert.ok(agents.has(a), a);
});

test("an unknown event has no view", async () => {
  assert.equal(await setup().levee.getEvent("nope"), undefined);
});

test("the Reserve's share goes out with tranche 1, shows on the event, and leaves the balance", async () => {
  const s = setup();
  await pledgeFor(s);
  await s.ledger.record({ kind: "reserve_payment", ref: "I-SUB", paypalId: "S1", status: "COMPLETED", amount: usd("21.00"), net: usd("20.00"), at: "t" });
  assert.equal((await s.levee.reserveBalance()).value, "20.00");
  s.advisory(3);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  assert.equal((await s.levee.getEvent(EVENT))?.tranches[0].reserveCents, 1000);
  assert.equal((await s.levee.reserveBalance()).value, "10.00");
});

test("a sponsor's money is paid out by the hourly job, counts as received in proof, and shows on the event", async () => {
  const s = setup({ sponsors: [{ id: "acme", email: "giving@acme.example.com", businessName: "Acme", matchBps: 5000, maxCentsPerTranche: 100_000 }] });
  await pledgeFor(s);
  s.advisory(3);
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  const waiting = (await s.levee.getEvent(EVENT))!.tranches[0].matches[0];
  assert.equal(waiting.status, "awaiting_sponsor");
  assert.ok(waiting.payUrl);
  const invoice = s.ledger.rows.find((r) => r.kind === "invoice")!;
  await s.ledger.record({ ...invoice, status: "PAID" });
  s.advance(60);
  await s.levee.tick();
  const paid = (await s.levee.getEvent(EVENT))!.tranches[0].matches[0];
  assert.equal(paid.status, "paid_out");
  assert.deepEqual(paid.paid.map((p) => p.partnerName), ["Partner A", "Partner B"]);

  s.clock.now = new Date("2024-05-27T00:00:00.000Z");
  await s.levee.confirmLandfall(EVENT, landfall);
  await s.levee.submitProof(upload("partner-a"));
  assert.equal(s.calls.verify[0].amountReceived.value, ((550 + paid.paid[0].cents) / 100).toFixed(2));
});

test("a charge that completes late sends its real receipt, saying where the money went", async () => {
  const s = setup();
  await pledgeFor(s);
  s.advisory(3);
  s.payments.nextPending = true;
  await s.levee.tick();
  s.advance(60);
  await s.levee.tick();
  const pending = s.ledger.rows.find((r) => r.kind === "charge" && r.status === "PENDING")!;
  assert.ok(s.delivered.some((m) => m.kind === "receipt_pending"));
  await s.ledger.record({ ...pending, status: "COMPLETED", net: usd("9.16") });
  s.advance(60);
  await s.levee.tick();
  await s.levee.tick();
  assert.equal(s.delivered.filter((m) => m.kind === "receipt_reserve").length, 1);
});

test("a donor can stop their monthly gift, once", async () => {
  const s = setup();
  assert.equal(await s.levee.cancelReserve("d1"), false);
  const policy = remalPolicy({ ...reading, reserveMonthly: 10 } as never);
  await s.levee.confirmPledge({ donorId: "d1", policy, confirmedHash: cardHash(policy) });
  assert.equal(await s.levee.cancelReserve("d1"), true);
  assert.equal(await s.levee.cancelReserve("d1"), false);
});

test("Narrator is told about the Reserve when the donor has one", async () => {
  const seen: string[] = [];
  const client = { beta: { messages: { toolRunner: async (p: any) => {
    seen.push(p.messages[0].content);
    return { stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ answer: "It is active.", refundRequestedFor: null }) }] };
  } } } } as unknown as Anthropic;
  const s = setup({ client });
  const policy = remalPolicy({ ...reading, reserveMonthly: 10 } as never);
  await s.levee.confirmPledge({ donorId: "d1", policy, confirmedHash: cardHash(policy) });
  const answer = await s.levee.askNarrator("d1", "Is my Reserve gift running?");
  assert.equal(answer.fromClaude, true);
  assert.match(seen[0], /My Reserve gift: .*"status":"ACTIVE"/);
});
