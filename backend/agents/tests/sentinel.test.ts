import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { buildInput, runSentinel, SentinelError } from "../src/sentinel/agent.ts";
import { parseAdvisory, parseRiver, replaySnapshot, type Advisory, type Snapshot } from "../src/sentinel/feeds.ts";
import { computeSignals, distanceKm, forecastLandfall } from "../src/sentinel/signals.ts";

const advisory = (points: [string, number, number][], issuedAt = "2024-05-25T12:00:00.000Z"): Advisory => ({
  id: "a",
  issuedAt,
  url: "https://x",
  points: points.map(([time, lat, lon]) => ({ time, lat, lon })),
});

// Replaying must never reveal the future. Everything else about the demo rests on this.
for (const n of [1, 2, 3, 4, 5, 6]) {
  test(`replay of advisory ${n} holds nothing dated after that moment`, () => {
    const s = replaySnapshot(n);
    assert.equal(s.advisories.length, n);
    assert.ok(s.advisories.every((a) => a.issuedAt <= s.asOf));
    assert.ok(s.news.every((i) => i.publishedAt <= s.asOf));
    assert.ok(s.rivers.every((r) => r.days.every((d) => d.date < s.asOf.slice(0, 10) && !d.forecast)));
    assert.equal(s.mode, "replay");
    assert.ok(s.caveats.some((c) => c.includes("final values")));
  });
}

test("advisory timestamps are real UTC times and each is 6 hours after the last", () => {
  const issued = [1, 2, 3, 4, 5, 6].map((n) => replaySnapshot(n).asOf);
  assert.equal(issued[0], "2024-05-25T12:00:00.000Z");
  assert.equal(issued[5], "2024-05-26T18:00:00.000Z");
  for (let i = 1; i < 6; i++) assert.equal(new Date(issued[i]).getTime() - new Date(issued[i - 1]).getTime(), 6 * 3_600_000);
});

test("advisory 1 is the real forecast, not the final track", () => {
  const [a] = replaySnapshot(1).advisories;
  assert.deepEqual(a.points[2], { time: "2024-05-26T12:00:00.000Z", lat: 21.5, lon: 89.5 });
});

test("a track point in January on a December advisory gets the next year", () => {
  const ring = [[10, 10], [10, 20], [20, 20], [20, 10]];
  const a = parseAdvisory(1, 9, [{ geometry: { coordinates: [ring] }, properties: { Class: "Point_Polygon_Point_0", key: "01010600", polygondate: "2025-12-31T18:00:00" } }]);
  assert.equal(a.points[0].time, "2026-01-01T06:00:00.000Z");
  assert.deepEqual([a.points[0].lat, a.points[0].lon], [15, 15]);
});

test("an advisory with no track points is an error, not an empty forecast", () => {
  assert.throws(() => parseAdvisory(1, 9, [{ properties: { Class: "Poly_Green" } }]), /no track points/);
});

test("river days after the snapshot's date are marked as forecasts", () => {
  const r = parseRiver("Khulna", "https://x", { daily: { time: ["2026-01-01", "2026-01-02"], river_discharge: [1, 2], river_discharge_min: [1, 1], river_discharge_max: [1, 5] } }, "2026-01-01T06:00:00.000Z");
  assert.deepEqual(r.days.map((d) => d.forecast), [false, true]);
  assert.equal(r.id, "river-khulna");
});

test("landfall is interpolated where the track crosses the coast", () => {
  const l = forecastLandfall(advisory([["2024-05-26T12:00:00.000Z", 21.3, 89], ["2024-05-27T00:00:00.000Z", 22.3, 90]]), "2024-05-25T12:00:00.000Z");
  assert.deepEqual(l, { etaUtc: "2024-05-26T18:00:00.000Z", lat: 21.8, lon: 89.5, leadHours: 30, regionId: "bay-of-bengal-north" });
});

test("no landfall when the track stays at sea, crosses outside the region, or heads south", () => {
  const asOf = "2024-05-25T12:00:00.000Z";
  const [t1, t2] = ["2024-05-26T00:00:00.000Z", "2024-05-26T12:00:00.000Z"];
  assert.equal(forecastLandfall(advisory([[t1, 15, 89], [t2, 18, 89]]), asOf), null);
  assert.equal(forecastLandfall(advisory([[t1, 21, 130], [t2, 23, 130]]), asOf), null);
  assert.equal(forecastLandfall(advisory([[t1, 23, 89], [t2, 21, 89]]), asOf), null);
});

test("Remal's facts: first advisory gives about 27 hours, the track moved 117 km west", () => {
  const first = computeSignals(replaySnapshot(1));
  assert.equal(first.landfall?.leadHours, 26.6);
  assert.equal(first.trackShiftKm, null);
  const last = computeSignals(replaySnapshot(6));
  assert.equal(last.maxTrackShiftKm, 116.7);
  assert.equal(last.landfall?.etaUtc, "2024-05-26T19:00:00.000Z");
  assert.equal(last.newsCount, 120);
});

test("distance between two points is in kilometres", () => {
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.2) < 0.1);
});

test("the LLM sees at most 25 different latest headlines, and is told how many there are in all", () => {
  const s = replaySnapshot(6);
  const input = buildInput(s, computeSignals(s));
  assert.equal(input.news.items.length, 25);
  assert.equal(input.news.totalArticles, 120);
  assert.equal(input.news.items.at(-1)?.id, "news-120");
  const titles = input.news.items.map((i) => i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(input.news.items.every((a, i, all) => i === 0 || all[i - 1].at <= a.at));
});

test("the input stays compact: no links, last 3 river days, only forward forecast points", () => {
  const s = replaySnapshot(6);
  const input = buildInput(s, computeSignals(s));
  assert.doesNotMatch(JSON.stringify(input), /https?:/);
  assert.ok(input.rivers.every((r) => r.recent.length === 3 && r.forecast.length === 0));
  assert.ok(input.advisories.every((a) => a.forecast.every(([time]) => `${time}` > a.issuedAt)));
  assert.deepEqual(input.computedFacts.riverForecasts, []);
});

test("a live river forecast still reaches the LLM in full", () => {
  const s = replaySnapshot(1);
  const live = parseRiver("Khulna", "https://x", { daily: { time: ["2024-05-25", "2024-05-26"], river_discharge: [1, 9], river_discharge_min: [1, 2], river_discharge_max: [1, 30] } }, s.asOf);
  const withForecast: Snapshot = { ...s, rivers: [live] };
  const input = buildInput(withForecast, computeSignals(withForecast));
  assert.deepEqual(input.rivers[0].forecast, [["2024-05-26", 9, 2, 30]]);
  assert.equal(input.computedFacts.riverForecasts[0].forecastPeak, 30);
});

// Fake Anthropic client answering with the given response, recording the request.
function fakeClient(response: object) {
  const requests: any[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: unknown) => {
          requests.push(params);
          return { id: "msg_1", model: "claude-haiku-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, ...response };
        },
      },
    },
  };
  return { requests, client: client as unknown as Anthropic };
}
const judgment = (over: object = {}) => ({
  parsed_output: {
    confidence: 72,
    sourcesAgree: "mixed",
    summary: "A cyclone is forecast to reach the coast.",
    reasons: [{ text: "Two advisories agree.", sources: ["gdacs-advisory-1", "gdacs-advisory-2"] }],
    exposed: [{ place: "Khulna", why: "Near the forecast landfall.", sources: ["river-khulna"] }],
    ...over,
  },
});
const snapshot: Snapshot = replaySnapshot(2);

test("a brief combines the judgment with facts from code, and resolves citations to real links", async () => {
  const { brief, audit } = await runSentinel(snapshot, fakeClient(judgment()).client);
  assert.equal(brief.confidence, 72);
  assert.equal(brief.alertLevel, "Orange");
  assert.equal(brief.landfall?.leadHours, 25.7);
  assert.equal(brief.trackShiftKm, 41.3);
  assert.equal(brief.reasons[0].sources[0].url, snapshot.advisories[0].url);
  assert.equal(brief.exposed[0].sources[0].id, "river-khulna");
  assert.deepEqual(brief.caveats, snapshot.caveats);
  assert.equal(audit.agent, "sentinel");
  assert.equal(audit.messageId, "msg_1");
  assert.match(audit.inputSha256, /^[0-9a-f]{64}$/);
});

test("facts the LLM tries to supply itself are ignored", async () => {
  const { brief } = await runSentinel(snapshot, fakeClient(judgment({ alertLevel: "Red", landfall: { leadHours: 1 } })).client);
  assert.equal(brief.alertLevel, "Orange");
  assert.equal(brief.landfall?.leadHours, 25.7);
});

test("the request uses a current model with no temperature and doesn't reveal the Policy Engine's threshold", async () => {
  const { client, requests } = fakeClient(judgment());
  await runSentinel(snapshot, client);
  const [r] = requests;
  assert.equal(r.model, "claude-haiku-5-5");
  assert.equal(r.fallbacks, undefined);
  assert.equal(r.output_config.effort, "high");
  assert.equal(r.temperature, undefined);
  assert.equal(r.tool_choice, undefined);
  assert.doesNotMatch(r.system, /\b70\b/);
  assert.doesNotMatch(r.messages[0].content, /threshold/i);
});

// Fail closed: each of these must leave no brief, so the Policy Engine can't fire.
const failures: [string, object, RegExp][] = [
  ["a refusal", { stop_reason: "refusal", stop_details: { category: "bio" }, parsed_output: null }, /declined: bio/],
  ["running out of tokens", { stop_reason: "max_tokens", parsed_output: null }, /out of tokens/],
  ["an unparseable answer", { parsed_output: null }, /did not match/],
  ["confidence above 100", judgment({ confidence: 101 }), /out of range/],
  ["confidence below 0", judgment({ confidence: -1 }), /out of range/],
  ["a fractional confidence", judgment({ confidence: 70.5 }), /out of range/],
  ["no reasons", judgment({ reasons: [] }), /at least one reason/],
  ["a reason citing nothing", judgment({ reasons: [{ text: "Trust me.", sources: [] }] }), /must cite/],
  ["an invented source", judgment({ reasons: [{ text: "x", sources: ["news-999"] }] }), /not in the input: news-999/],
  ["a place citing an invented source", judgment({ exposed: [{ place: "x", why: "y", sources: ["made-up"] }] }), /not in the input: made-up/],
];
for (const [name, response, message] of failures) {
  test(`${name} produces no brief`, async () => {
    await assert.rejects(runSentinel(snapshot, fakeClient(response).client), (err: unknown) => err instanceof SentinelError && message.test(err.message));
  });
}

test("an API error propagates instead of becoming a brief", async () => {
  const client = { beta: { messages: { parse: async () => { throw new Error("overloaded"); } } } } as unknown as Anthropic;
  await assert.rejects(runSentinel(snapshot, client), /overloaded/);
});
