import type { KeyValue } from "../../../backend/agents/src/levee.ts";
import { costUsd } from "../../../backend/agents/src/narrator/model.ts";
import { runSentinel, SentinelError, type SentinelAudit, type ThreatBrief } from "../../../backend/agents/src/sentinel/agent.ts";
import { liveSnapshot, type Snapshot } from "../../../backend/agents/src/sentinel/feeds.ts";
import { RequestError } from "./http.ts";

/**
 * Sentinel on a real storm, from the Storms page: anyone can ask it to read a current storm's live GDACS data and write
 * a Threat Brief. A brief only changes with a new advisory, so each storm's brief is kept per advisory and every later
 * visitor gets that one, at no cost. A day's new briefs are capped too, so the page can't run up the Claude bill.
 * Watching a storm never moves money: these briefs are separate from the hourly job that the Policy Engine reads.
 */

/** `advisory` is the number of GDACS's latest advisory the brief read. */
export type LiveBrief = { brief: ThreatBrief; advisory: number; at: string; usage: SentinelAudit["usage"]; costUsd: number };

/** The newest advisories Sentinel reads: all its input shows, and GDACS can take half a minute for each one. */
const ADVISORIES_READ = 6;

export const BRIEFS_PER_DAY = 30;
const latestKey = (eventId: number) => `sentinel:live:${eventId}:latest`;
const briefKey = (eventId: number, advisory: number) => `sentinel:live:${eventId}:${advisory}`;
const advisoryOf = (snap: Snapshot) => Number(snap.advisories.at(-1)?.id.split("-").at(-1) ?? 0);

type Deps = {
  kv: KeyValue;
  audit: (entry: unknown) => Promise<void>;
  snapshot?: (eventId: number) => Promise<Snapshot>;
  sentinel?: (snapshot: Snapshot) => Promise<{ brief: ThreatBrief; audit: SentinelAudit }>;
  now?: () => Date;
};

/** The storm's latest brief, if anyone has asked for one. Never calls GDACS or Claude. */
export const savedBrief = (eventId: number, kv: KeyValue) => kv.get<LiveBrief>(latestKey(eventId));

// Two people asking about the same storm at once share one call.
const pending = (globalThis as unknown as { __leveeBriefs?: Map<number, Promise<LiveBrief>> }).__leveeBriefs ??= new Map();

/** The brief for the storm's latest advisory: kept if there is one, written by Sentinel if not. */
export function briefFor(eventId: number, deps: Deps): Promise<LiveBrief> {
  const running = pending.get(eventId);
  if (running) return running;
  const job = write(eventId, deps).finally(() => pending.delete(eventId));
  pending.set(eventId, job);
  return job;
}

async function write(eventId: number, { kv, audit, snapshot = (id) => liveSnapshot(id, new Date(), ADVISORIES_READ), sentinel = (s) => runSentinel(s, undefined, "medium"), now = () => new Date() }: Deps): Promise<LiveBrief> {
  let snap: Snapshot;
  try {
    snap = await snapshot(eventId);
  } catch {
    throw new RequestError("GDACS didn't answer just now, so Sentinel has nothing to read. Try again in a minute.", 502);
  }
  const advisory = advisoryOf(snap);
  const kept = await kv.get<LiveBrief>(briefKey(eventId, advisory));
  if (kept) return kept;

  const day = `sentinel:live:count:${now().toISOString().slice(0, 10)}`;
  const today = (await kv.get<number>(day)) ?? 0;
  if (today >= BRIEFS_PER_DAY) throw new RequestError(`Sentinel has written today's ${BRIEFS_PER_DAY} live briefs. Briefs already written stay up, and more can be written tomorrow.`, 429);
  await kv.set(day, today + 1);

  let result: Awaited<ReturnType<NonNullable<Deps["sentinel"]>>>;
  try {
    result = await sentinel(snap);
  } catch (err) {
    console.error("[sentinel live brief]", eventId, (err as Error).message);
    if (err instanceof SentinelError) throw new RequestError(`Sentinel couldn't finish this brief: ${err.message}`, 502);
    if (/api[_ ]?key|authentication|credit/i.test((err as Error).message ?? "")) throw new RequestError("Sentinel isn't connected to Claude on this server.", 503);
    throw err;
  }
  await audit(result.audit);
  const live: LiveBrief = { brief: result.brief, advisory, at: now().toISOString(), usage: result.audit.usage, costUsd: costUsd(result.audit.usage) };
  await kv.set(briefKey(eventId, advisory), live);
  await kv.set(latestKey(eventId), live);
  return live;
}

export type BriefSummary = { eventId: number; name: string; advisory: number; confidence: number; summary: string; cited: number; at: string; tokens: number; costUsd: number };

/** Each storm's newest brief, newest first: what the audit log shows of Sentinel's live work. Never calls GDACS or Claude. */
export async function recentBriefs(kv: KeyValue, limit = 10): Promise<BriefSummary[]> {
  const newest = new Map<number, LiveBrief>();
  for (const value of await kv.list<unknown>("sentinel:live:")) {
    if (!value || typeof value !== "object" || !("brief" in value)) continue;
    const live = value as LiveBrief;
    const seen = newest.get(live.brief.eventId);
    if (!seen || live.at > seen.at) newest.set(live.brief.eventId, live);
  }
  return [...newest.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map(({ brief: b, advisory, at, usage, costUsd }) => ({
      eventId: b.eventId,
      name: b.eventName,
      advisory,
      confidence: b.confidence,
      summary: b.summary,
      cited: new Set([...b.reasons, ...b.exposed].flatMap((r) => r.sources.map((s) => s.id))).size,
      at,
      tokens: usage.inputTokens + usage.outputTokens,
      costUsd,
    }));
}
