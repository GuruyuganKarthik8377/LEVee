// Usage: npm run sentinel -- replay <advisory 1-6 | all> [--dry] [--save] [--effort=low|medium|high]
//        npm run sentinel -- live [--dry]
// --dry prints the computed facts only: no LLM call, no API key needed. --save records replay briefs in fixtures/remal/briefs.
import { mkdirSync, writeFileSync } from "node:fs";
import { runSentinel } from "../src/sentinel/agent.ts";
import { activeCycloneIds, liveSnapshot, replaySnapshot, type Snapshot } from "../src/sentinel/feeds.ts";
import { computeSignals } from "../src/sentinel/signals.ts";
import { costUsd } from "../src/narrator/model.ts";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const effort = args.find((a) => a.startsWith("--effort="))?.slice(9) as "low" | "medium" | "high" | undefined;
const [mode, which] = args.filter((a) => !a.startsWith("--"));

let snapshots: Snapshot[];
if (mode === "replay") {
  const numbers = which === "all" ? [1, 2, 3, 4, 5, 6] : [Number(which ?? 1)];
  snapshots = numbers.map((n) => replaySnapshot(n));
} else if (mode === "live") {
  const ids = await activeCycloneIds();
  console.log(`GDACS lists ${ids.length} active Orange or Red cyclones.`);
  snapshots = await Promise.all(ids.map((id) => liveSnapshot(id)));
} else {
  throw new Error("Usage: npm run sentinel -- replay <1-6|all> [--dry], or: npm run sentinel -- live [--dry]");
}

if (!dry && !process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY in agents/.env, or add --dry to see the computed facts only");

for (const snapshot of snapshots) {
  const signals = computeSignals(snapshot);
  console.log(`\n${snapshot.event.name} as of ${snapshot.asOf} (${snapshot.mode})`);
  console.log(`  GDACS: ${snapshot.event.alertLevel}, ${snapshot.event.windKmh} km/h, ${signals.advisoryCount} advisories, ${signals.newsCount} news items`);
  const l = signals.landfall;
  console.log(l ? `  Landfall: ${l.etaUtc} near ${l.lat}N ${l.lon}E, ${l.leadHours} hours ahead` : "  Landfall: no forecast crossing of a Levee region's coast");
  console.log(`  Track shift: ${signals.trackShiftKm ?? "-"} km since last advisory, ${signals.maxTrackShiftKm ?? "-"} km at most; ETA moved ${signals.etaShiftHours ?? "-"} h`);
  for (const r of signals.rivers) console.log(`  River ${r.name}: latest ${r.latestDischarge ?? "-"} m3/s, forecast peak ${r.forecastPeak ?? "none"}, spread ${r.forecastSpreadRatio ?? "none"}`);
  if (dry) continue;
  // No Levee coast in its path means nothing can trigger, so don't spend an LLM call on it.
  if (!l) continue;

  const { brief, audit } = await runSentinel(snapshot, undefined, effort);
  // Recorded briefs let the demo replay one judgment instead of paying for, and possibly getting, a different one each run.
  if (args.includes("--save") && snapshot.mode === "replay") {
    const dir = new URL("../fixtures/remal/briefs/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    writeFileSync(new URL(`advisory-${snapshot.advisories.length}.json`, dir), JSON.stringify({ brief, audit }, null, 2) + "\n");
  }
  console.log(`\n  CONFIDENCE ${brief.confidence}/100, sources: ${brief.sourcesAgree}`);
  console.log(`  ${brief.summary}`);
  for (const r of brief.reasons) console.log(`   - ${r.text} [${r.sources.map((s) => s.id).join(", ")}]`);
  for (const e of brief.exposed) console.log(`   * ${e.place}: ${e.why} [${e.sources.map((s) => s.id).join(", ")}]`);
  const cost = costUsd(audit.usage);
  console.log(`  Audit: ${audit.model}, message ${audit.messageId}, ${audit.usage.inputTokens} in / ${audit.usage.outputTokens} out, about $${cost.toFixed(3)} at Opus 5.5 list price, input sha256 ${audit.inputSha256.slice(0, 12)}`);
}
