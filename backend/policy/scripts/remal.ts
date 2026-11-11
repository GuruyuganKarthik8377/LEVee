// Usage: npm run remal -- <vault_id> <partner1-email> <partner2-email>
// The thin slice with no screens: Sentinel's saved Remal briefs drive the Policy Engine, which moves real sandbox money.
// The clock replays 2024. Partners, proof and the sponsor are sample data. The Allocator's split and the Verifier's verdicts are saved results, so no LLM cost.
import { readFileSync } from "node:fs";
import type { AllocationResult, PartnerProfile } from "../../agents/src/allocator/agent.ts";
import type { ThreatBrief } from "../../agents/src/sentinel/agent.ts";
import type { VerifierResult } from "../../agents/src/verifier/agent.ts";
import { sandbox, usd, waitForBatch } from "../../payments/scripts/sandbox.ts";
import { createPolicyEngine, memoryReviews, memoryStore, type TrancheState } from "../src/engine.ts";
import { BAY_OF_BENGAL_CYCLONE as playbook, type Pledge } from "../src/playbook.ts";

const [vaultId, emailA, emailB] = process.argv.slice(2);
if (!vaultId || !emailA || !emailB) throw new Error("Usage: npm run remal -- <vault_id> <partner1-email> <partner2-email>");

const { client, ledger, payments } = sandbox();
const clock = { now: new Date() };
const run = Date.now();
const eventKey = `remal-${run}`;
const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../../agents/fixtures/remal/${name}`, import.meta.url), "utf8"));
const emails: Record<string, string> = { "partner-a": emailA, "partner-b": emailB };
const partners = fixture<PartnerProfile[]>("partners.json").map((p) => ({ id: p.id, email: emails[p.id], capacityCents: (p.capacityUsd - p.committedUsd) * 100 }));
const allocation = fixture<AllocationResult>("allocations/t1.json");
// Partner B's sandbox account stands in for a company that agreed to match half of what goes out.
const sponsors = [{ id: "sponsor-demo", email: emailB, businessName: "Demo Sponsor Inc.", matchBps: 5000, maxCentsPerTranche: 100_000 }];
// One sandbox donor stands in for all three, each pledge with its own limits.
const base = { paymentTokenId: vaultId, hazards: ["cyclone"], regions: [playbook.regionId] };
const pledges: Pledge[] = [
  { ...base, id: `pledge-early-${run}`, donorId: "donor-1", amountPerEvent: usd("25.00"), annualCap: usd("60.00"), preference: "early" },
  { ...base, id: `pledge-skips-${run}`, donorId: "donor-2", amountPerEvent: usd("10.00"), annualCap: usd("60.00"), preference: "early" },
  { ...base, id: `pledge-confirmed-${run}`, donorId: "donor-3", amountPerEvent: usd("15.00"), annualCap: usd("60.00"), preference: "confirmed" },
];

const engine = createPolicyEngine({
  payments,
  ledger,
  store: memoryStore(),
  reviews: memoryReviews(),
  playbook,
  readLedger: async () => ledger.rows,
  notify: async (n) => console.log(`    notice to ${n.donorId}: ${n.eventName}, $${n.amount.value}, skip until ${n.skipUntil}`),
  audit: async () => {},
  now: () => clock.now,
});

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
function showPayout(state: TrancheState) {
  const p = state.payout!;
  console.log(`    charged ${state.items.map((i) => (i.notCharged ? `${i.donorId} ${i.notCharged}` : `${i.donorId} ${money(i.cents)} ${i.result?.status} (net $${i.result?.net?.value})`)).join(", ")}`);
  console.log(`    pool ${money(p.poolCents)} net of fees; paying ${p.allocations.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}; held ${money(p.heldCents)}; batch ${p.result?.payoutBatchId} ${state.status}`);
}

console.log(`Replaying Cyclone Remal as event ${eventKey}\n\nTranche 1: each advisory's saved brief goes through the playbook`);
let firstFired: TrancheState | undefined;
for (const n of [1, 2, 3, 4]) {
  const { brief } = JSON.parse(readFileSync(new URL(`../../agents/fixtures/remal/briefs/advisory-${n}.json`, import.meta.url), "utf8")) as { brief: ThreatBrief };
  clock.now = new Date(brief.asOf);
  const d = await engine.evaluateTranche1({ eventKey, brief, pledges, partners, proposal: allocation.proposal, sponsors });
  console.log(`  Advisory ${n}, ${brief.asOf}: confidence ${brief.confidence}, ${brief.landfall?.leadHours} h out -> ${d.fired ? "FIRES" : `no (${d.reason})`}`);
  for (const c of d.checks) console.log(`    [${c.passed ? "x" : " "}] ${c.rule}: ${c.actual} (needs ${c.required})`);
  if (d.fired) {
    firstFired = d.state;
    console.log(`    left out: ${d.excluded.map((e) => `${e.pledgeId.split("-")[1]} (${e.reason})`).join(", ")}`);
    console.log(`    donor-2 taps skip: ${await engine.skip(`${eventKey}:t1`, pledges[1].id)}`);
    clock.now = new Date(new Date(brief.asOf).getTime() + 60 * 60_000);
    const state = await engine.execute(`${eventKey}:t1`);
    console.log(`    Allocator: ${allocation.summary}`);
    showPayout(state);
    for (const i of state.invoices ?? []) console.log(`    match invoice: ${money(i.cents)} to ${i.sponsorId}, ${i.result?.status} ${i.result?.invoiceId}`);
    const paid = await waitForBatch(client, state.payout!.result!.payoutBatchId!);
    console.log(`    PayPal: ${paid.items.map((i) => `${i.payout_item.sender_item_id.split(":").pop()} ${i.transaction_status}`).join(", ")}`);
  }
}
if (!firstFired) throw new Error("Tranche 1 never fired");

console.log("\nTranche 2: landfall confirmed, and the Verifier has reviewed each partner's proof");
clock.now = new Date("2024-05-27T06:00:00.000Z");
const verdicts = partners.map((p) => {
  const { partnerId, verdict, summary, checks } = JSON.parse(readFileSync(new URL(`../../agents/fixtures/remal/verdicts/${p.id}.json`, import.meta.url), "utf8")) as VerifierResult;
  console.log(`  ${partnerId}: ${verdict}. ${summary}`);
  return { partnerId, verdict, summary, failedChecks: checks.filter((c) => !c.passed).map((c) => `${c.rule}: ${c.actual}`) };
});
const landfall = { confirmedAt: "2024-05-26T18:30:00.000Z", source: "IMD National Bulletin No. 17" };

const blocked = await engine.evaluateTranche2({ eventKey, eventName: "REMAL-24", verdicts, pledges, partners });
console.log(`  Before confirmation: ${blocked.fired ? "FIRES" : `no (${blocked.reason})`}`);
const t2 = await engine.evaluateTranche2({ eventKey, eventName: "REMAL-24", landfall, verdicts, pledges, partners, sponsors });
console.log(`  With confirmation: ${t2.fired ? "FIRES" : `no (${t2.reason})`}; left out: ${t2.excluded.map((e) => `${e.pledgeId.split("-")[1]} (${e.reason})`).join(", ")}`);
if (!t2.fired) throw new Error("Tranche 2 did not fire");
clock.now = new Date(clock.now.getTime() + 60 * 60_000);
const second = await engine.execute(`${eventKey}:t2`);
showPayout(second);
for (const i of second.invoices ?? []) console.log(`    match invoice: ${money(i.cents)} to ${i.sponsorId}, ${i.result?.status} ${i.result?.invoiceId}`);
const paid2 = await waitForBatch(client, second.payout!.result!.payoutBatchId!);
console.log(`    PayPal: ${paid2.items.map((i) => `${i.payout_item.sender_item_id.split(":").pop()} ${i.transaction_status}`).join(", ")}`);

console.log(`    held for review: ${(second.payout!.heldForReview ?? []).map((h) => `${h.partnerId} ${money(h.cents)}`).join(", ")}`);
const [open] = await engine.listOpenReviews();
console.log(`\nA person reviews ${open.partnerId} (${open.verdict}): ${open.failedChecks.join("; ")}`);
const { state: afterReview } = await engine.decideReview(eventKey, open.partnerId, { decision: "reject", by: "ops@levee", note: "Photo reused from an earlier storm." });
const released = afterReview!.payout!.heldForReview![0];
console.log(`  Rejected. ${money(released.cents)} goes to ${released.paidTo!.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}; batch ${released.result?.payoutBatchId}; stranded ${money(released.strandedCents ?? 0)}`);
const paid3 = await waitForBatch(client, released.result!.payoutBatchId!);
console.log(`    PayPal: ${paid3.items.map((i) => `${i.payout_item.sender_item_id.split(":").pop()} ${i.transaction_status}`).join(", ")}`);
console.log(`  Tranche 2 now: ${afterReview!.payout!.allocations.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}`);

console.log("\nRun again, as an hourly job would:");
const before = ledger.rows.length;
await engine.execute(`${eventKey}:t1`);
await engine.execute(`${eventKey}:t2`);
console.log(`  ${ledger.rows.length - before} new ledger rows, so nothing moved twice.`);
if (ledger.rows.length !== before) throw new Error("A re-run moved money");
