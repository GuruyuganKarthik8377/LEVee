// The notice window: a tranche opens, each donor is told what will be charged and can skip until it closes. Over the ops limit, a person approves first.
import type { TrancheState } from "../engine.ts";
import type { AllocationProposal, MatchSponsor, Partner } from "../playbook.ts";
import type { PlannedCharge } from "../rules.ts";
import type { EngineContext } from "./context.ts";

export function createNotices({ store, playbook, notify, now, at, money, record }: EngineContext) {
  async function sendNotices(state: TrancheState) {
    // With no donors to wait for, Reserve money can go at once.
    state.chargeAt = new Date(now().getTime() + (state.items.length ? playbook.skipWindowMinutes * 60_000 : 0)).toISOString();
    state.status = "notice_open";
    for (const item of state.items) {
      try {
        await notify({ kind: "pre_charge", trancheKey: state.key, pledgeId: item.pledgeId, donorId: item.donorId, amount: money(item.cents), skipUntil: state.chargeAt, eventName: state.eventName });
      } catch {
        item.notCharged = "notice_failed";
      }
    }
    await store.save(state);
    await record(state.key, "notices_sent", { detail: { chargeAt: state.chargeAt, notified: state.items.filter((i) => !i.notCharged).length, failed: state.items.filter((i) => i.notCharged).length } });
  }

  async function open(args: {
    eventKey: string;
    tranche: 1 | 2;
    eventName: string;
    charges: PlannedCharge[];
    partners: Partner[];
    proposal?: AllocationProposal;
    sponsors?: MatchSponsor[];
    reviewPartnerIds?: string[];
    reserveEstimateCents?: number;
  }): Promise<TrancheState> {
    const key = `${args.eventKey}:t${args.tranche}`;
    const state: TrancheState = {
      key,
      eventKey: args.eventKey,
      eventName: args.eventName,
      tranche: args.tranche,
      playbookId: playbook.id,
      status: "awaiting_approval",
      openedAt: at(),
      partners: args.partners,
      ...(args.proposal && { proposal: args.proposal }),
      ...(args.sponsors?.length && { sponsors: args.sponsors }),
      ...(args.reviewPartnerIds?.length && { reviewPartnerIds: args.reviewPartnerIds }),
      items: args.charges.map(({ pledge, cents }) => ({ pledgeId: pledge.id, donorId: pledge.donorId, paymentTokenId: pledge.paymentTokenId, chargeKey: `${pledge.id}:${key}`, cents })),
    };
    const estimate = state.items.reduce((sum, i) => sum + i.cents, 0) + (args.reserveEstimateCents ?? 0);
    if (estimate > playbook.opsApprovalAboveCents) {
      await store.save(state);
      await record(key, "awaiting_ops_approval", { detail: { estimateCents: estimate, limitCents: playbook.opsApprovalAboveCents } });
    } else {
      await sendNotices(state);
    }
    return state;
  }

  return {
    open,

    // One click from ops, for a tranche over the limit.
    async approve(trancheKey: string, by: string): Promise<TrancheState> {
      const state = await store.get(trancheKey);
      if (!state) throw new Error(`No tranche ${trancheKey}`);
      if (state.status !== "awaiting_approval") return state;
      state.approvedBy = by;
      await record(trancheKey, "ops_approved", { detail: { by } });
      await sendNotices(state);
      return state;
    },

    // The donor's one-tap skip. Returns false once the window has closed.
    async skip(trancheKey: string, pledgeId: string): Promise<boolean> {
      const state = await store.get(trancheKey);
      const item = state?.items.find((i) => i.pledgeId === pledgeId);
      if (!state || !item) throw new Error(`No pledge ${pledgeId} in ${trancheKey}`);
      const windowOpen = state.status === "notice_open" && now() < new Date(state.chargeAt!);
      if (!windowOpen) return false;
      item.notCharged = "skipped";
      await store.save(state);
      await record(trancheKey, "donor_skipped", { detail: { pledgeId } });
      return true;
    },
  };
}
