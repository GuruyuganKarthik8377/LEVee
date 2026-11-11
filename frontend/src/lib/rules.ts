import { US_GULF_HURRICANE as PLAYBOOK } from "../../../backend/policy/src/playbook.ts";

/**
 * The Policy Engine's published rules and its allocation check, the same logic as policy/src/rules.ts in the backend.
 * It runs here so visitors can test the rules for themselves. All amounts are in cents.
 * The numbers are read from the backend's published playbook, so the website can't show different rules from the ones the engine runs.
 */

export const RULES = {
  alertLevels: PLAYBOOK.tranche1.alertLevels,
  minLeadHours: PLAYBOOK.tranche1.minLeadHours,
  maxLeadHours: PLAYBOOK.tranche1.maxLeadHours,
  minConfidence: PLAYBOOK.tranche1.minConfidence,
  maxBriefAgeHours: PLAYBOOK.tranche1.maxBriefAgeHours,
  earlyShareBps: PLAYBOOK.tranche1.shareBps,
  skipWindowMinutes: PLAYBOOK.skipWindowMinutes,
  opsLimitCents: PLAYBOOK.opsApprovalAboveCents,
  maxPerPartnerCents: PLAYBOOK.maxPerPartnerCents,
  refundWindowHours: PLAYBOOK.refundWindowHours,
  proofDeadlineHours: PLAYBOOK.proofDeadlineHours,
};

export type SimPartner = { id: string; capacityCents: number };
export type Proposal = { partnerId: string; shareBps: number }[];
export type Plan = { allocations: { partnerId: string; cents: number }[]; heldCents: number; proposalRejected?: string };

/** The Allocator proposes and this re-checks. A bad proposal is rejected, and the money still moves on an equal split. */
export function planAllocations(poolCents: number, partners: SimPartner[], proposal: Proposal): Plan {
  const total = proposal.reduce((sum, p) => sum + p.shareBps, 0);
  const unknown = proposal.find((p) => !partners.some((partner) => partner.id === p.partnerId));
  let proposalRejected: string | undefined;
  if (unknown) proposalRejected = `${unknown.partnerId} is not a vetted partner`;
  else if (proposal.some((p) => p.shareBps < 0)) proposalRejected = "A share is negative";
  else if (total !== 10_000) proposalRejected = `The shares add up to ${total / 100}%, not 100%`;
  else if (new Set(proposal.map((p) => p.partnerId)).size !== proposal.length) proposalRejected = "A partner appears twice";

  const shares = proposalRejected ? partners.map((p) => ({ partnerId: p.id, shareBps: 10_000 / partners.length })) : proposal;
  const allocations = shares.map((s) => ({ partnerId: s.partnerId, cents: Math.floor((poolCents * s.shareBps) / 10_000) }));

  // Rounding leaves a few cents, which are handed out rather than stranded.
  let leftover = poolCents - allocations.reduce((sum, a) => sum + a.cents, 0);
  for (let i = 0; leftover > 0 && allocations.length > 0; i = (i + 1) % allocations.length, leftover--) allocations[i].cents++;

  for (const a of allocations) {
    const partner = partners.find((p) => p.id === a.partnerId)!;
    a.cents = Math.min(a.cents, RULES.maxPerPartnerCents, Math.max(partner.capacityCents, 0));
  }
  const paying = allocations.filter((a) => a.cents > 0);
  return { allocations: paying, heldCents: poolCents - paying.reduce((sum, a) => sum + a.cents, 0), ...(proposalRejected && { proposalRejected }) };
}

/** PayPal's rate as measured in the sandbox: 3.49% + $0.49, where a $10.00 charge nets $9.16. */
const feeCents = (cents: number) => Math.round(cents * 0.0349) + 49;

export type GiftCharge = { tranche: 1 | 2; chargedCents: number; feeCents: number; netCents: number };

/** An early donor's gift: 40% before landfall, and the rest once landfall is confirmed and proof passes. */
export function giftCharges(amountCents: number): GiftCharge[] {
  const first = Math.floor((amountCents * RULES.earlyShareBps) / 10_000);
  return ([[1, first], [2, amountCents - first]] as const).map(([tranche, chargedCents]) => ({
    tranche,
    chargedCents,
    feeCents: feeCents(chargedCents),
    netCents: chargedCents - feeCents(chargedCents),
  }));
}

export const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
