// Usage: npm run narrator -- <vault_id> "<question>" [language]
// Makes one real sandbox charge through the Policy Engine, then shows what the Narrator tells that donor.
// Costs a few cents of LLM and moves sandbox money only.
import { readFileSync } from "node:fs";
import { sandbox, usd, waitForBatch } from "../../payments/scripts/sandbox.ts";
import { configFromEnv } from "../../payments/src/paypal.ts";
import { createPolicyEngine, memoryReviews, memoryStore } from "../../policy/src/engine.ts";
import { BAY_OF_BENGAL_CYCLONE as playbook, type Partner, type Pledge } from "../../policy/src/playbook.ts";
import { donorActivity } from "../src/narrator/activity.ts";
import { answerDonor, writeStory } from "../src/narrator/agent.ts";
import { memoryCache, writeNotice, writeReceipt } from "../src/narrator/messages.ts";
import { toolkitReader } from "../src/narrator/reader.ts";
import { loadPack } from "../src/verifier/proof.ts";

const [vaultId, question = "Where did my $10 go?", language = "en"] = process.argv.slice(2);
if (!vaultId) throw new Error('Usage: npm run narrator -- <vault_id> "<question>" [language]');
const fixtures = new URL("../fixtures/remal/", import.meta.url);
const { brief } = JSON.parse(readFileSync(new URL("briefs/advisory-3.json", fixtures), "utf8"));
const verdict = JSON.parse(readFileSync(new URL("verdicts/partner-a.json", fixtures), "utf8"));
const pack = loadPack(new URL("proof/partner-a/", fixtures));

const { payments, ledger, client } = sandbox();
const clock = { now: new Date(brief.asOf) };
const run = Date.now();
const cache = memoryCache();
const skipUrl = "https://levee.example/skip";
const partners: Partner[] = [{ id: "partner-a", email: process.env.PAYPAL_PARTNER_A_EMAIL ?? "partner-a@business.example.com" }];
const pledge: Pledge = { id: `pledge-${run}`, donorId: "donor-1", paymentTokenId: vaultId, hazards: ["cyclone"], regions: [playbook.regionId], amountPerEvent: usd("25.00"), annualCap: usd("60.00"), preference: "early" };
const store = memoryStore();

const engine = createPolicyEngine({
  payments,
  ledger,
  store,
  reviews: memoryReviews(),
  playbook,
  readLedger: async () => ledger.rows,
  notify: async (n) => {
    const m = await writeNotice(n, skipUrl, language, cache);
    console.log(`NOTICE (${m.language}, translated ${m.translated}):\n  ${m.text}\n`);
  },
  audit: async () => {},
  now: () => clock.now,
});

const eventKey = `narrator-${run}`;
await engine.evaluateTranche1({ eventKey, brief, pledges: [pledge], partners });
clock.now = new Date(clock.now.getTime() + 60 * 60_000);
const state = await engine.execute(`${eventKey}:t1`);
// Stands in for the webhook, which keeps the ledger current once deployed.
const batchId = state.payout!.result!.payoutBatchId!;
const finished = await waitForBatch(client, batchId);
await ledger.record({ kind: "payout_batch", ref: state.key, paypalId: batchId, status: finished.batch_header.batch_status, at: new Date().toISOString() });
const charges = donorActivity("donor-1", [state], { "partner-a": "Partner A" }, ledger.rows);

const receipt = await writeReceipt(charges[0], "donor-1", language, cache);
console.log(`RECEIPT (${receipt?.language}):\n  ${receipt?.text}\n`);

const delivered = [...new Set(pack.distribution.map((d) => d.item))].map((item) => {
  const rows = pack.distribution.filter((d) => d.item === item);
  return { item, quantity: rows.reduce((s, r) => s + r.quantity, 0), households: new Set(rows.map((r) => r.beneficiaryId)).size };
});
const story = await writeStory({ charges, language, lead: { hoursBeforeLandfall: 17.5 }, work: [{ partnerName: "Partner A", area: pack.serviceArea.name, verdict: verdict.verdict, delivered }, { partnerName: "Partner B", area: "Patuakhali", verdict: "human", delivered: [] }] });
console.log(`STORY (from Claude: ${story?.fromClaude}, ${JSON.stringify(story?.audit.usage)}):\n  ${story?.text}\n`);

const { clientId, clientSecret } = configFromEnv();
const answer = await answerDonor({ question, charges, reader: toolkitReader({ clientId, clientSecret }), replay: true });
console.log(`QUESTION: ${question}\nANSWER (from Claude: ${answer.fromClaude}, records read: ${answer.recordsRead.join(", ") || "none"}, ${JSON.stringify(answer.audit.usage)}):\n  ${answer.text}`);
if (answer.refundRequest) {
  console.log(`\nRefund proposed for ${answer.refundRequest.trancheKey}. Policy Engine decides:`);
  console.log(" ", await engine.refundCharge(answer.refundRequest.trancheKey, answer.refundRequest.pledgeId, "donor-1"));
}
