// Usage: npm run pipeline -- <vault_id> <partner1-email> <partner2-email> [--live-llm]
// Cyclone Remal through createLevee, the one module the server calls, moving real sandbox money. The clock replays 2024.
// By default the agents' saved results stand in, so no LLM cost. --live-llm runs every agent for real, costing a few cents.
// PayPal's approval page needs a browser, so one saved vault stands in for all the donors. Partners and proof are sample data.
// So are the Reserve's past monthly gifts, written to the ledger as the webhook would. Partner B's sandbox account stands in for a sponsor,
// whose invoices are marked paid by bank transfer through PayPal's API, because paying through PayPal also needs a browser.
import { readFileSync } from "node:fs";
import { configFromEnv } from "../../payments/src/paypal.ts";
import { sandbox, usd, waitForBatch } from "../../payments/scripts/sandbox.ts";
import type { TrancheState } from "../../policy/src/engine.ts";
import { BAY_OF_BENGAL_CYCLONE as playbook, type Pledge } from "../../policy/src/playbook.ts";
import type { AllocationResult } from "../src/allocator/agent.ts";
import { createLevee, memoryKeyValue, type LeveePartner, type ProofUpload, type TickReport } from "../src/levee.ts";
import { toolkitReader } from "../src/narrator/reader.ts";
import type { ThreatBrief } from "../src/sentinel/agent.ts";
import { replaySnapshot } from "../src/sentinel/feeds.ts";
import type { VerifierResult } from "../src/verifier/agent.ts";
import { analyzePhoto, loadPack, sha256 } from "../src/verifier/proof.ts";
import { costUsd } from "../src/narrator/model.ts";

const args = process.argv.slice(2);
const live = args.includes("--live-llm");
const [vaultId, emailA, emailB] = args.filter((a) => !a.startsWith("--"));
if (!vaultId || !emailA || !emailB) throw new Error("Usage: npm run pipeline -- <vault_id> <partner1-email> <partner2-email> [--live-llm]");
if (live && !process.env.ANTHROPIC_API_KEY) throw new Error("--live-llm needs ANTHROPIC_API_KEY in agents/.env");
// Without a key, notices and stories fall back to their plain versions, so the default run really costs nothing.
if (!live) delete process.env.ANTHROPIC_API_KEY;

const root = new URL("../fixtures/remal/", import.meta.url);
const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const { client, ledger, payments } = sandbox();
const { clientId, clientSecret } = configFromEnv();
const kv = memoryKeyValue();
const audit: { agent: string; usage?: { inputTokens: number; outputTokens: number }; llm?: { usage: { inputTokens: number; outputTokens: number } } | null }[] = [];
const clock = { now: new Date() };
const current = { advisory: 1 };
const run = String(Date.now());
const eventKey = `replay-${run}-1001064`;
const emails: Record<string, string> = { "partner-a": emailA, "partner-b": emailB };
const partners = fixture<LeveePartner[]>("partners.json").map((p) => ({ ...p, email: emails[p.id] }));

const levee = createLevee({
  kv,
  ledger,
  readLedger: async () => ledger.rows,
  audit: async (entry) => void audit.push(entry as (typeof audit)[number]),
  payments,
  reader: toolkitReader({ clientId, clientSecret }),
  playbook,
  snapshots: async () => [replaySnapshot(current.advisory)],
  partners: async () => partners,
  sponsors: async () => [{ id: "sponsor-demo", email: emailB, businessName: "Demo Sponsor Inc.", matchBps: 5000, maxCentsPerTranche: 10_000 }],
  deliver: async (m) => console.log(`    -> ${m.kind} to ${m.donorId} [${m.language}]: ${m.text.replace(/\s+/g, " ").slice(0, 170)}...`),
  skipUrl: (trancheKey, pledgeId) => `https://levee.example/skip/${trancheKey}/${pledgeId}`,
  usdPerUnit: { USD: 1, BDT: 1 / 117 },
  now: () => clock.now,
  replayRunId: run,
  ...(!live && {
    agents: {
      assess: async (snapshot) => ({ brief: fixture<{ brief: ThreatBrief }>(`briefs/advisory-${snapshot.advisories.length}.json`).brief }),
      allocate: async () => fixture<AllocationResult>("allocations/t1.json"),
      verify: async (pack) => fixture<VerifierResult>(`verdicts/${pack.partnerId}.json`),
    },
  }),
});

function show(report: TickReport[]) {
  for (const r of report) {
    for (const a of r.actions) console.log(`    ${a}`);
    if (r.error) throw new Error(`Tick failed: ${r.error}`);
  }
}
const state = async (tranche: 1 | 2) => (await kv.get<TrancheState>(`tranche:${eventKey}:t${tranche}`))!;
async function showPaid(s: TrancheState) {
  const p = s.payout!;
  console.log(`    charged ${s.items.map((i) => (i.notCharged ? `${i.donorId} ${i.notCharged}` : `${i.donorId} ${money(i.cents)} ${i.result?.status} (net $${i.result?.net?.value})`)).join(", ")}`);
  console.log(`    donors' pool ${money(p.poolCents)}, Reserve ${money(p.reserveCents ?? 0)}: paid ${p.allocations.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}; held ${money(p.heldCents)}`);
  await showBatch(p.result!.payoutBatchId!);
}
// PayPal refusing a batch changes nothing: the next hourly tick sends the same one, under the same key.
async function untilPaid(tranche: 1 | 2) {
  let current = await state(tranche);
  for (let attempt = 1; current.status === "payout_denied" && attempt <= 3; attempt++) {
    console.log(`    PayPal refused batch ${current.payout?.result?.payoutBatchId ?? "(none)"}: ${current.payout?.result?.reason ?? "no reason given"}. Trying again on the next tick.`);
    clock.now = new Date(clock.now.getTime() + 60 * 60_000);
    show(await levee.tick());
    current = await state(tranche);
  }
  if (current.status !== "paid") throw new Error(`Tranche ${tranche} is ${current.status}: ${current.payout?.result?.reason ?? "no reason given"}`);
  return current;
}
async function showBatch(id: string) {
  const batch = await waitForBatch(client, id);
  console.log(`    PayPal batch ${id}: ${batch.items.map((i) => `${i.payout_item.sender_item_id.split(":").pop()} ${i.transaction_status}`).join(", ")}`);
}

// As the sponsor would. Goes through PayPal's own record, so checkInvoice reads the real status.
async function sponsorPays(tranche: 1 | 2) {
  const invoice = (await state(tranche)).invoices![0];
  const value = (invoice.cents / 100).toFixed(2);
  await client.post(`/v2/invoicing/invoices/${invoice.result!.invoiceId}/payments`, { method: "BANK_TRANSFER", payment_date: new Date().toISOString().slice(0, 10), amount: usd(value) });
  console.log(`    the sponsor pays its $${value} invoice ${invoice.result!.invoiceId}`);
}
async function showMatch(tranche: 1 | 2) {
  const payout = (await state(tranche)).invoices![0].payout;
  if (!payout) throw new Error(`Tranche ${tranche}'s match wasn't paid out`);
  console.log(`    sponsor money ${money(payout.netCents)} ${payout.status}: ${payout.paidTo.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}; held ${money(payout.heldCents)}`);
  await showBatch(payout.result!.payoutBatchId!);
}

// The photo Partner B reuses, as if Levee had seen it after an earlier storm.
const oldPhoto = readFileSync(new URL("proof/prior/old-photo-1.jpg", root));
const oldFacts = await analyzePhoto({ id: "old-photo-1", bytes: oldPhoto }, 360);
await kv.set("image:partner-c:earlier-storm-2020:old-photo-1", { sha256: sha256(oldPhoto), dhash: oldFacts.dhash, partnerId: "partner-c", eventKey: "earlier-storm-2020", imageId: "old-photo-1" });

await ledger.record({ kind: "subscription", ref: "donor-1", paypalId: `I-SAMPLE-${run}`, status: "ACTIVE", amount: usd("25.00"), at: "2024-01-01T00:00:00.000Z" });
for (const month of ["02", "03", "04", "05"]) {
  await ledger.record({ kind: "reserve_payment", ref: `I-SAMPLE-${run}`, paypalId: `SALE-SAMPLE-${run}-${month}`, status: "COMPLETED", amount: usd("25.00"), net: usd("23.64"), at: `2024-${month}-01T00:00:00.000Z` });
}
console.log(`The Reserve holds $${(await levee.reserveBalance()).value} from sample monthly gifts`);
// Those gifts and the sponsor's bank transfers never really reach the sandbox account, so one real charge puts that money there, with some spare for PayPal's payout fees.
const funding = await payments.chargePledge({ pledgeId: `funding-${run}`, chargeKey: `funding-${run}`, paymentTokenId: vaultId, amount: usd("500.00") });
if (funding.status !== "COMPLETED") throw new Error(`Couldn't fund the sandbox: ${funding.status} ${funding.reason ?? ""}`);
console.log(`Funded the sandbox with $${funding.net?.value} to stand for that money\n`);

const base = { paymentTokenId: vaultId, hazards: ["cyclone"], regions: [playbook.regionId], annualCap: usd("5000.00") };
const pledges: Pledge[] = [
  { ...base, id: `p1-${run}`, donorId: "donor-1", amountPerEvent: usd("800.00"), preference: "early" },
  { ...base, id: `p2-${run}`, donorId: "donor-2", amountPerEvent: usd("800.00"), preference: "early" },
  { ...base, id: `p3-${run}`, donorId: "donor-3", amountPerEvent: usd("100.00"), preference: "early" },
  { ...base, id: `p4-${run}`, donorId: "donor-4", amountPerEvent: usd("200.00"), preference: "confirmed" },
];
for (const p of pledges) await kv.set(`pledge:${p.id}`, p);
await kv.set("language:donor-1", "en");
await kv.set("language:donor-2", "es");
console.log(`Replaying Cyclone Remal as ${eventKey}, ${live ? "with every agent live" : "with saved agent results"}\n`);

if (live) {
  console.log("Concierge: one real chat turn, and a real PayPal approval page");
  const draft = await levee.pledgeChat([{ role: "user", content: "Give $25 for each cyclone that threatens the Bay of Bengal, at most $100 a year, as early as possible." }]);
  console.log(`    ${draft.status}: ${draft.reply.slice(0, 170)}`);
  if (!draft.policy || !draft.cardHash) throw new Error(`Concierge returned no card: ${draft.problems.join("; ")}`);
  const vault = await levee.confirmPledge({ donorId: "donor-5", policy: draft.policy, confirmedHash: draft.cardHash, language: "en" });
  console.log(`    approval page opened: ${vault.setupTokenId}\n`);
}

for (const n of [1, 2, 3]) {
  current.advisory = n;
  clock.now = new Date(replaySnapshot(n).asOf);
  console.log(`Tick at advisory ${n}, ${clock.now.toISOString()}`);
  show(await levee.tick());
}
console.log("\ndonor-3 uses the skip link in their notice");
console.log(`    skipped: ${await levee.skip(`${eventKey}:t1`, `p3-${run}`)}`);

clock.now = new Date(clock.now.getTime() + 60 * 60_000);
console.log(`\nTick an hour later, as the skip window closes, ${clock.now.toISOString()}`);
show(await levee.tick());
const first = await untilPaid(1);
await showPaid(first);
if (!first.payout?.reserveCents) throw new Error("Tranche 1 drew nothing from the Reserve");
console.log(`    the Reserve now holds $${(await levee.reserveBalance()).value}`);

console.log("\nAn hour later, same advisory, and the sponsor hasn't paid: nothing to do");
clock.now = new Date(clock.now.getTime() + 60 * 60_000);
const beforeIdle = ledger.rows.length;
show(await levee.tick());
if (ledger.rows.length !== beforeIdle) throw new Error("An idle tick moved money");

console.log("\nThe sponsor pays for tranche 1, and the next tick sends it on");
await sponsorPays(1);
clock.now = new Date(clock.now.getTime() + 60 * 60_000);
show(await levee.tick());
await showMatch(1);

for (const n of [4, 5, 6]) {
  current.advisory = n;
  clock.now = new Date(replaySnapshot(n).asOf);
  console.log(`\nTick at advisory ${n}, ${clock.now.toISOString()}`);
  show(await levee.tick());
}

clock.now = new Date("2024-05-27T00:00:00.000Z");
console.log(`\nOps confirms landfall from the bulletin, ${clock.now.toISOString()}`);
await levee.confirmLandfall(eventKey, { confirmedAt: "2024-05-26T18:30:00.000Z", source: "IMD National Bulletin No. 17" });
for (const id of ["partner-a", "partner-b"]) {
  const pack = loadPack(new URL(`proof/${id}/`, root));
  const upload: ProofUpload = { eventKey, partnerId: id, photos: pack.photos, receipts: pack.receipts, distribution: pack.distribution, sample: true };
  const result = await levee.submitProof(upload);
  console.log(`    ${id} proof: ${result.verdict}. ${result.summary.slice(0, 200)}`);
}

console.log("\nTick after both proofs");
show(await levee.tick());
const t2 = await state(2);
console.log(`    tranche 2 is ${t2.status}`);
if (t2.status === "awaiting_approval") {
  console.log("    over the ops limit, so one person approves it");
  await levee.approveTranche(`${eventKey}:t2`, "ops@levee");
}

clock.now = new Date(clock.now.getTime() + 60 * 60_000);
console.log(`\nTick as the tranche 2 skip window closes, ${clock.now.toISOString()}`);
show(await levee.tick());
const second = await untilPaid(2);
await showPaid(second);

const [open] = await levee.listOpenReviews();
if (!open) throw new Error("Expected Partner B's share to wait for review");
console.log(`\nA person reviews ${open.partnerId} (${open.verdict}): ${open.failedChecks.join("; ").slice(0, 220)}`);
const decided = await levee.decideReview(eventKey, open.partnerId, { decision: "reject", by: "ops@levee", note: "Photo reused from an earlier storm." });
for (const a of decided.actions) console.log(`    ${a}`);
const released = (await state(2)).payout!.heldForReview![0];
console.log(`    ${money(released.cents)} goes to ${released.paidTo!.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}; stranded ${money(released.strandedCents ?? 0)}`);
await showBatch(released.result!.payoutBatchId!);

console.log("\nThe sponsor pays for tranche 2, and the next tick sends it on, now that the review is decided");
await sponsorPays(2);
clock.now = new Date(clock.now.getTime() + 60 * 60_000);
show(await levee.tick());
await showMatch(2);

if (live) {
  console.log('\nNarrator: donor-1 asks "Where did my money go?"');
  const answer = await levee.askNarrator("donor-1", "Where did my money go?", true);
  console.log(`    ${answer.fromClaude ? "Claude" : `plain summary (${answer.audit.fallback})`}, records read: ${answer.recordsRead.join(", ")}\n    ${answer.text}`);
  console.log('\nNarrator: donor-1 asks "Where did my monthly Reserve gift go?"');
  const aboutReserve = await levee.askNarrator("donor-1", "Where did my monthly Reserve gift go?", true);
  console.log(`    ${aboutReserve.fromClaude ? "Claude" : `plain summary (${aboutReserve.audit.fallback})`}\n    ${aboutReserve.text}`);
}

console.log("\nGET /events/:id");
const view = (await levee.getEvent(eventKey))!;
for (const t of view.tranches) {
  console.log(`    tranche ${t.tranche} ${t.status}: donors' pool ${money(t.poolCents ?? 0)}, Reserve ${money(t.reserveCents)}, paid ${t.paid.map((p) => `${p.partnerName} ${money(p.cents)}`).join(", ")}`);
  for (const m of t.matches) console.log(`      ${m.sponsorId} ${m.status}: received ${money(m.receivedCents ?? 0)}, paid ${m.paid.map((p) => `${p.partnerName} ${money(p.cents)}`).join(", ")}`);
}
console.log(`    review: ${view.reviews.map((r) => `${r.partnerName} ${r.status}`).join(", ")}`);

console.log("\nGET /donors/donor-1/activity");
for (const c of await levee.donorActivity("donor-1")) console.log(`    tranche ${c.tranche}: $${c.amount.value} ${c.status}, fee $${c.fee?.value}, net $${c.net?.value}, reference ${c.captureId}`);

clock.now = new Date(clock.now.getTime() + 60 * 60_000);
const before = ledger.rows.length;
await levee.tick();
await levee.tick();
console.log(`\nTwo more ticks: ${ledger.rows.length - before} new ledger rows, so nothing moved twice. The Reserve holds $${(await levee.reserveBalance()).value}.`);
if (ledger.rows.length !== before) throw new Error("A re-run moved money");

const usages = audit.flatMap((a) => (a.usage ? [a.usage] : a.llm ? [a.llm.usage] : []));
const cost = usages.reduce((sum, u) => sum + costUsd(u), 0);
console.log(`Audit log: ${audit.length} entries.${live ? ` Agent LLM calls logged: ${usages.length}, about $${cost.toFixed(4)}, before notices.` : " No LLM calls this run."}`);
