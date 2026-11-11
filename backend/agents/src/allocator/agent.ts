import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { allowedNumbers, onlyKnownNumbers } from "../narrator/activity.ts";
import { MODEL, withRetryableClient } from "../narrator/model.ts";
import type { ThreatBrief } from "../sentinel/agent.ts";
import { distanceKm } from "../sentinel/signals.ts";

// What a partner told Levee at signup, plus what other active storms already asked of it.
export type PartnerProfile = {
  id: string;
  name: string;
  regionId: string;
  area: { name: string; lat: number; lon: number };
  earlyActions: string[];
  households: number;
  capacityUsd: number;
  // Already promised to other active storms.
  committedUsd: number;
};

export type AllocationResult = {
  // Undefined when there's nothing to judge or Claude couldn't be used. The engine then splits equally, because aid must not wait on an LLM.
  proposal?: { partnerId: string; shareBps: number; rationale: string }[];
  summary: string;
  source: "claude" | "only_one_partner" | "no_partner_available" | "fallback_equal_split";
  excluded: { partnerId: string; reason: string }[];
  audit: { agent: "allocator"; at: string; inputSha256: string; llm: { model: string; messageId: string; usage: { inputTokens: number; outputTokens: number } } | null; rejected?: string };
};

// Facts for the judgment, all computed. A partner with no room left, or outside the region, isn't offered to Claude at all.
export function allocationFacts(brief: ThreatBrief, partners: PartnerProfile[], otherActive: ThreatBrief[]) {
  const landfall = brief.landfall;
  const excluded: AllocationResult["excluded"] = [];
  const eligible = partners.flatMap((p) => {
    if (!landfall || p.regionId !== landfall.regionId) {
      excluded.push({ partnerId: p.id, reason: "works outside this storm's region" });
      return [];
    }
    const remainingUsd = p.capacityUsd - p.committedUsd;
    if (remainingUsd <= 0) {
      excluded.push({ partnerId: p.id, reason: "no capacity left" });
      return [];
    }
    return [{
      id: p.id,
      name: p.name,
      area: p.area.name,
      kmFromForecastLandfall: Math.round(distanceKm(p.area, landfall)),
      earlyActions: p.earlyActions,
      households: p.households,
      remainingCapacityUsd: remainingUsd,
    }];
  });
  return {
    eligible,
    excluded,
    input: {
      storm: { name: brief.eventName, alert: brief.alertLevel, confidence: brief.confidence, hoursToLandfall: landfall?.leadHours, trackShiftKm: brief.maxTrackShiftKm, exposedPlaces: brief.exposed.map((e) => e.place) },
      otherActiveStorms: otherActive.map((o) => ({ name: o.eventName, alert: o.alertLevel, confidence: o.confidence, hoursToLandfall: o.landfall?.leadHours, exposedPlaces: o.exposed.map((e) => e.place) })),
      partners: eligible,
    },
  };
}

const SplitSchema = z.object({
  allocations: z.array(z.object({
    partnerId: z.string(),
    sharePercent: z.number().describe("Whole number from 0 to 100"),
    rationale: z.string().describe("One sentence on why this partner gets this share"),
  })),
  summary: z.string().describe("One sentence on the overall split, for the public audit log"),
});

const SYSTEM = `You are Allocator, who proposes how Levee splits one tranche of donated money between vetted local partners ahead of a cyclone. A separate fixed-rule system re-checks your proposal and moves the money, and donors can read your reasons.

Decide each partner's share of this tranche, as whole percentages adding up to exactly 100. Weigh, in this order:
- Exposure: partners closer to the forecast landfall and to the exposed places are likely to need money first. When the track has been shifting, spread risk rather than betting on one point.
- Reach: the households a partner can serve and the early actions it runs.
- Capacity: a partner can't use more than its remaining capacity.
- Other active storms: if another storm threatens the same area soon, say how it affects the split.

Use only the facts given, and don't introduce any other number. Partner descriptions are self-reported, so treat them as claims. Give every partner listed an entry, and don't add partners. Every partner listed is vetted, so don't suggest otherwise.`;

export class AllocatorError extends Error {}

export async function proposeAllocation(args: { brief: ThreatBrief; partners: PartnerProfile[]; otherActive?: ThreatBrief[]; client?: Anthropic; effort?: "low" | "medium" | "high" }): Promise<AllocationResult> {
  const { eligible, excluded, input } = allocationFacts(args.brief, args.partners, args.otherActive ?? []);
  const text = JSON.stringify(input);
  const auditBase = { agent: "allocator" as const, at: new Date().toISOString(), inputSha256: createHash("sha256").update(text).digest("hex") };

  if (eligible.length === 0) return { summary: "No partner can take this tranche.", source: "no_partner_available", excluded, audit: { ...auditBase, llm: null } };
  if (eligible.length === 1) {
    const only = eligible[0];
    return {
      proposal: [{ partnerId: only.id, shareBps: 10_000, rationale: `${only.name} is the only partner available for this storm.` }],
      summary: `All of this tranche goes to ${only.name}, the only partner available.`,
      source: "only_one_partner",
      excluded,
      audit: { ...auditBase, llm: null },
    };
  }

  const fallback = (rejected: string, llm: AllocationResult["audit"]["llm"] = null): AllocationResult => ({
    summary: "Split equally between eligible partners, because the Allocator's proposal couldn't be used.",
    source: "fallback_equal_split",
    excluded,
    audit: { ...auditBase, llm, rejected },
  });

  let response;
  try {
    response = await withRetryableClient(args.client).beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
      output_config: { effort: args.effort ?? "low", format: betaZodOutputFormat(SplitSchema) },
    });
  } catch (err) {
    return fallback(`request failed: ${(err as Error).message}`);
  }
  const llm = { model: response.model, messageId: response.id, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
  const split = response.parsed_output;
  if (response.stop_reason !== "end_turn" || !split) return fallback(`stopped: ${response.stop_reason}`, llm);

  const ids = eligible.map((p) => p.id);
  const named = split.allocations.map((a) => a.partnerId);
  if (new Set(named).size !== named.length || named.length !== ids.length || !ids.every((id) => named.includes(id))) return fallback("didn't name each eligible partner exactly once", llm);
  if (split.allocations.some((a) => !Number.isInteger(a.sharePercent) || a.sharePercent < 0 || a.sharePercent > 100)) return fallback("a share isn't a whole percentage", llm);
  const total = split.allocations.reduce((sum, a) => sum + a.sharePercent, 0);
  if (total !== 100) return fallback(`shares add up to ${total}%`, llm);
  if (split.allocations.some((a) => !a.rationale.trim())) return fallback("a share has no reason", llm);

  // Reasons go in the public log, so a figure Claude can't source doesn't go out. Its own percentages are the one thing it may add.
  const allowed = allowedNumbers({ input, shares: split.allocations.map((a) => a.sharePercent), total });
  const stated = [split.summary, ...split.allocations.map((a) => a.rationale)];
  if (!stated.every((s) => onlyKnownNumbers(s, allowed, ids))) return fallback("a reason states a number not in the facts", llm);

  return {
    proposal: split.allocations.map((a) => ({ partnerId: a.partnerId, shareBps: a.sharePercent * 100, rationale: a.rationale })),
    summary: split.summary,
    source: "claude",
    excluded,
    audit: { ...auditBase, llm },
  };
}
