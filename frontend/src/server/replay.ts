import type { PaypalReader } from "../../../backend/agents/src/narrator/reader.ts";
import savedRun from "../../../backend/agents/fixtures/helene/run.json" with { type: "json" };
import { proposeAllocation, type AllocationResult } from "../../../backend/agents/src/allocator/agent.ts";
import { costUsd } from "../../../backend/agents/src/narrator/model.ts";
import { createLevee, type KeyValue, type LeveeDeps, type LeveePartner } from "../../../backend/agents/src/levee.ts";
import type { DonorMessage } from "../../../backend/agents/src/narrator/messages.ts";
import { runSentinel, SentinelError, type ThreatBrief } from "../../../backend/agents/src/sentinel/agent.ts";
import { replaySnapshot } from "../../../backend/agents/src/sentinel/feeds.ts";
import type { VerifierResult } from "../../../backend/agents/src/verifier/agent.ts";
import type { Ledger, LedgerRow, Payments } from "../../../backend/payments/src/types.ts";
import { US_GULF_HURRICANE, type MatchSponsor } from "../../../backend/policy/src/playbook.ts";

/**
 * Hurricane Helene replayed through the real backend: Sentinel's code, the Policy Engine and PayPal all run for real.
 * Claude's judgments are the saved results of the live Haiku run (backend/agents/fixtures/helene/run.json), so a replay costs no AI money.
 */

export const FIRED_ADVISORY = savedRun.firedAdvisory;
export const LANDFALL = { confirmedAt: "2024-09-27T03:10:00.000Z", source: "National Hurricane Center: near Perry, Florida, about 11:10 pm EDT on 26 Sep 2024" };
/** When partners send proof, as in src/fixtures/helene.ts. */
export const PROOF_AT = "2024-09-27T09:00:00.000Z";

type Anthropic = NonNullable<LeveeDeps["client"]>;
type SavedBrief ={ advisory: number; confidence: number; summary: string; reasons: string[] };
type SavedPayout = { poolCents: number; allocations: { partnerId: string; cents: number }[]; heldForReview?: { partnerId: string; cents: number }[] };

/** Sentinel's saved judgment for one advisory, handed back as Claude would. Signals like landfall and lead time are still worked out by code. */
const savedJudgment = (advisory: number) =>
  ({
    beta: {
      messages: {
        parse: async () => {
          const brief = (savedRun.briefs as SavedBrief[]).find((b) => b.advisory === advisory);
          if (!brief) throw new Error(`No saved Sentinel result for advisory ${advisory}`);
          return {
            stop_reason: "end_turn",
            model: "saved-helene-run",
            id: "saved",
            usage: { input_tokens: 0, output_tokens: 0 },
            parsed_output: { confidence: brief.confidence, sourcesAgree: "agree", summary: brief.summary, reasons: brief.reasons.map((text) => ({ text, sources: ["gdacs-event"] })), exposed: [] },
          };
        },
      },
    },
  }) as unknown as Anthropic;

/** Every other Claude call fails at once, so receipts and stories use their plain versions and nothing is spent, even with a key set. */
const noClaude: Anthropic = new Proxy(function () {}, {
  get: (_target, key) => (key === "then" ? undefined : noClaude),
  apply: () => Promise.reject(new Error("No Claude in a replay")),
}) as unknown as Anthropic;

/** The saved Allocator split for a tranche, as shares of what that tranche paid out. */
function savedSplit(tranche: 1 | 2, partners: { id: string }[]): AllocationResult {
  const payout = (tranche === 1 ? savedRun.t1 : savedRun.t2) as SavedPayout;
  const shareOf = (id: string) => [...payout.allocations, ...(payout.heldForReview ?? [])].filter((a) => a.partnerId === id).reduce((sum, a) => sum + a.cents, 0) / payout.poolCents;
  const ids = partners.map((p) => p.id);
  const proposal = ids.map((partnerId) => ({ partnerId, shareBps: Math.round(shareOf(partnerId) * 10_000), rationale: "The saved split from the live Helene run" }));
  // Whole basis points that add up to 10,000: rounding goes to the first partner.
  if (proposal.length) proposal[0].shareBps += 10_000 - proposal.reduce((sum, p) => sum + p.shareBps, 0);
  return { proposal, summary: "The saved split from the live Helene run", source: "claude", excluded: [], audit: { agent: "allocator", at: new Date().toISOString(), inputSha256: "saved-helene-run", llm: null } };
}

const savedVerdict = (partnerId: string, eventKey: string): VerifierResult => {
  const saved = (savedRun.verdicts as Record<string, { verdict: VerifierResult["verdict"]; summary: string }>)[partnerId];
  return { partnerId, eventKey, verdict: saved?.verdict ?? "human", summary: saved?.summary ?? "No saved result", checks: [], concerns: [], photoFindings: [], caveats: [], audit: { agent: "verifier", at: new Date().toISOString(), imagesSha256: [], llm: null } };
};

export type ReplayDeps = {
  /** This replay's own table: no other run's pledges or storms are in it. */
  kv: KeyValue;
  ledger: Ledger;
  readLedger: () => Promise<LedgerRow[]>;
  payments: Payments;
  partners: LeveePartner[];
  /** Keeps this replay's PayPal keys apart from every other run's. */
  runId: string;
  now: () => Date;
  advisory: () => number;
  deliver: (message: DonorMessage) => Promise<void>;
  /**
   * Only when answering a donor's question: the Narrator then uses Claude, and reads PayPal's real records of this run's
   * charges with `reader`. The storm's agents still give their saved results, and nothing else calls Claude.
   */
  answering?: { reader: PaypalReader };
  /**
   * Live AI: Sentinel judges the storm and the Allocator splits tranche 1 on Claude, as the hourly job does for a real
   * storm, and `onAi` hears what each decided, how long it took and what it cost. The Verifier keeps its saved verdicts,
   * since the replay has no proof photos to send; it runs live on the responder console. Notices stay plain.
   */
  live?: { onAi: (step: AiStep) => void } & LiveAgents;
  /** Sponsors who match donors' gifts: invoiced through PayPal Invoicing once a tranche pays out. */
  sponsors?: () => MatchSponsor[];
};

/** Stand-ins for Claude's two live agents, for tests. */
export type LiveAgents = { sentinel?: typeof runSentinel; allocate?: typeof proposeAllocation };

export type AiStep = { ms: number; costUsd: number } & ({ agent: "sentinel"; brief: ThreatBrief } | { agent: "allocator"; allocation: AllocationResult });

/** Sentinel at the effort the hourly job uses. A brief with a claim it didn't source is refused, so it gets one more try. */
async function liveSentinel(snapshot: Parameters<typeof runSentinel>[0], onAi: (step: AiStep) => void, sentinel = runSentinel) {
  const started = Date.now();
  let result;
  try {
    result = await sentinel(snapshot, undefined, "high");
  } catch (err) {
    if (!(err instanceof SentinelError)) throw err;
    result = await sentinel(snapshot, undefined, "high");
  }
  onAi({ agent: "sentinel", brief: result.brief, ms: Date.now() - started, costUsd: costUsd(result.audit.usage) });
  return result;
}

export function heleneReplay(deps: ReplayDeps) {
  return createLevee({
    kv: deps.kv,
    ledger: deps.ledger,
    readLedger: deps.readLedger,
    // ponytail: a replay's decisions aren't kept. Send them to the audit log if /audit should show demo runs.
    audit: async () => {},
    payments: deps.payments,
    reader: deps.answering?.reader ?? { charge: async () => null, refund: async () => null },
    playbook: US_GULF_HURRICANE,
    snapshots: async () => [replaySnapshot(deps.advisory(), "helene")],
    partners: async () => deps.partners,
    deliver: deps.deliver,
    skipUrl: () => "/run",
    usdPerUnit: { USD: 1 },
    ...(deps.sponsors && { sponsors: async () => deps.sponsors!() }),
    // Left out when answering, so the Narrator makes its own client from ANTHROPIC_API_KEY.
    ...(!deps.answering && { client: noClaude }),
    now: deps.now,
    replayRunId: deps.runId,
    agents: {
      assess: (snapshot) => (deps.live ? liveSentinel(snapshot, deps.live.onAi, deps.live.sentinel) : runSentinel(snapshot, savedJudgment(snapshot.advisories.length))),
      allocate: async (args) => {
        if (!deps.live) return savedSplit(args.tranche, args.partners);
        const started = Date.now();
        const allocation = await (deps.live.allocate ?? proposeAllocation)(args);
        if (allocation.audit.llm) deps.live.onAi({ agent: "allocator", allocation, ms: Date.now() - started, costUsd: costUsd(allocation.audit.llm.usage) });
        return allocation;
      },
      verify: async (pack) => savedVerdict(pack.partnerId, pack.eventKey),
    },
  });
}

/** A run's own corner of the backend's table, so replays never see each other's pledges or storms. */
export function scopedKeyValue(kv: KeyValue, prefix: string): KeyValue {
  return { get: (key) => kv.get(prefix + key), set: (key, value) => kv.set(prefix + key, value), list: (p) => kv.list(prefix + p) };
}
