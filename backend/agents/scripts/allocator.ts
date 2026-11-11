// Usage: npm run allocator -- [--effort=low|medium|high] [--save]
// Claude's split of Remal's tranche 1, alone and with a second storm threatening the same coast at the same time.
// --save records the Remal split in fixtures/remal/allocations/t1.json for the replay.
import { readFileSync, writeFileSync } from "node:fs";
import { proposeAllocation, type AllocationResult, type PartnerProfile } from "../src/allocator/agent.ts";
import type { ThreatBrief } from "../src/sentinel/agent.ts";
import { costUsd } from "../src/narrator/model.ts";

if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in agents/.env");
const args = process.argv.slice(2);
const effort = args.find((a) => a.startsWith("--effort="))?.slice(9) as "low" | "medium" | "high" | undefined;
const fixtures = new URL("../fixtures/remal/", import.meta.url);
const brief: ThreatBrief = JSON.parse(readFileSync(new URL("briefs/advisory-3.json", fixtures), "utf8")).brief;
const partners: PartnerProfile[] = JSON.parse(readFileSync(new URL("partners.json", fixtures), "utf8"));

const show = (title: string, r: AllocationResult) => {
  console.log(`\n${title} [${r.source}]\n  ${r.summary}`);
  for (const a of r.proposal ?? []) console.log(`  ${a.partnerId}: ${a.shareBps / 100}%. ${a.rationale}`);
  for (const e of r.excluded) console.log(`  left out ${e.partnerId}: ${e.reason}`);
  const llm = r.audit.llm;
  console.log(llm ? `  ${llm.usage.inputTokens} in / ${llm.usage.outputTokens} out, about $${costUsd(llm.usage).toFixed(5)}` : "  No LLM call");
  if (r.audit.rejected) console.log(`  Rejected: ${r.audit.rejected}`);
};

const alone = await proposeAllocation({ brief, partners, effort });
show("Remal alone", alone);
if (args.includes("--save")) writeFileSync(new URL("allocations/t1.json", fixtures), JSON.stringify(alone, null, 2) + "\n");

// A made-up second storm, because Remal had none. The same partners are busy, and it threatens Partner A's coast.
const second: ThreatBrief = { ...brief, eventId: 999, eventName: "SAMPLE-STORM", confidence: 80, landfall: { ...brief.landfall!, leadHours: 30 }, exposed: [{ place: "Mongla", why: "Near the forecast track", sources: [] }] };
const busy = partners.map((p) => (p.id === "partner-a" ? { ...p, committedUsd: 1500 } : p));
show("With a second storm, and Partner A mostly committed", await proposeAllocation({ brief, partners: busy, otherActive: [second], effort }));

show("Partner A fully committed", await proposeAllocation({ brief, partners: partners.map((p) => (p.id === "partner-a" ? { ...p, committedUsd: 2000 } : p)), effort }));
