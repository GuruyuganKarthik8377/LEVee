import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { allocationFacts, proposeAllocation, type PartnerProfile } from "../src/allocator/agent.ts";
import type { ThreatBrief } from "../src/sentinel/agent.ts";

const fixtures = new URL("../fixtures/remal/", import.meta.url);
const brief: ThreatBrief = JSON.parse(readFileSync(new URL("briefs/advisory-3.json", fixtures), "utf8")).brief;
const partners = (): PartnerProfile[] => JSON.parse(readFileSync(new URL("partners.json", fixtures), "utf8"));

function fakeClient(response: object) {
  const requests: any[] = [];
  const client = { beta: { messages: { parse: async (p: unknown) => { requests.push(p); return { id: "msg_1", model: "claude-haiku-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, ...response }; } } } };
  return { requests, client: client as unknown as Anthropic };
}
const split = (a = 60, b = 40, over: object = {}) => ({
  parsed_output: {
    allocations: [
      { partnerId: "partner-a", sharePercent: a, rationale: "Closest to the forecast landfall." },
      { partnerId: "partner-b", sharePercent: b, rationale: "Further east, but reaches exposed households." },
    ],
    summary: "Most goes to the partner closest to landfall.",
    ...over,
  },
});

test("code computes each partner's distance and remaining capacity", () => {
  const { eligible } = allocationFacts(brief, partners(), []);
  assert.equal(eligible.length, 2);
  const [a, b] = eligible;
  assert.ok(a.kmFromForecastLandfall < b.kmFromForecastLandfall, "Mongla is closer than Patuakhali");
  assert.equal(a.remainingCapacityUsd, 2000);
});

test("Claude's split becomes a proposal in basis points, with its reasons", async () => {
  const r = await proposeAllocation({ brief, partners: partners(), client: fakeClient(split()).client });
  assert.equal(r.source, "claude");
  assert.deepEqual(r.proposal?.map((p) => [p.partnerId, p.shareBps]), [["partner-a", 6000], ["partner-b", 4000]]);
  assert.match(r.proposal![0].rationale, /Closest/);
});

test("a partner with no room or outside the region is never offered to Claude", async () => {
  const list = partners();
  list[0].committedUsd = 2000;
  list.push({ ...list[1], id: "partner-far", regionId: "elsewhere" });
  const { client, requests } = fakeClient({});
  const r = await proposeAllocation({ brief, partners: list, client });
  assert.equal(requests.length, 0);
  assert.equal(r.source, "only_one_partner");
  assert.deepEqual(r.proposal?.map((p) => [p.partnerId, p.shareBps]), [["partner-b", 10000]]);
  assert.deepEqual(r.excluded.map((e) => e.partnerId), ["partner-a", "partner-far"]);
});

test("no partner available means no proposal and no LLM call", async () => {
  const { client, requests } = fakeClient({});
  const r = await proposeAllocation({ brief, partners: partners().map((p) => ({ ...p, committedUsd: 99999 })), client });
  assert.equal(r.source, "no_partner_available");
  assert.equal(r.proposal, undefined);
  assert.equal(requests.length, 0);
});

const bad: [string, object, RegExp][] = [
  ["shares that don't add to 100", split(60, 30), /add up to 90/],
  ["shares over 100", split(80, 40), /add up to 120/],
  ["a fractional share", split(50.5, 49.5), /whole percentage/],
  ["a negative share", split(120, -20), /whole percentage/],
  ["a partner left out", { parsed_output: { allocations: [{ partnerId: "partner-a", sharePercent: 100, rationale: "x" }], summary: "s" } }, /each eligible partner/],
  ["an invented partner", { parsed_output: { allocations: [{ partnerId: "partner-a", sharePercent: 50, rationale: "x" }, { partnerId: "my-friend", sharePercent: 50, rationale: "x" }], summary: "s" } }, /each eligible partner/],
  ["a partner named twice", { parsed_output: { allocations: [{ partnerId: "partner-a", sharePercent: 50, rationale: "x" }, { partnerId: "partner-a", sharePercent: 50, rationale: "x" }], summary: "s" } }, /each eligible partner/],
  ["a blank reason", { parsed_output: { allocations: [{ partnerId: "partner-a", sharePercent: 50, rationale: " " }, { partnerId: "partner-b", sharePercent: 50, rationale: "x" }], summary: "s" } }, /no reason/],
  ["a reason with an invented figure", { parsed_output: { allocations: [{ partnerId: "partner-a", sharePercent: 50, rationale: "Serves 90000 families." }, { partnerId: "partner-b", sharePercent: 50, rationale: "x" }], summary: "s" } }, /number not in the facts/],
  ["a refusal", { stop_reason: "refusal", parsed_output: null }, /stopped: refusal/],
  ["running out of tokens", { stop_reason: "max_tokens", parsed_output: null }, /stopped: max_tokens/],
];
for (const [name, response, reason] of bad) {
  test(`${name}: no proposal, so the engine's equal split still moves the money`, async () => {
    const r = await proposeAllocation({ brief, partners: partners(), client: fakeClient(response).client });
    assert.equal(r.source, "fallback_equal_split");
    assert.equal(r.proposal, undefined);
    assert.match(r.audit.rejected!, reason);
  });
}

test("an API failure falls back rather than blocking aid", async () => {
  const client = { beta: { messages: { parse: async () => { throw new Error("overloaded"); } } } } as unknown as Anthropic;
  const r = await proposeAllocation({ brief, partners: partners(), client });
  assert.equal(r.source, "fallback_equal_split");
  assert.match(r.audit.rejected!, /overloaded/);
});

test("reasons may state the facts and Claude's own shares", async () => {
  const r = await proposeAllocation({ brief, partners: partners(), client: fakeClient({ parsed_output: { allocations: [{ partnerId: "partner-a", sharePercent: 60, rationale: "60% for 1200 households." }, { partnerId: "partner-b", sharePercent: 40, rationale: "40% for 800 households." }], summary: "A 60 to 40 split." } }).client });
  assert.equal(r.source, "claude");
});

test("other active storms reach the judgment", async () => {
  const { client, requests } = fakeClient(split());
  await proposeAllocation({ brief, partners: partners(), otherActive: [{ ...brief, eventName: "OTHER-STORM" }], client });
  assert.match(requests[0].messages[0].content, /OTHER-STORM/);
});

test("the request is valid for current Claude, with no emails or payout details in it", async () => {
  const { client, requests } = fakeClient(split());
  await proposeAllocation({ brief, partners: partners(), client });
  const [r] = requests;
  assert.equal(r.model, "claude-haiku-5-5");
  assert.equal(r.temperature, undefined);
  assert.equal(r.tool_choice, undefined);
  assert.equal(r.messages[0].content.includes("@"), false);
  assert.doesNotMatch(r.system, /\b70\b/);
});
