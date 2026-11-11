// Shares held while a person reviews a partner: released to it on approval, or moved to partners who passed on rejection.
import type { TrancheState } from "../engine.ts";
import type { Partner } from "../playbook.ts";
import type { PayoutResult } from "../../../payments/src/types.ts";
import type { EngineContext } from "./context.ts";

export function createHeldShares({ store, reviews, playbook, record, reviewKey, sendBatch }: EngineContext) {
  // Sends held shares once a person has decided. Safe to run again: each share's batch key and amounts are fixed before sending.
  async function settleHeld(state: TrancheState) {
    const plan = state.payout;
    if (!plan?.heldForReview) return;
    for (const held of plan.heldForReview) {
      if (held.status === "done") continue;
      const review = await reviews.get(reviewKey(state.eventKey, held.partnerId));
      if (!review || review.status === "open") continue;

      if (held.status === "awaiting_review") {
        if (review.status === "approved") {
          held.paidTo = [{ partnerId: held.partnerId, cents: held.cents }];
          held.batchKey = `${state.key}:release:${held.partnerId}`;
        } else {
          // Rejected: the money goes to partners who passed, as far as they have room.
          const undecided = state.reviewPartnerIds ?? [];
          const passed: Partner[] = [];
          for (const partner of state.partners) {
            if (!undecided.includes(partner.id) || (await reviews.get(reviewKey(state.eventKey, partner.id)))?.status === "approved") passed.push(partner);
          }
          const paidTo = passed.map((partner) => ({ partnerId: partner.id, cents: 0 }));
          const room = (partnerId: string, extra: number) => {
            const partner = passed.find((x) => x.id === partnerId)!;
            const already = plan.allocations.find((a) => a.partnerId === partnerId)?.cents ?? 0;
            return Math.min(playbook.maxPerPartnerCents, partner.capacityCents ?? Infinity) - already - extra > 0;
          };
          let left = held.cents;
          for (let moved = true; left > 0 && moved; ) {
            moved = false;
            for (const entry of paidTo) {
              if (left > 0 && room(entry.partnerId, entry.cents)) {
                entry.cents++;
                left--;
                moved = true;
              }
            }
          }
          held.paidTo = paidTo.filter((x) => x.cents > 0);
          held.strandedCents = left;
          held.batchKey = `${state.key}:reallocate:${held.partnerId}`;
          plan.heldCents += left;
        }
        held.status = "releasing";
        await store.save(state);
      }

      if (held.paidTo!.length === 0) {
        held.status = "done";
        await store.save(state);
        await record(state.key, "held_share_stranded", { detail: { partnerId: held.partnerId, strandedCents: held.strandedCents } });
        continue;
      }
      let result: PayoutResult;
      try {
        result = await sendBatch(state, held.batchKey!, held.paidTo!);
      } catch (err) {
        await record(state.key, "held_share_outcome_unknown", { detail: { partnerId: held.partnerId, error: (err as Error).message } });
        continue;
      }
      held.result = result;
      if (result.status === "DENIED") {
        await store.save(state);
        await record(state.key, "held_share_denied", { detail: { partnerId: held.partnerId, reason: result.reason } });
        continue;
      }
      for (const paid of held.paidTo!) {
        const existing = plan.allocations.find((a) => a.partnerId === paid.partnerId);
        if (existing) existing.cents += paid.cents;
        else plan.allocations.push({ ...paid });
      }
      plan.result ??= result;
      held.status = "done";
      if (state.status === "held_for_review") state.status = "paid";
      await store.save(state);
      await record(state.key, "held_share_released", { detail: { partnerId: held.partnerId, decision: review.status, paidTo: held.paidTo, strandedCents: held.strandedCents, batch: result.payoutBatchId } });
    }
  }

  return { settleHeld };
}
