// Usage: npm run helene -- <vault_id> <partner1-email> <partner2-email>
// Hurricane Helene through createLevee with real Claude and real sandbox money, saving what the website shows to fixtures/helene/run.json.
// The clock replays 2024. Partners and proof are sample data, one saved vault stands in for every donor, and Partner B's sandbox
// account stands in for a sponsor whose first invoice is marked paid by bank transfer. It stops if Claude's cost passes MAX_COST_USD.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { configFromEnv } from "../../payments/src/paypal.ts";
import { sandbox, usd, waitForBatch } from "../../payments/scripts/sandbox.ts";
import type { TrancheState } from "../../policy/src/engine.ts";
import { US_GULF_HURRICANE as playbook, type Pledge } from "../../policy/src/playbook.ts";
import { createLevee, memoryKeyValue, type LeveePartner, type ProofUpload } from "../src/levee.ts";
import { costUsd } from "../src/narrator/model.ts";
import { toolkitReader } from "../src/narrator/reader.ts";
import type { ThreatBrief } from "../src/sentinel/agent.ts";
import { replaySnapshot } from "../src/sentinel/feeds.ts";
import { analyzePhoto, sha256 } from "../src/verifier/proof.ts";
import { placeholderPhoto, receiptImage } from "./make-sample-proof.ts";

const MAX_COST_USD = 0.25;
const LANDFALL = "2024-09-27T03:10:00.000Z";
const PROOF_OPENS = "2024-09-27T09:00:00.000Z";
const LAST_ADVISORY_BEFORE_PROOF = 15;

const [vaultId, emailA, emailB] = process.argv.slice(2);
if (!vaultId || !emailA || !emailB) throw new Error("Usage: npm run helene -- <vault_id> <partner1-email> <partner2-email>");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("Needs ANTHROPIC_API_KEY in agents/.env");

const fixtures = new URL("../fixtures/helene/", import.meta.url);
const { client, ledger, payments } = sandbox();
const { clientId, clientSecret } = configFromEnv();
const kv = memoryKeyValue();
const run = String(Date.now());
const eventKey = `replay-${run}-1001101`;
const clock = { now: new Date() };
const current = { advisory: 1 };
const emails: Record<string, string> = { "partner-a": emailA, "partner-b": emailB };
const partners: LeveePartner[] = JSON.parse(readFileSync(new URL("partners.json", fixtures), "utf8")).map((p: LeveePartner) => ({ ...p, email: emails[p.id] }));

type Usage = { inputTokens: number; outputTokens: number };
type Logged = { agent: string; usage?: Usage; llm?: { usage: Usage } | null };
const spend = { usd: 0, calls: 0, byAgent: {} as Record<string, number> };
function addCost(entry: Logged) {
  const usage = entry.usage ?? entry.llm?.usage;
  if (!usage) return;
  spend.usd += costUsd(usage);
  spend.calls++;
  spend.byAgent[entry.agent] = (spend.byAgent[entry.agent] ?? 0) + costUsd(usage);
  if (spend.usd > MAX_COST_USD) throw new Error(`Stopping: Claude has cost about $${spend.usd.toFixed(4)}, over the $${MAX_COST_USD} limit`);
}

const levee = createLevee({
  kv,
  ledger,
  readLedger: async () => ledger.rows,
  audit: async (entry) => addCost(entry as Logged),
  payments,
  reader: toolkitReader({ clientId, clientSecret }),
  playbook,
  snapshots: async () => [replaySnapshot(current.advisory, "helene")],
  partners: async () => partners,
  sponsors: async () => [{ id: "sponsor-demo", email: emailB, businessName: "Demo Sponsor Inc.", matchBps: 5000, maxCentsPerTranche: 15_000 }],
  deliver: async () => {},
  skipUrl: (trancheKey, pledgeId) => `https://levee.example/skip/${trancheKey}/${pledgeId}`,
  usdPerUnit: { USD: 1 },
  now: () => clock.now,
  replayRunId: run,
});

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const state = (tranche: 1 | 2) => kv.get<TrancheState>(`tranche:${eventKey}:t${tranche}`);
const event = () => kv.get<{ brief: ThreatBrief }>(`event:${eventKey}`);
const hoursFrom = (iso: string) => (Date.parse(iso) - Date.parse(LANDFALL)) / 3_600_000;
const later = (minutes: number) => (clock.now = new Date(clock.now.getTime() + minutes * 60_000));

async function tick() {
  const [report] = await levee.tick();
  for (const a of report?.actions ?? []) if (!a.startsWith("receipt") && !a.startsWith("story")) console.log(`    ${a}`);
  return report?.error;
}

/** Runs until a tranche is paid: one person's approval if it's over the limit, then the skip window, then the charges and payout. */
async function settle(tranche: 1 | 2) {
  if ((await state(tranche))?.status === "awaiting_approval") {
    console.log("    over the ops limit, so one person approves it");
    await levee.approveTranche(`${eventKey}:t${tranche}`, "ops@levee");
  }
  later(60);
  const firedAt = clock.now.toISOString();
  const error = await tick();
  if (error) throw new Error(error);
  for (let attempt = 1; (await state(tranche))?.status === "payout_denied" && attempt <= 3; attempt++) {
    console.log(`    PayPal refused the batch: ${(await state(tranche))?.payout?.result?.reason}. Trying again on the next tick.`);
    later(60);
    await tick();
  }
  const paid = (await state(tranche))!;
  if (paid.status !== "paid") throw new Error(`Tranche ${tranche} is ${paid.status}: ${paid.payout?.result?.reason ?? ""}`);
  const batch = await waitForBatch(client, paid.payout!.result!.payoutBatchId!);
  console.log(`    pool ${money(paid.payout!.poolCents)}: ${paid.payout!.allocations.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}; PayPal: ${batch.items.map((i) => i.transaction_status).join(", ")}`);
  return { paid, firedAt };
}

// Sample donors. One saved vault stands in for all of them, each with its own limits. D-0142 is the website's demo donor.
const base = { paymentTokenId: vaultId, hazards: ["cyclone"], regions: [playbook.regionId] };
const pledges: Pledge[] = [
  { ...base, id: `D-0142-${run}`, donorId: "D-0142", amountPerEvent: usd("10.00"), annualCap: usd("60.00"), preference: "early" },
  ...[25, 40, 75, 100, 150, 200, 250, 250, 500, 1000].map((amount, i): Pledge => ({ ...base, id: `donor-${i + 1}-${run}`, donorId: `donor-${i + 1}`, amountPerEvent: usd(`${amount}.00`), annualCap: usd(`${amount * 2}.00`), preference: "early" })),
  { ...base, id: `donor-11-${run}`, donorId: "donor-11", amountPerEvent: usd("200.00"), annualCap: usd("400.00"), preference: "confirmed" },
];
for (const p of pledges) await kv.set(`pledge:${p.id}`, p);

// The sponsor's bank transfer never really reaches the sandbox account, so one real charge puts that money there.
const funding = await payments.chargePledge({ pledgeId: `funding-${run}`, chargeKey: `funding-${run}`, paymentTokenId: vaultId, amount: usd("200.00") });
if (funding.status !== "COMPLETED") throw new Error(`Couldn't fund the sandbox: ${funding.status} ${funding.reason ?? ""}`);

console.log(`Replaying Hurricane Helene as ${eventKey}, every agent live on Haiku, stopping at $${MAX_COST_USD}\n`);

const briefs: { advisory: number; asOf: string; alert: string; leadHours: number | null; confidence: number | null; summary: string; reasons: string[] }[] = [];
let first: { paid: TrancheState; firedAt: string } | undefined;
let firedAdvisory: number | undefined;
let matchPaid = false;

for (let n = 1; n <= LAST_ADVISORY_BEFORE_PROOF; n++) {
  const snapshot = replaySnapshot(n, "helene");
  current.advisory = n;
  clock.now = new Date(snapshot.asOf);
  console.log(`Advisory ${n}, ${snapshot.asOf.slice(5, 16)}, ${snapshot.event.alertLevel}`);
  let error = await tick();
  if (error) {
    console.log(`    retrying once: ${error.slice(0, 140)}`);
    later(1);
    error = await tick();
    if (error) console.log(`    no score for this advisory: ${error.slice(0, 140)}`);
  }
  const brief = (await event())?.brief;
  if (brief && brief.asOf === snapshot.asOf) {
    console.log(`    Sentinel ${brief.confidence}, landfall in ${brief.landfall?.leadHours}h, about $${spend.usd.toFixed(4)} so far`);
    briefs.push({ advisory: n, asOf: snapshot.asOf, alert: brief.alertLevel, leadHours: brief.landfall?.leadHours ?? null, confidence: brief.confidence, summary: brief.summary, reasons: brief.reasons.map((r) => r.text) });
  }
  if (!first && (await state(1))) {
    firedAdvisory = n;
    first = await settle(1);
    // The sponsor pays for tranche 1, so its money goes out on the next tick.
    const invoice = first.paid.invoices?.[0];
    if (invoice?.result?.invoiceId) {
      await client.post(`/v2/invoicing/invoices/${invoice.result.invoiceId}/payments`, { method: "BANK_TRANSFER", payment_date: new Date().toISOString().slice(0, 10), amount: usd((invoice.cents / 100).toFixed(2)) });
      later(1);
      await tick();
      const payout = (await state(1))!.invoices?.[0].payout;
      matchPaid = payout?.status === "done";
      console.log(`    sponsor money ${money(payout?.netCents ?? 0)}: ${payout?.paidTo.map((a) => `${a.partnerId} ${money(a.cents)}`).join(", ")}`);
    }
  }
}
if (!first || firedAdvisory === undefined) throw new Error("Tranche 1 never fired");

console.log(`\nOps confirms landfall from the National Hurricane Center, then proof opens at ${PROOF_OPENS}`);
current.advisory = LAST_ADVISORY_BEFORE_PROOF + 1;
clock.now = new Date(PROOF_OPENS);
await levee.confirmLandfall(eventKey, { confirmedAt: LANDFALL, source: "National Hurricane Center" });

const fundsAt = Date.parse(first.firedAt);
const inWindow = (share: number) => new Date(fundsAt + (Date.parse(LANDFALL) - fundsAt) * share);
// Partners' clocks are on US Eastern time, UTC-4 in September.
const local = (d: Date) => new Date(d.getTime() - 4 * 3_600_000).toISOString();
const exifTime = (d: Date) => local(d).slice(0, 19).replace("T", " ").replace(/-/g, ":");
const receiptDate = local(inWindow(0.2)).slice(0, 10);

const old = await placeholderPhoto(77, "Water handout, earlier storm, 2020", { takenLocal: "2020:09:19 09:00:00", lat: 30.83, lon: -83.28 });
const oldFacts = await analyzePhoto({ id: "old-photo-1", bytes: old }, -240);
await kv.set("image:partner-c:earlier-storm-2020:old-photo-1", { sha256: sha256(old), dhash: oldFacts.dhash, partnerId: "partner-c", eventKey: "earlier-storm-2020", imageId: "old-photo-1" });

async function proofFor(partner: LeveePartner, recycled: boolean): Promise<ProofUpload> {
  const t1 = (await state(1))!;
  const received = (t1.payout!.allocations.find((a) => a.partnerId === partner.id)?.cents ?? 0) + (t1.invoices?.[0].payout?.status === "done" ? (t1.invoices[0].payout!.paidTo.find((a) => a.partnerId === partner.id)?.cents ?? 0) : 0);
  // Two honest receipts that account for about 95% of the money: 60 cases of water, and 40 tarps at half the price.
  const unit = Math.round(((received * 0.95) / 80)) / 100;
  const defs = [
    { id: "receipt-1", number: `GS-${partner.id === "partner-a" ? 1041 : 1188}`, vendor: "Gulf Supply Co", date: receiptDate, item: "water case", quantity: 60, unit, total: Math.round(60 * unit * 100) / 100, currency: "USD" },
    { id: "receipt-2", number: `BH-${partner.id === "partner-a" ? 2207 : 2315}`, vendor: "Big Bend Hardware", date: receiptDate, item: "tarpaulin", quantity: 40, unit: Math.round(unit * 50) / 100, total: Math.round(40 * Math.round(unit * 50)) / 100, currency: "USD" },
  ];
  const where = { lat: partner.area.lat, lon: partner.area.lon };
  const town = partner.area.name.split(",")[0];
  const prefix = partner.id === "partner-a" ? "PRY" : "VLD";
  const rows = (item: string, count: number) => Array.from({ length: count }, (_, i) => ({ beneficiaryId: `${prefix}-${String(i + 1).padStart(4, "0")}`, item, quantity: 1, date: receiptDate, location: town }));
  const photos = [
    { id: "photo-1", caption: `Water handed out at ${town}`, bytes: await placeholderPhoto(partner.id === "partner-a" ? 11 : 53, `Water handed out at ${town}`, { takenLocal: exifTime(inWindow(0.3)), ...where }) },
    recycled
      ? { id: "photo-2", caption: "More water handed out before the storm", bytes: await sharp(old).resize(900).withExif({ IFD2: { DateTimeOriginal: exifTime(inWindow(0.5)) } }).jpeg({ quality: 60 }).toBuffer() }
      : { id: "photo-2", caption: `Tarpaulins handed out at ${town}`, bytes: await placeholderPhoto(23, `Tarpaulins handed out at ${town}`, { takenLocal: exifTime(inWindow(0.5)), ...where }) },
  ];
  const receipts = await Promise.all(defs.map(async ({ unit: _unit, ...d }, i) => ({ ...d, image: await receiptImage(defs[i]) })));
  return { eventKey, partnerId: partner.id, photos, receipts, distribution: [...rows("water case", 60), ...rows("tarpaulin", 40)], sample: true };
}

const verdicts: Record<string, { verdict: string; summary: string; failed: string[] }> = {};
for (const [partner, recycled] of [[partners[0], false], [partners[1], true]] as const) {
  const result = await levee.submitProof(await proofFor(partner, recycled));
  verdicts[partner.id] = { verdict: result.verdict, summary: result.summary, failed: result.checks.filter((c) => !c.passed).map((c) => `${c.rule}: ${c.actual}`) };
  console.log(`    ${partner.id}: ${result.verdict}. ${result.summary.slice(0, 180)}`);
  for (const f of verdicts[partner.id].failed) console.log(`      failed: ${f.slice(0, 150)}`);
}

await tick();
const second = (await state(2)) ? await settle(2) : undefined;
if (!second) console.log("    tranche 2 did not fire, so its figures stay blank");

const donorQuestion = await levee.askNarrator("D-0142", "Where did my money go?", true);
console.log(`\nNarrator, ${donorQuestion.fromClaude ? "from Claude" : `plain summary (${donorQuestion.audit.fallback})`}:\n    ${donorQuestion.text}`);

const t1 = (await state(1))!;
const t2 = await state(2);
const net = (s?: TrancheState) => (s?.items ?? []).reduce((sum, i) => sum + Math.round(Number(i.result?.net?.value ?? 0) * 100), 0);
const gross = (s?: TrancheState) => (s?.items ?? []).filter((i) => i.result?.status === "COMPLETED").reduce((sum, i) => sum + i.cents, 0);
const rationale = Object.fromEntries((t1.proposal ?? []).map((p) => [p.partnerId, p.rationale ?? ""]));
const rationale2 = Object.fromEntries((t2?.proposal ?? []).map((p) => [p.partnerId, p.rationale ?? ""]));
const result = {
  eventKey,
  ranAt: new Date().toISOString(),
  model: "claude-haiku-5-5",
  firedAdvisory,
  playbookHour: hoursFrom(briefs.find((b) => b.advisory === firedAdvisory)!.asOf),
  captureHour: hoursFrom(first.firedAt),
  briefs: briefs.map((b) => ({ ...b, t: hoursFrom(b.asOf) })),
  donors: pledges.length,
  t1: {
    grossCents: gross(t1),
    netCents: net(t1),
    poolCents: t1.payout?.poolCents,
    allocations: t1.payout?.allocations,
    batchId: t1.payout?.result?.payoutBatchId,
    rationale,
    matchCents: t1.invoices?.[0].cents ?? 0,
    invoiceId: t1.invoices?.[0].result?.invoiceId,
    matchPaid,
    matchPaidTo: t1.invoices?.[0].payout?.paidTo ?? [],
    matchBatchId: t1.invoices?.[0].payout?.result?.payoutBatchId,
    donorCapture: t1.items.find((i) => i.donorId === "D-0142")?.result?.captureId,
  },
  t2: t2 && {
    status: t2.status,
    grossCents: gross(t2),
    netCents: net(t2),
    poolCents: t2.payout?.poolCents,
    allocations: t2.payout?.allocations,
    heldForReview: t2.payout?.heldForReview?.map((h) => ({ partnerId: h.partnerId, cents: h.cents })),
    batchId: t2.payout?.result?.payoutBatchId,
    rationale: rationale2,
    matchCents: t2.invoices?.[0]?.cents ?? 0,
    donorCapture: t2.items.find((i) => i.donorId === "D-0142")?.result?.captureId,
  },
  verdicts,
  narrator: { fromClaude: donorQuestion.fromClaude, text: donorQuestion.text, fallback: donorQuestion.audit.fallback },
  cost: spend,
};
writeFileSync(new URL("run.json", fixtures), JSON.stringify(result, null, 2) + "\n");

const before = ledger.rows.filter((r) => r.kind === "charge" || r.kind === "payout_batch").length;
later(60);
await tick();
await tick();
const moved = ledger.rows.filter((r) => r.kind === "charge" || r.kind === "payout_batch").length - before;
console.log(`\nTwo more ticks moved ${moved} payments. Claude: ${spend.calls} logged calls, about $${spend.usd.toFixed(4)}, by agent ${JSON.stringify(Object.fromEntries(Object.entries(spend.byAgent).map(([k, v]) => [k, Number(v.toFixed(5))])))}`);
console.log("Saved fixtures/helene/run.json");
