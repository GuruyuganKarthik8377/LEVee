// Pure rules, no AI and no side effects, so every decision can be read and replayed exactly.
import type { LedgerRow, Money } from "../../payments/src/types.ts";
import type { TrancheBrief } from "./brief.ts";
import type { AllocationProposal, Partner, Playbook, Pledge } from "./playbook.ts";

// The "checklist turns green" on screen: each rule, what it needs, and what it saw.
export type Check = { rule: string; required: string; actual: string; passed: boolean };

export const toCents = (m: Money) => Math.round(Number(m.value) * 100);
export const toMoney = (cents: number, currency_code: string): Money => ({ currency_code, value: (cents / 100).toFixed(2) });

export function checkTranche1(brief: TrancheBrief, playbook: Playbook, now: Date): Check[] {
  const t = playbook.tranche1;
  const ageHours = (now.getTime() - new Date(brief.asOf).getTime()) / 3_600_000;
  const lead = brief.landfall?.leadHours;
  return [
    { rule: "GDACS alert level", required: t.alertLevels.join(" or "), actual: brief.alertLevel, passed: t.alertLevels.includes(brief.alertLevel) },
    { rule: "Forecast landfall in this region", required: playbook.regionId, actual: brief.landfall?.regionId ?? "none", passed: brief.landfall?.regionId === playbook.regionId },
    { rule: "Landfall within the window", required: `${t.minLeadHours} to ${t.maxLeadHours} hours ahead`, actual: lead === undefined ? "no landfall" : `${lead} hours`, passed: lead !== undefined && lead >= t.minLeadHours && lead <= t.maxLeadHours },
    { rule: "Sentinel confidence", required: `${t.minConfidence} or higher`, actual: String(brief.confidence), passed: brief.confidence >= t.minConfidence },
    { rule: "Brief is current", required: `${t.maxBriefAgeHours} hours old at most`, actual: `${ageHours.toFixed(1)} hours`, passed: ageHours >= 0 && ageHours <= t.maxBriefAgeHours },
  ];
}

// What a pledge has really cost its donor this calendar year. A capture has several rows (PENDING then COMPLETED), so each counts once.
export function chargedThisYearCents(rows: LedgerRow[], pledgeId: string, year: number): number {
  const inYear = (r: LedgerRow) => new Date(r.at).getUTCFullYear() === year;
  const captures = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    if (r.kind !== "charge" || r.ref !== pledgeId || !inYear(r)) continue;
    captures.set(r.paypalId, [...(captures.get(r.paypalId) ?? []), r]);
  }
  let total = 0;
  for (const [captureId, history] of captures) {
    if (history.some((r) => r.status === "DECLINED") || !history[0].amount) continue;
    total += toCents(history[0].amount);
    const refunds = new Map(rows.filter((r) => r.kind === "refund" && r.ref === captureId && r.status === "COMPLETED" && r.amount).map((r) => [r.paypalId, r]));
    for (const refund of refunds.values()) total -= toCents(refund.amount!);
  }
  return Math.max(total, 0);
}

// Early donors split their amount between tranches, with the remainder cent going to tranche 2 so the two always add up.
export function trancheCents(pledge: Pledge, tranche: 1 | 2, playbook: Playbook): number {
  const amount = toCents(pledge.amountPerEvent);
  if (pledge.preference === "confirmed") return tranche === 1 ? 0 : amount;
  const first = Math.floor((amount * playbook.tranche1.shareBps) / 10_000);
  return tranche === 1 ? first : amount - first;
}

export type PlannedCharge = { pledge: Pledge; cents: number };
export type Excluded = { pledgeId: string; reason: string };

export function planCharges(pledges: Pledge[], tranche: 1 | 2, rows: LedgerRow[], playbook: Playbook, year: number): { charges: PlannedCharge[]; excluded: Excluded[] } {
  const charges: PlannedCharge[] = [];
  const excluded: Excluded[] = [];
  for (const pledge of pledges) {
    const exclude = (reason: string) => excluded.push({ pledgeId: pledge.id, reason });
    if (!pledge.hazards.includes(playbook.hazard)) { exclude("pledge does not cover this hazard"); continue; }
    if (!pledge.regions.includes(playbook.regionId)) { exclude("pledge does not cover this region"); continue; }
    if (pledge.amountPerEvent.currency_code !== playbook.currency || pledge.annualCap.currency_code !== playbook.currency) { exclude("pledge is in another currency"); continue; }
    const wanted = trancheCents(pledge, tranche, playbook);
    if (wanted === 0) { exclude("donor chose confirmed only"); continue; }
    const remaining = toCents(pledge.annualCap) - chargedThisYearCents(rows, pledge.id, year);
    if (remaining <= 0) { exclude("annual cap reached"); continue; }
    charges.push({ pledge, cents: Math.min(wanted, remaining) });
  }
  return { charges, excluded };
}

// What a sponsor owes for a tranche: its rate on the money that actually went out, up to its limit.
export function matchCents(poolCents: number, matchBps: number, maxCents: number): number {
  return Math.min(Math.floor((poolCents * matchBps) / 10_000), maxCents);
}

// The standing pool: monthly gifts as received, plus late charges credited to it, less what storms have drawn.
export function reserveBalanceCents(rows: LedgerRow[]): number {
  const received = (r: LedgerRow) => toCents(r.net ?? r.amount!);
  const sum = (kind: LedgerRow["kind"]) => rows.filter((r) => r.kind === kind && r.amount).reduce((total, r) => total + received(r), 0);
  return Math.max(sum("reserve_payment") + sum("reserve_credit") - sum("reserve_draw"), 0);
}

// What partners can still take in a tranche, so a draw isn't made only to sit unpaid.
export function partnerRoomCents(partners: Partner[], playbook: Playbook, alreadyCents = 0): number {
  const total = partners.reduce((sum, p) => sum + Math.min(playbook.maxPerPartnerCents, p.capacityCents ?? Infinity), 0);
  return Math.max(total - alreadyCents, 0);
}

export function reserveDrawCents(balanceCents: number, roomCents: number, playbook: Playbook): number {
  return Math.min(Math.floor((balanceCents * playbook.reserve.shareBps) / 10_000), playbook.reserve.maxCentsPerEvent, roomCents);
}

// Late money, such as a sponsor's payment, follows the split the tranche already paid, as far as each partner has room.
export function planTopUp(cents: number, shares: { partner: Partner; weightCents: number; alreadyCents: number }[], playbook: Playbook): { paidTo: { partnerId: string; cents: number }[]; heldCents: number } {
  const total = shares.reduce((sum, s) => sum + s.weightCents, 0);
  const room = (s: (typeof shares)[number]) => Math.max(Math.min(playbook.maxPerPartnerCents, s.partner.capacityCents ?? Infinity) - s.alreadyCents, 0);
  const paid = shares.map((s) => ({ partnerId: s.partner.id, cents: total > 0 ? Math.min(Math.floor((cents * s.weightCents) / total), room(s)) : 0 }));
  let left = cents - paid.reduce((sum, p) => sum + p.cents, 0);
  for (let moved = true; left > 0 && moved; ) {
    moved = false;
    paid.forEach((p, i) => {
      if (left > 0 && p.cents < room(shares[i])) {
        p.cents++;
        left--;
        moved = true;
      }
    });
  }
  return { paidTo: paid.filter((p) => p.cents > 0), heldCents: left };
}

export type PlannedAllocation = { partner: Partner; cents: number };

// The Allocator proposes; this re-checks. A proposal naming an unvetted partner or over 100% is rejected, and money still moves on an equal split.
export function planAllocations(
  poolCents: number,
  partners: Partner[],
  playbook: Playbook,
  proposal?: AllocationProposal,
): { allocations: PlannedAllocation[]; heldCents: number; proposalRejected?: string } {
  let proposalRejected: string | undefined;
  if (proposal) {
    const total = proposal.reduce((sum, p) => sum + p.shareBps, 0);
    const unknown = proposal.find((p) => !partners.some((partner) => partner.id === p.partnerId));
    if (unknown) proposalRejected = `partner ${unknown.partnerId} is not eligible`;
    else if (total > 10_000) proposalRejected = `shares add up to ${total / 100}%`;
    else if (proposal.some((p) => p.shareBps < 0)) proposalRejected = "negative share";
    else if (total !== 10_000) proposalRejected = `shares add up to ${total / 100}%, not 100%`;
    else if (new Set(proposal.map((p) => p.partnerId)).size !== proposal.length) proposalRejected = "a partner appears twice";
  }
  const shares = proposal && !proposalRejected ? proposal : partners.map((p) => ({ partnerId: p.id, shareBps: 10_000 / partners.length }));
  const allocations = shares.map((s) => ({ partner: partners.find((p) => p.id === s.partnerId)!, cents: Math.floor((poolCents * s.shareBps) / 10_000) }));

  // Rounding leaves a few cents. When the shares are meant to use the whole pool, hand them out instead of stranding them.
  const fullyAllocated = Math.round(shares.reduce((sum, s) => sum + s.shareBps, 0)) === 10_000;
  let leftover = fullyAllocated ? poolCents - allocations.reduce((sum, a) => sum + a.cents, 0) : 0;
  for (let i = 0; leftover > 0 && allocations.length > 0; i = (i + 1) % allocations.length, leftover--) allocations[i].cents++;

  for (const a of allocations) a.cents = Math.min(a.cents, playbook.maxPerPartnerCents, a.partner.capacityCents ?? Infinity);
  const paying = allocations.filter((a) => a.cents > 0);
  return { allocations: paying, heldCents: poolCents - paying.reduce((sum, a) => sum + a.cents, 0), ...(proposalRejected && { proposalRejected }) };
}
