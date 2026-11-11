// The only part of Levee allowed to move money. No AI runs here: agents supply inputs, and fixed rules decide.
// This file decides when a tranche fires and runs each one through its stages, which live in ./engine/, one job per file.
import type { ChargeResult, InvoiceResult, PayoutResult, RefundResult } from "../../payments/src/types.ts";
import type { TrancheBrief } from "./brief.ts";
import { createCharges } from "./engine/charges.ts";
import { createContext, type EngineDeps } from "./engine/context.ts";
import { createHeldShares } from "./engine/held.ts";
import { createLateCharges } from "./engine/late.ts";
import { createMatches } from "./engine/matches.ts";
import { createNotices } from "./engine/notices.ts";
import { createPayouts } from "./engine/payouts.ts";
import { createRefunds } from "./engine/refunds.ts";
import { createReviews } from "./engine/reviews.ts";
import type { AllocationProposal, MatchSponsor, Partner, Pledge, VerifierVerdict } from "./playbook.ts";
import { checkTranche1, partnerRoomCents, planCharges, reserveBalanceCents, reserveDrawCents, type Check, type Excluded } from "./rules.ts";

export type ChargeItem = {
  pledgeId: string;
  donorId: string;
  paymentTokenId: string;
  chargeKey: string;
  cents: number;
  // Why this pledge won't be charged: the donor skipped, or the notice never reached them.
  notCharged?: "skipped" | "notice_failed";
  firstAttemptAt?: string;
  result?: ChargeResult;
  refund?: RefundResult;
  // It completed after the payout had gone, so it joined the Reserve for the next storm.
  joinedReserve?: boolean;
};

// A sponsor's invoice, then the payout of what it really paid. paidTo is fixed before sending, so a retry sends the same money.
export type MatchInvoice = {
  sponsorId: string;
  matchKey: string;
  cents: number;
  result?: InvoiceResult;
  // Cancelled or refunded, so no money will come.
  closed?: boolean;
  payout?: { status: "sending" | "done"; netCents: number; batchKey: string; paidTo: { partnerId: string; cents: number }[]; heldCents: number; result?: PayoutResult };
};

export type TrancheStatus =
  | "awaiting_approval" // over the ops limit: nothing happens until a person approves
  | "notice_open" // donors notified, skip window running
  | "charging" // some charges have no known outcome yet
  | "paying" // charges settled, payout outcome not known yet: safe to run again
  | "held_for_review" // money collected, but every partner's share is waiting on a person
  | "paid" // PayPal accepted the batch. Per-partner results arrive by webhook as payout_item ledger rows.
  | "payout_denied" // PayPal refused the batch: nobody paid, safe to run again
  | "no_funds" // nothing was collected, so there is nothing to pay
  | "needs_review"; // a charge's outcome is unknown and too old to retry safely

export type TrancheState = {
  key: string;
  eventKey: string;
  eventName: string;
  tranche: 1 | 2;
  playbookId: string;
  status: TrancheStatus;
  openedAt: string;
  chargeAt?: string;
  approvedBy?: string;
  items: ChargeItem[];
  partners: Partner[];
  proposal?: AllocationProposal;
  // Partners whose share waits on a person's decision.
  reviewPartnerIds?: string[];
  sponsors?: MatchSponsor[];
  // PayPal didn't have the Reserve's money, so this tranche went out without it.
  reserveRefused?: boolean;
  invoices?: MatchInvoice[];
  // poolCents is what donors' charges brought in, and reserveCents what the Reserve added. Allocations pay out both.
  payout?: { batchKey: string; poolCents: number; reserveCents?: number; pendingCents: number; heldCents: number; allocations: { partnerId: string; cents: number }[]; result?: PayoutResult; proposalRejected?: string; heldForReview?: HeldShare[] };
};

// One partner's share while a person decides, then where it went. paidTo is fixed before sending, so a retry sends the same money.
export type HeldShare = {
  partnerId: string;
  cents: number;
  status: "awaiting_review" | "releasing" | "done";
  batchKey?: string;
  paidTo?: { partnerId: string; cents: number }[];
  // What no verified partner had room for after a rejection. It stays with Levee, and is reported.
  strandedCents?: number;
  result?: PayoutResult;
};

// What a reviewer sees. Opened automatically when a partner has no Verifier pass at tranche 2.
export type ReviewCase = {
  key: string;
  eventKey: string;
  partnerId: string;
  verdict: "partial" | "human" | "no_proof";
  summary?: string;
  failedChecks: string[];
  status: "open" | "approved" | "rejected";
  openedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
};
export type ReviewStore = { get(key: string): Promise<ReviewCase | undefined>; save(review: ReviewCase): Promise<void>; listOpen(): Promise<ReviewCase[]> };

export function memoryReviews(): ReviewStore {
  const cases = new Map<string, ReviewCase>();
  return {
    async get(key) {
      const c = cases.get(key);
      return c && structuredClone(c);
    },
    async save(review) {
      cases.set(review.key, structuredClone(review));
    },
    async listOpen() {
      return [...cases.values()].filter((c) => c.status === "open").map((c) => structuredClone(c));
    },
  };
}

export type TrancheStore = { get(key: string): Promise<TrancheState | undefined>; save(state: TrancheState): Promise<void> };

export function memoryStore(): TrancheStore {
  const states = new Map<string, TrancheState>();
  return {
    async get(key) {
      const state = states.get(key);
      return state && structuredClone(state);
    },
    async save(state) {
      states.set(state.key, structuredClone(state));
    },
  };
}

export type AuditEntry = { agent: "policy-engine"; at: string; trancheKey: string; action: string; checks?: Check[]; detail?: unknown };
export type Notice = { kind: "pre_charge"; trancheKey: string; pledgeId: string; donorId: string; amount: { currency_code: string; value: string }; skipUntil: string; eventName: string };

export type Decision = { fired: boolean; reason: string; checks: Check[]; excluded: Excluded[]; state?: TrancheState };

type Deps = EngineDeps;

export function createPolicyEngine(deps: Deps) {
  const ctx = createContext(deps);
  const { store, reviews, playbook, readLedger, now, at, record, reviewKey } = ctx;
  const notices = createNotices(ctx);
  const { open } = notices;
  const late = createLateCharges(ctx);
  const held = createHeldShares(ctx);
  const matches = createMatches(ctx);
  const charges = createCharges(ctx);
  const payouts = createPayouts(ctx, matches);
  const reviewDesk = createReviews(ctx, held, matches);
  const refunds = createRefunds(ctx);

  const engine = {
    // Tranche 1: safe to call on every new brief. It fires at most once per event, however often it runs.
    async evaluateTranche1(args: { eventKey: string; brief: TrancheBrief; pledges: Pledge[]; partners: Partner[]; proposal?: AllocationProposal; sponsors?: MatchSponsor[] }): Promise<Decision> {
      const key = `${args.eventKey}:t1`;
      const checks = checkTranche1(args.brief, playbook, now());
      const existing = await store.get(key);
      const finish = async (decision: Decision) => {
        await record(key, decision.fired ? "tranche_fired" : "tranche_not_fired", { checks, detail: { reason: decision.reason, excluded: decision.excluded, confidence: args.brief.confidence, briefAsOf: args.brief.asOf } });
        return decision;
      };
      if (existing) return finish({ fired: false, reason: "already fired for this event", checks, excluded: [], state: existing });
      const failed = checks.filter((c) => !c.passed);
      if (failed.length > 0) return finish({ fired: false, reason: `not met: ${failed.map((c) => c.rule).join(", ")}`, checks, excluded: [] });
      if (args.partners.length === 0) return finish({ fired: false, reason: "no vetted partners", checks, excluded: [] });

      const rows = await readLedger();
      const { charges, excluded } = planCharges(args.pledges, 1, rows, playbook, now().getUTCFullYear());
      const reserveEstimateCents = reserveDrawCents(reserveBalanceCents(rows), partnerRoomCents(args.partners, playbook), playbook);
      if (charges.length === 0 && reserveEstimateCents === 0) return finish({ fired: false, reason: "no pledges to charge", checks, excluded });
      const state = await open({ eventKey: args.eventKey, tranche: 1, eventName: args.brief.eventName, charges, partners: args.partners, proposal: args.proposal, sponsors: args.sponsors, reserveEstimateCents });
      return finish({ fired: true, reason: "all rules met", checks, excluded, state });
    },

    // Tranche 2: landfall confirmed, tranche 1 paid, and at least one partner passed. Only partners who passed get paid now.
    // Safe to call again after a review: a partner a person approved counts as passed.
    async evaluateTranche2(args: { eventKey: string; eventName: string; landfall?: { confirmedAt: string; source: string }; verdicts: VerifierVerdict[]; pledges: Pledge[]; partners: Partner[]; proposal?: AllocationProposal; sponsors?: MatchSponsor[] }): Promise<Decision> {
      const key = `${args.eventKey}:t2`;
      const first = await store.get(`${args.eventKey}:t1`);
      const verified: Partner[] = [];
      const inReview: Partner[] = [];
      for (const partner of args.partners) {
        const review = await reviews.get(reviewKey(args.eventKey, partner.id));
        const verdict = args.verdicts.find((v) => v.partnerId === partner.id);
        if (review?.status === "rejected") continue;
        if (review?.status === "approved" || verdict?.verdict === "pass") {
          verified.push(partner);
          continue;
        }
        inReview.push(partner);
        if (!review) {
          const opened: ReviewCase = {
            key: reviewKey(args.eventKey, partner.id),
            eventKey: args.eventKey,
            partnerId: partner.id,
            verdict: verdict?.verdict === "partial" || verdict?.verdict === "human" ? verdict.verdict : "no_proof",
            ...(verdict?.summary && { summary: verdict.summary }),
            failedChecks: verdict?.failedChecks ?? [],
            status: "open",
            openedAt: at(),
          };
          await reviews.save(opened);
          await record(key, "review_opened", { detail: { partnerId: partner.id, verdict: opened.verdict } });
        }
      }
      const confirmed = args.landfall !== undefined && new Date(args.landfall.confirmedAt) <= now();
      const checks: Check[] = [
        { rule: "Landfall confirmed", required: "confirmed, with a source", actual: args.landfall ? `${args.landfall.confirmedAt} (${args.landfall.source})` : "not confirmed", passed: confirmed },
        { rule: "Tranche 1 paid", required: "paid", actual: first?.status ?? "did not fire", passed: first?.status === "paid" },
        { rule: "Verifier pass", required: "at least one partner", actual: `${verified.length} of ${args.partners.length}`, passed: verified.length > 0 },
      ];
      const existing = await store.get(key);
      const finish = async (decision: Decision) => {
        await record(key, decision.fired ? "tranche_fired" : "tranche_not_fired", { checks, detail: { reason: decision.reason, excluded: decision.excluded, verdicts: args.verdicts } });
        return decision;
      };
      if (existing) return finish({ fired: false, reason: "already fired for this event", checks, excluded: [], state: existing });
      const failed = checks.filter((c) => !c.passed);
      if (failed.length > 0) return finish({ fired: false, reason: `not met: ${failed.map((c) => c.rule).join(", ")}`, checks, excluded: [] });

      // Skipping is per event: a donor who skipped tranche 1 isn't charged for tranche 2 either.
      const skipped = new Set(first!.items.filter((i) => i.notCharged === "skipped").map((i) => i.pledgeId));
      const { charges, excluded } = planCharges(args.pledges.filter((p) => !skipped.has(p.id)), 2, await readLedger(), playbook, now().getUTCFullYear());
      for (const pledgeId of skipped) excluded.push({ pledgeId, reason: "donor skipped this event" });
      if (charges.length === 0) return finish({ fired: false, reason: "no pledges to charge", checks, excluded });
      const hold = playbook.unverifiedShare === "hold";
      const state = await open({
        eventKey: args.eventKey,
        tranche: 2,
        eventName: args.eventName,
        charges,
        partners: hold ? [...verified, ...inReview] : verified,
        proposal: args.proposal,
        sponsors: args.sponsors,
        reviewPartnerIds: hold ? inReview.map((p) => p.id) : [],
      });
      return finish({ fired: true, reason: "all rules met", checks, excluded, state });
    },

    // One click from ops, for a tranche over the limit.
    approve: notices.approve,

    // The donor's one-tap skip. Returns false once the window has closed.
    skip: notices.skip,

    // What the ops screen lists.
    listOpenReviews: reviewDesk.listOpenReviews,

    // A person's decision on a flagged partner. It can't be changed afterwards, because the money follows it.
    decideReview: reviewDesk.decideReview,

    // A donor's refund request, which the Narrator can only propose. Fixed rules decide, and only this moves the money back.
    refundCharge: refunds.refundCharge,

    // Charges, then pays. Safe to run repeatedly: results are saved as they happen, and work already done is never redone.
    async execute(trancheKey: string): Promise<TrancheState> {
      const state = await store.get(trancheKey);
      if (!state) throw new Error(`No tranche ${trancheKey}`);
      if (state.status === "paid" || state.status === "held_for_review" || state.status === "no_funds") await late.settleLateCharges(state);
      if (state.status === "paid" || state.status === "held_for_review") {
        await held.settleHeld(state);
        if (state.status === "paid") {
          await matches.invoiceSponsors(state);
          await matches.payMatches(state);
        }
        return state;
      }
      if (["awaiting_approval", "no_funds", "needs_review"].includes(state.status)) return state;
      if (state.status === "notice_open") {
        if (now() < new Date(state.chargeAt!)) return state;
        state.status = "charging";
      }
      if (!(await charges.chargeDue(state, trancheKey))) return state;
      return payouts.payOut(state, trancheKey, () => engine.execute(trancheKey));
    },
  };
  return engine;
}
