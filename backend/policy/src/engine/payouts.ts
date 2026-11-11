// The tranche's payout: only money really received, plus the Reserve's share for tranche 1, split between partners and sent in one batch.
import type { HeldShare, ReviewCase, TrancheState } from "../engine.ts";
import type { PayoutResult } from "../../../payments/src/types.ts";
import { partnerRoomCents, planAllocations, reserveBalanceCents, reserveDrawCents, toCents } from "../rules.ts";
import type { EngineContext } from "./context.ts";
import type { createMatches } from "./matches.ts";

export function createPayouts({ ledger, store, reviews, playbook, readLedger, at, money, record, reviewKey, sendBatch }: EngineContext, matches: ReturnType<typeof createMatches>) {
  // Runs once every charge has an outcome. rerun starts execute again, for when PayPal refuses the Reserve's share.
  async function payOut(state: TrancheState, trancheKey: string, rerun: () => Promise<TrancheState>): Promise<TrancheState> {
    // Only money actually received can go out: net of fees, and not while PayPal is still deciding on a capture.
    // The Reserve is what lets tranche 1 go out anyway. A capture that completes later refills it, through settleLateCharges.
    const settled = state.items.filter((i) => i.result?.status === "COMPLETED");
    const poolCents = settled.reduce((sum, i) => sum + toCents(i.result!.net ?? money(i.cents)), 0);
    const pendingCents = state.items.filter((i) => i.result?.status === "PENDING").reduce((sum, i) => sum + i.cents, 0);
    const reserveCents = state.payout
      ? (state.payout.reserveCents ?? 0)
      : state.tranche === 1 && !state.reserveRefused
        ? reserveDrawCents(reserveBalanceCents(await readLedger()), partnerRoomCents(state.partners, playbook, poolCents), playbook)
        : 0;
    if (poolCents + reserveCents === 0) {
      state.status = "no_funds";
      await store.save(state);
      await record(trancheKey, "no_funds", { detail: { pendingCents } });
      return state;
    }

    // A rerun after a refused or unknown payout sends the same allocations under the same batch key.
    let plan = state.payout;
    if (!plan) {
      const reviewIds = state.reviewPartnerIds ?? [];
      const cases = new Map<string, ReviewCase | undefined>();
      for (const id of reviewIds) cases.set(id, await reviews.get(reviewKey(state.eventKey, id)));
      const eligible = state.partners.filter((p) => cases.get(p.id)?.status !== "rejected");
      const { allocations, heldCents, proposalRejected } = planAllocations(poolCents + reserveCents, eligible, playbook, state.proposal);
      const waiting = (partnerId: string) => reviewIds.includes(partnerId) && cases.get(partnerId)?.status !== "approved";
      const heldForReview: HeldShare[] = allocations.filter((a) => waiting(a.partner.id)).map((a) => ({ partnerId: a.partner.id, cents: a.cents, status: "awaiting_review" }));
      plan = {
        batchKey: trancheKey,
        poolCents,
        ...(reserveCents > 0 && { reserveCents }),
        pendingCents,
        heldCents,
        allocations: allocations.filter((a) => !waiting(a.partner.id)).map((a) => ({ partnerId: a.partner.id, cents: a.cents })),
        ...(proposalRejected && { proposalRejected }),
        ...(heldForReview.length && { heldForReview }),
      };
    }
    state.payout = plan;
    if (plan.allocations.length === 0) {
      state.status = "held_for_review";
      await store.save(state);
      await record(trancheKey, "all_shares_held", { detail: plan });
      return state;
    }
    state.status = "paying";
    await store.save(state);
    // Written again on a rerun, which the ledger ignores, so a draw is counted once however often this runs.
    if (reserveCents > 0) await ledger.record({ kind: "reserve_draw", ref: trancheKey, paypalId: trancheKey, status: "COMMITTED", amount: money(reserveCents), at: at() });

    let result: PayoutResult;
    try {
      result = await sendBatch(state, plan.batchKey, plan.allocations, trancheKey);
    } catch (err) {
      await record(trancheKey, "payout_outcome_unknown", { detail: { batchKey: plan.batchKey, error: (err as Error).message } });
      return state;
    }
    plan.result = result;
    // The ledger says the Reserve has this money, but PayPal's balance doesn't. Donors' money mustn't wait on that, so it goes now without the draw.
    if (result.status === "DENIED" && result.reason === "INSUFFICIENT_FUNDS" && plan.reserveCents) {
      await ledger.record({ kind: "reserve_credit", ref: trancheKey, paypalId: `${trancheKey}:refused`, status: "CREDITED", amount: money(plan.reserveCents), at: at() });
      await record(trancheKey, "reserve_draw_refused", { detail: { reserveCents: plan.reserveCents, reason: result.reason } });
      delete state.payout;
      state.reserveRefused = true;
      await store.save(state);
      return rerun();
    }
    state.status = result.status === "DENIED" ? "payout_denied" : "paid";
    await store.save(state);
    await record(trancheKey, state.status === "paid" ? "payout_sent" : "payout_denied", { detail: { ...plan, proposal: state.proposal } });
    if (state.status === "paid") {
      await matches.invoiceSponsors(state);
      await matches.payMatches(state);
    }
    return state;
  }

  return { payOut };
}
