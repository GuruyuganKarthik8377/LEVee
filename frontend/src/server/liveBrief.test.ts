// Sentinel's live briefs on fake GDACS data and a fake Sentinel: no network, no Claude. Run: node --test src/server/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Snapshot } from "../../../backend/agents/src/sentinel/feeds.ts";
import type { ThreatBrief, SentinelAudit } from "../../../backend/agents/src/sentinel/agent.ts";
import { BRIEFS_PER_DAY, briefFor, recentBriefs, savedBrief } from "./liveBrief.ts";

function setup() {
  const table = new Map<string, unknown>();
  const kv = {
    get: async <T,>(k: string) => table.get(k) as T | undefined,
    set: async (k: string, v: unknown) => void table.set(k, v),
    list: async <T,>(prefix: string) => [...table].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T),
  };
  const audits: unknown[] = [];
  let advisories = 3;
  let calls = 0;
  const snapshot = async (id: number) => ({ event: { id, name: "TEST-26" }, advisories: Array.from({ length: advisories }, (_, i) => ({ id: `gdacs-advisory-${i + 1}` })) }) as unknown as Snapshot;
  const sentinel = async (snap: Snapshot) => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    const brief = { eventId: snap.event.id, eventName: snap.event.name, confidence: 40 + snap.advisories.length, summary: "Fake.", reasons: [{ text: "r", sources: [{ id: "gdacs-event" }] }], exposed: [], caveats: [] } as unknown as ThreatBrief;
    const audit = { agent: "sentinel", usage: { inputTokens: 10_000, outputTokens: 1_000 } } as SentinelAudit;
    return { brief, audit };
  };
  const deps = { kv, audit: async (a: unknown) => void audits.push(a), snapshot, sentinel, now: () => new Date("2026-11-10T12:00:00Z") };
  return { kv, deps, audits, table, calls: () => calls, newAdvisory: () => advisories++ };
}

test("a live brief is written once per advisory, and two people asking at once share one Claude call", async () => {
  const { kv, deps, audits, calls, newAdvisory } = setup();
  assert.equal(await savedBrief(7, kv), undefined);

  const [a, b] = await Promise.all([briefFor(7, deps), briefFor(7, deps)]);
  assert.equal(calls(), 1);
  assert.equal(a, b);
  assert.deepEqual([a.advisory, a.brief.confidence, a.costUsd], [3, 43, 0.0015]);
  assert.equal(audits.length, 1, "each brief goes on the audit log");

  await briefFor(7, deps);
  assert.equal(calls(), 1, "the same advisory costs nothing again");
  assert.equal((await savedBrief(7, kv))?.advisory, 3);

  newAdvisory();
  assert.equal((await briefFor(7, deps)).brief.confidence, 44);
  assert.equal(calls(), 2, "a new advisory gets a new brief");
});

test("a day's new briefs are capped, and briefs already written still come back", async () => {
  const { deps, table, calls } = setup();
  await briefFor(1, deps);
  table.set("sentinel:live:count:2026-11-10", BRIEFS_PER_DAY);
  await assert.rejects(briefFor(2, deps), (err: { status: number }) => err.status === 429);
  assert.equal((await briefFor(1, deps)).advisory, 3, "storm 1's brief is kept");
  assert.equal(calls(), 1);
});

test("the audit log lists each storm's newest brief once, newest first", async () => {
  const { kv, deps, newAdvisory } = setup();
  await briefFor(7, deps);
  newAdvisory();
  await briefFor(7, { ...deps, now: () => new Date("2026-11-10T13:00:00Z") });
  await briefFor(8, { ...deps, now: () => new Date("2026-11-10T12:30:00Z") });
  const list = await recentBriefs(kv);
  assert.deepEqual(list.map((b) => [b.eventId, b.advisory, b.confidence, b.cited]), [[7, 4, 44, 1], [8, 4, 44, 1]]);
});
