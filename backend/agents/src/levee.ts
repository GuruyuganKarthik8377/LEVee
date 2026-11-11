// Levee end to end, for the server to call from its routes and hourly job. It holds the order things happen in, and no rules of its own:
// agents judge, the Policy Engine decides and moves money, and this only passes things between them.
// Each part of that lives in ./levee/, one job per file. This file connects them, and is the one the server imports.
import type Anthropic from "@anthropic-ai/sdk";
import type { Ledger, LedgerRow, Payments } from "../../payments/src/types.ts";
import { createPolicyEngine, type AuditEntry, type TrancheState } from "../../policy/src/engine.ts";
import type { MatchSponsor, Playbook, Pledge } from "../../policy/src/playbook.ts";
import { proposeAllocation, type AllocationResult, type PartnerProfile } from "./allocator/agent.ts";
import type { DraftResult } from "./concierge/agent.ts";
import { createDonors } from "./levee/donors.ts";
import { createEvents } from "./levee/events.ts";
import { createOps } from "./levee/ops.ts";
import { createPledges } from "./levee/pledges.ts";
import { createProofs } from "./levee/proofs.ts";
import { imageRegistry, reviewStore, trancheStore, translationCache, type EventRecord, type KeyValue, type VerdictRecord } from "./levee/stores.ts";
import { createTick } from "./levee/tick.ts";
import type { DonorAnswer, Story } from "./narrator/agent.ts";
import { writeNotice, type DonorMessage } from "./narrator/messages.ts";
import type { PaypalReader } from "./narrator/reader.ts";
import { runSentinel, type SentinelAudit, type ThreatBrief } from "./sentinel/agent.ts";
import type { Snapshot } from "./sentinel/feeds.ts";
import { runVerifier, type VerifierResult } from "./verifier/agent.ts";
import type { ProofPack } from "./verifier/proof.ts";

export { memoryKeyValue, type KeyValue } from "./levee/stores.ts";
export { LeveeError } from "./levee/errors.ts";

// radiusKm and utcOffsetMinutes come from the partner's signup: photo timestamps carry no time zone.
export type LeveePartner = PartnerProfile & { email: string; radiusKm: number; utcOffsetMinutes: number };

// What a partner uploads. When money arrived, how much, landfall and its service area all come from Levee's own records, so they can't be moved to pass a check.
export type ProofUpload = { eventKey: string; partnerId: string; photos: ProofPack["photos"]; receipts: ProofPack["receipts"]; distribution: ProofPack["distribution"]; sample?: boolean };

export type TickReport = { eventKey: string; actions: string[]; error?: string };

export type LeveeDeps = {
  kv: KeyValue;
  ledger: Ledger;
  readLedger: () => Promise<LedgerRow[]>;
  audit: (entry: AuditEntry | SentinelAudit | AllocationResult["audit"] | VerifierResult["audit"] | DonorAnswer["audit"] | Story["audit"] | NonNullable<DraftResult["audit"]>) => Promise<void>;
  payments: Payments;
  reader: PaypalReader;
  playbook: Playbook;
  // Where storms come from: GDACS live, or saved advisories in a replay.
  snapshots: () => Promise<Snapshot[]>;
  partners: () => Promise<LeveePartner[]>;
  sponsors?: () => Promise<MatchSponsor[]>;
  // Sends a notice or receipt by email or SMS. Throwing on a notice means that donor isn't charged.
  deliver: (message: DonorMessage) => Promise<void>;
  skipUrl: (trancheKey: string, pledgeId: string) => string;
  // Levee's own exchange rates: partners don't supply them.
  usdPerUnit: Record<string, number>;
  client?: Anthropic;
  now?: () => Date;
  // Keeps one replay run's PayPal keys apart from another's. A live storm's id is its own.
  replayRunId?: string;
  // Replays swap in saved results here, to cost nothing and tell the same story every run.
  agents?: {
    assess?: (snapshot: Snapshot) => Promise<{ brief: ThreatBrief; audit?: SentinelAudit }>;
    allocate?: (args: { brief: ThreatBrief; partners: PartnerProfile[]; otherActive: ThreatBrief[]; tranche: 1 | 2 }) => Promise<AllocationResult>;
    verify?: (pack: ProofPack) => Promise<VerifierResult>;
  };
};

// Everything the parts of Levee share: the server's dependencies, the stores on its table, the engine, and the agents.
function leveeContext(deps: LeveeDeps) {
  const { kv, playbook, payments } = deps;
  const now = deps.now ?? (() => new Date());
  const store = trancheStore(kv);
  const reviews = reviewStore(kv);
  const cache = translationCache(kv);
  const languageOf = async (donorId: string) => (await kv.get<string>(`language:${donorId}`)) ?? "en";

  const engine = createPolicyEngine({
    payments,
    ledger: deps.ledger,
    store,
    reviews,
    playbook,
    readLedger: deps.readLedger,
    audit: deps.audit,
    now,
    notify: async (notice) => deps.deliver(await writeNotice(notice, deps.skipUrl(notice.trancheKey, notice.pledgeId), await languageOf(notice.donorId), cache, deps.client)),
  });

  const assess = deps.agents?.assess ?? ((snapshot: Snapshot) => runSentinel(snapshot, deps.client));
  const allocate = deps.agents?.allocate ?? ((args) => proposeAllocation({ ...args, ...(deps.client && { client: deps.client }) }));
  const verify = deps.agents?.verify ?? ((pack: ProofPack) => runVerifier(pack, { registry: imageRegistry(kv), usdPerUnit: deps.usdPerUnit, ...(deps.client && { client: deps.client }) }));

  const pledges = () => kv.list<Pledge>("pledge:");
  const events = () => kv.list<EventRecord>("event:");
  const trancheOf = async (eventKey: string) => [await store.get(`${eventKey}:t1`), await store.get(`${eventKey}:t2`)].filter((s): s is TrancheState => !!s);

  async function verdictsFor(eventKey: string) {
    return kv.list<VerdictRecord>(`verdict:${eventKey}:`);
  }

  return { deps, kv, playbook, payments, now, store, reviews, cache, languageOf, engine, assess, allocate, verify, pledges, events, trancheOf, verdictsFor };
}
export type LeveeContext = ReturnType<typeof leveeContext>;

export function createLevee(deps: LeveeDeps) {
  const ctx = leveeContext(deps);
  const donors = createDonors(ctx);
  const flow = createTick(ctx, donors);
  const pledges = createPledges(ctx);
  const proofs = createProofs(ctx);
  const ops = createOps(ctx, flow.advance);
  const events = createEvents(ctx);

  return {
    tick: flow.tick,
    pledgeChat: pledges.pledgeChat,
    confirmPledge: pledges.confirmPledge,
    completePledge: pledges.completePledge,
    skip: donors.skip,
    donorActivity: donors.donorActivity,
    askNarrator: donors.askNarrator,
    cancelReserve: donors.cancelReserve,
    reserveBalance: donors.reserveBalance,
    confirmLandfall: ops.confirmLandfall,
    submitProof: proofs.submitProof,
    listOpenReviews: ops.listOpenReviews,
    decideReview: ops.decideReview,
    approveTranche: ops.approveTranche,
    getEvent: events.getEvent,
    partnerEvents: events.partnerEvents,
  };
}
