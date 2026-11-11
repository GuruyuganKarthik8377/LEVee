// Usage: npm run verifier -- <partner-a|partner-b|all> [--dry] [--save]
// --dry runs the code checks only: no LLM, no API key. --save records verdicts in fixtures/remal/verdicts for the replay.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { checkPack, runVerifier } from "../src/verifier/agent.ts";
import { memoryRegistry, verdictFrom } from "../src/verifier/checks.ts";
import { analyzePhoto, loadPack, sha256 } from "../src/verifier/proof.ts";
import { costUsd } from "../src/narrator/model.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const which = args.find((a) => !a.startsWith("--")) ?? "all";
const partners = which === "all" ? ["partner-a", "partner-b"] : [which];
const root = new URL("../fixtures/remal/proof/", import.meta.url);
if (!dry && !process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in agents/.env, or add --dry to run the code checks only");

// Sample rate for the replay, about May 2024. Levee's own table: partners don't supply rates.
const usdPerUnit = { USD: 1, BDT: 1 / 117 };
const oldPhoto = readFileSync(new URL("prior/old-photo-1.jpg", root));
const oldFacts = await analyzePhoto({ id: "old-photo-1", bytes: oldPhoto }, 360);
const registry = memoryRegistry([{ sha256: sha256(oldPhoto), dhash: oldFacts.dhash, partnerId: "partner-c", eventKey: "earlier-storm-2020", imageId: "old-photo-1" }]);

for (const partner of partners) {
  const pack = loadPack(new URL(`${partner}/`, root));
  console.log(`\n${partner}: ${pack.photos.length} photos, ${pack.receipts.length} receipts, ${pack.distribution.length} distribution rows`);
  if (dry) {
    const { checks } = await checkPack(pack, { registry, usdPerUnit });
    for (const c of checks) console.log(`  [${c.passed ? "x" : " "}] ${c.rule}: ${c.actual}`);
    console.log(`  Verdict from code checks: ${verdictFrom(checks)}`);
    continue;
  }
  const result = await runVerifier(pack, { registry, usdPerUnit });
  for (const c of result.checks.filter((c) => !c.passed)) console.log(`  [ ] ${c.rule}: ${c.actual} (${c.severity})`);
  console.log(`  ${result.checks.filter((c) => c.passed).length} of ${result.checks.length} checks passed`);
  console.log(`  VERDICT: ${result.verdict}\n  ${result.summary}`);
  for (const p of result.photoFindings) console.log(`   - ${p.id}: shows activity ${p.showsClaimedActivity}, edited ${p.looksEdited}. ${p.note}`);
  for (const c of result.concerns) console.log(`   ! ${c.text} [${c.evidence.join(", ")}]`);
  const llm = result.audit.llm;
  console.log(llm ? `  Audit: ${llm.model}, ${llm.usage.inputTokens} in / ${llm.usage.outputTokens} out, about $${costUsd(llm.usage).toFixed(5)}` : "  Audit: no LLM call needed, $0");
  if (args.includes("--save")) {
    const dir = new URL("../fixtures/remal/verdicts/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL(`${partner}.json`, dir), JSON.stringify(result, null, 2) + "\n");
  }
}
