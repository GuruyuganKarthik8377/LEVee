import {
  ALLOCATIONS,
  BRIEFS,
  CAPTURE_HOUR,
  CHARGES,
  DEMO_DONOR,
  HELENE,
  LANDFALL_ISO,
  LANDFALL_TEXT,
  MATCH,
  MATCH_PAID_T1,
  NET_POOL,
  OPS_LIMIT,
  PARTNERS,
  PAYOUT_HOUR,
  PLAYBOOK_HOUR,
  REFS,
  STAGES,
  T1_DONORS,
  TRACK,
  type PartnerId,
} from "@/fixtures/helene";
import type { DemoState } from "@/lib/demoStore";
import { giftCharges } from "@/lib/rules";

/** Everything the screens show is worked out from the shared state here, so the numbers can never disagree. */

/** Shown wherever a figure is still waiting for the replay. */
export const NO_FIGURE = "—";

const [DONOR_T1, DONOR_T2] = giftCharges(DEMO_DONOR.pledge.amount * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const usd = (n: number | null) => (n === null ? NO_FIGURE : `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`);

/** "84.2h", or a dash until the replay supplies the hour. */
export const hoursText = (hours: number | null) => (hours === null ? NO_FIGURE : `${Number(Math.abs(hours).toFixed(1))}h`);

/** True once the clock passes an event. An event whose hour is not known yet is never reached. */
export const reached = (clock: number, hour: number | null) => hour !== null && clock >= hour;

/** The total, or null while any part of it is still unknown. */
const sum = (values: (number | null)[]) => (values.some((v) => v === null) ? null : values.reduce<number>((total, v) => total + (v ?? 0), 0));

/** How long donors have to skip, from the notice to the capture. */
export const SKIP_HOURS = CAPTURE_HOUR === null || PLAYBOOK_HOUR === null ? null : CAPTURE_HOUR - PLAYBOOK_HOUR;

export function brief(clock: number) {
  return BRIEFS.filter((b) => b.t <= clock).at(-1) ?? BRIEFS[0];
}

export function stormPosition(clock: number) {
  const next = TRACK.findIndex((p) => p.t >= clock);
  if (next <= 0) return TRACK[0];
  const a = TRACK[next - 1];
  const b = TRACK[next];
  const f = (clock - a.t) / (b.t - a.t);
  return { t: clock, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}

/** A rule is met, not met, or null while its input is still waiting for the replay. */
export function playbook(clock: number): { label: string; detail: string; met: boolean | null }[] {
  const b = brief(clock);
  return [
    { label: "GDACS Orange or Red alert", detail: b.alert ? `${b.alert} alert` : NO_FIGURE, met: b.alert === null ? null : b.alert !== "Green" },
    { label: "Landfall within 72 hours", detail: clock < 0 ? `${Math.ceil(-clock)}h out` : "Landfall reached", met: clock >= -72 },
    { label: "Sentinel confidence 70 or more", detail: `Confidence ${b.confidence ?? NO_FIGURE}`, met: b.confidence === null ? null : b.confidence >= 70 },
  ];
}

/** "20:00:00" to landfall, or time since it. */
export function clockText(hours: number) {
  const total = Math.round(Math.abs(hours) * 3600);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Index into STAGES of the beat the replay has most recently reached. */
export const stageIndex = (hours: number) => STAGES.reduce((current, stage, i) => (reached(hours, stage.at) ? i : current), 0);

export function whenText(hours: number) {
  if (Math.abs(hours) < 0.01) return "At landfall";
  const value = Number(Math.abs(hours).toFixed(1));
  return `${value}h ${hours < 0 ? "before" : "after"} landfall`;
}

export function dateText(hours: number) {
  const date = new Date(new Date(LANDFALL_ISO).getTime() + hours * 3600_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(date);
}

/* ---------------- allocations ---------------- */

export type ProofStatus = "Not due" | "Waiting" | "Verified" | "Partial" | "Human review" | "Reviewed" | "Rejected";
export type PayoutStatus = "Needs approval" | "Approved" | "Sent" | "Locked" | "Under review" | "Held";

export type AllocationRow = {
  id: string;
  partner: PartnerId;
  partnerLabel: string;
  org: string;
  region: string;
  tranche: 1 | 2;
  amount: number | null;
  rationale: string;
  proof: ProofStatus;
  payout: PayoutStatus;
  ref: string | null;
};

/** True once a partner's proof passed, on its own or after a person reviewed it. */
export function proofCleared(state: DemoState, partner: PartnerId) {
  const proof = state.proofs[partner];
  return proof?.verdict === "pass" || state.reviews[partner]?.outcome === "released";
}

function proofStatus(state: DemoState, partner: PartnerId): ProofStatus {
  const proof = state.proofs[partner];
  const review = state.reviews[partner];
  if (!proof) return state.clock < 0 ? "Not due" : "Waiting";
  if (review) return review.outcome === "released" ? "Reviewed" : "Rejected";
  return proof.verdict === "pass" ? "Verified" : proof.verdict === "partial" ? "Partial" : "Human review";
}

function payoutStatus(state: DemoState, partner: PartnerId, tranche: 1 | 2): PayoutStatus {
  if (tranche === 1) return !state.approved ? "Needs approval" : reached(state.clock, PAYOUT_HOUR) ? "Sent" : "Approved";
  if (proofCleared(state, partner)) return "Sent";
  if (state.reviews[partner]?.outcome === "held") return "Held";
  return state.proofs[partner] ? "Under review" : "Locked";
}

export function allocations(state: DemoState): AllocationRow[] {
  if (!reached(state.clock, PLAYBOOK_HOUR)) return [];
  return ALLOCATIONS.map((a) => {
    const partner = PARTNERS[a.partner];
    const payout = payoutStatus(state, a.partner, a.tranche);
    return {
      id: a.id,
      partner: a.partner,
      partnerLabel: partner.label,
      org: partner.org,
      region: partner.region,
      tranche: a.tranche,
      // a skipped pledge leaves both pools, taken here from the last partner in each tranche
      amount: state.skippedAt !== null && a.amount !== null && a.partner === "b" ? round2(a.amount - (a.tranche === 1 ? DONOR_T1 : DONOR_T2).netCents / 100) : a.amount,
      rationale: a.rationale,
      proof: proofStatus(state, a.partner),
      payout,
      ref: payout === "Sent" ? a.ref : null,
    };
  });
}

/** True once tranche 2 has been charged, which happens when a partner's proof first clears. */
export function trancheTwoCharged(state: DemoState) {
  return (Object.keys(PARTNERS) as PartnerId[]).some((p) => proofCleared(state, p));
}

/** Early donors pay 40% before landfall and the rest once proof clears, so the totals follow the replay's clock. */
export function funds(state: DemoState) {
  const rows = allocations(state);
  const skipped = state.skippedAt !== null;
  const { donors } = HELENE.raised;
  const first = reached(state.clock, CAPTURE_HOUR);
  const second = trancheTwoCharged(state);
  const less = (cents: number) => (skipped ? cents / 100 : 0);
  const captured = (first ? CHARGES.t1 - less(DONOR_T1.chargedCents) : 0) + (second ? CHARGES.t2 - less(DONOR_T2.chargedCents) : 0);
  const net = (first ? NET_POOL.t1 - less(DONOR_T1.netCents) : 0) + (second ? NET_POOL.t2 - less(DONOR_T2.netCents) : 0);
  const matched = (first ? MATCH.t1 : 0) + (second ? MATCH.t2 : 0);
  const sent = rows.filter((r) => r.payout === "Sent").reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return {
    donors: donors === null ? null : donors - (skipped ? 1 : 0),
    captured: round2(captured),
    match: matched,
    total: round2(captured + matched),
    /** Includes the sponsor's money for tranche 1, which went out in its own batch. */
    paid: round2(sent + (reached(state.clock, PAYOUT_HOUR) ? MATCH_PAID_T1 : 0)),
    /** Donors' money that has arrived and hasn't gone out yet: a share waiting on proof or review. */
    held: Math.max(round2(net - sent), 0),
    fees: round2(captured - net),
    allocated: sum(rows.map((r) => r.amount)),
  };
}

/** The donor's own share of each allocation row, to the cent, after PayPal's fee on their charge. */
export function donorShare(state: DemoState) {
  return allocations(state).map((row) => {
    const pool = row.tranche === 1 ? NET_POOL.t1 : NET_POOL.t2;
    const net = (row.tranche === 1 ? DONOR_T1 : DONOR_T2).netCents / 100;
    return { ...row, share: row.amount === null ? null : Math.round((row.amount / pool) * net * 100) / 100 };
  });
}

/* ---------------- ops queue ---------------- */

export function needsApproval(state: DemoState) {
  return reached(state.clock, PLAYBOOK_HOUR) && !state.approved;
}

export function pendingReviews(state: DemoState) {
  return (Object.keys(state.proofs) as PartnerId[]).filter((p) => state.proofs[p]?.verdict !== "pass" && !state.reviews[p]);
}

export const trancheOneTotal = sum(ALLOCATIONS.filter((a) => a.tranche === 1).map((a) => a.amount));
/** The limit applies to what's about to be charged, before PayPal's fees. */
export const overOpsLimit = CHARGES.t1 > OPS_LIMIT;

/* ---------------- audit log ---------------- */

export type AuditActor = "Sentinel" | "Allocator" | "Verifier" | "Narrator" | "Policy Engine" | "Ops" | "PayPal webhook";

export type AuditEntry = {
  id: string;
  at: number;
  actor: AuditActor;
  title: string;
  output: string;
  inputs: [string, string][];
  reasoning: string;
  ref?: string;
};

export function auditLog(state: DemoState): AuditEntry[] {
  const { clock, approved, skippedAt } = state;
  const log: AuditEntry[] = [];
  // an entry whose hour is still unknown stays off the log until the replay supplies it
  const add = ({ at, ...entry }: Omit<AuditEntry, "at"> & { at: number | null }) => {
    if (at !== null && at <= clock) log.push({ ...entry, at });
  };

  for (const b of BRIEFS.filter((x) => x.t < 0)) {
    add({
      id: `brief${b.t}`,
      at: b.t,
      actor: "Sentinel",
      title: b.confidence === null ? b.headline : `Threat Brief, confidence ${b.confidence}`,
      output: b.headline,
      inputs: [
        ["GDACS alert", b.alert ?? NO_FIGURE],
        ["Lead time", `${hoursText(b.t)} before landfall`],
        ["Sources read", "GDACS, GloFAS river ensembles, regional news"],
      ],
      reasoning: b.reasons.join(". ") + ".",
    });
  }

  add({
    id: "rules-met",
    at: PLAYBOOK_HOUR,
    actor: "Policy Engine",
    title: "Playbook check: 3 of 3 rules met",
    output: "Tranche 1 can fire",
    inputs: [
      ["Alert", "Orange, met"],
      ["Landfall", `${hoursText(PLAYBOOK_HOUR)} out, met`],
      ["Confidence", `${brief(PLAYBOOK_HOUR ?? clock).confidence ?? NO_FIGURE} of the 70 required, met`],
    ],
    reasoning: "Fixed rule, no judgment.",
  });
  add({
    id: "alloc",
    at: PLAYBOOK_HOUR,
    actor: "Allocator",
    title: `Proposed ${usd(trancheOneTotal)} across 2 partners`,
    output: ALLOCATIONS.filter((a) => a.tranche === 1).map((a) => `${PARTNERS[a.partner].label} ${usd(a.amount)}`).join(", "),
    inputs: [
      ["Tranche 1 pool, after fees", usd(NET_POOL.t1)],
      ["Sample partners", String(HELENE.partnersReady)],
      ["Active storms", "1"],
    ],
    reasoning: ALLOCATIONS.filter((a) => a.tranche === 1).map((a) => a.rationale).join(" "),
  });
  add({
    id: "recheck",
    at: PLAYBOOK_HOUR,
    actor: "Policy Engine",
    title: "Allocator proposal rechecked",
    output: overOpsLimit ? `Sums and caps pass. ${usd(CHARGES.t1)} of charges is over the ${usd(OPS_LIMIT)} limit, so ops must approve` : "Sums and caps pass, so ops can approve",
    inputs: [
      ["Charges", usd(CHARGES.t1)],
      ["Ops limit", usd(OPS_LIMIT)],
      ["Donor caps", "None exceeded"],
    ],
    reasoning: "Fixed rule, no judgment. AI proposes, rules dispose.",
  });
  if (approved) {
    add({
      id: "ops-approve",
      at: PLAYBOOK_HOUR,
      actor: "Ops",
      title: "Allocation approved",
      output: "One click approval recorded",
      inputs: [["Charges", usd(CHARGES.t1)]],
      reasoning: "A person confirmed the allocation. The amount and the rules cannot be edited from the ops screen.",
    });
    add({
      id: "notices",
      at: PLAYBOOK_HOUR,
      actor: "Narrator",
      title: `Pre-charge notices sent to ${T1_DONORS} donors`,
      output: `Charges run in ${hoursText(SKIP_HOURS)}, with a one tap skip`,
      inputs: [
        ["Donors", String(T1_DONORS)],
        ["Skip window", hoursText(SKIP_HOURS)],
      ],
      reasoning: "Every donor hears what will be charged and why before a single charge happens.",
    });
  }
  if (approved) {
    add({
      id: "invoice",
      at: PAYOUT_HOUR,
      actor: "Policy Engine",
      title: "Corporate match invoice sent",
      output: `${usd(MATCH.t1)} invoice sent through PayPal Invoicing. When it was paid, the money went to partners in its own batch`,
      inputs: [
        ["Match", usd(MATCH.t1)],
        ["Paid to partners", usd(MATCH_PAID_T1)],
      ],
      reasoning: "The tranche paid out, so the sponsor is billed its agreed rate automatically. Only money it has really paid goes on to partners.",
      ref: REFS.t1Invoice,
    });
  }
  if (skippedAt !== null) {
    add({
      id: "skip",
      at: skippedAt,
      actor: "Policy Engine",
      title: `Donor ${DEMO_DONOR.id} skipped this storm`,
      output: "Pledge removed from the capture batch",
      inputs: [["Amount", usd(DEMO_DONOR.pledge.amount)]],
      reasoning: "A skip inside the notice window always wins. The pledge stays active for the next storm.",
    });
  }
  add({
    id: "capture",
    at: CAPTURE_HOUR,
    actor: "Policy Engine",
    title: `Captured ${T1_DONORS - (skippedAt !== null ? 1 : 0)} pledges for tranche 1`,
    output: `${usd(round2(CHARGES.t1 - (skippedAt !== null ? DONOR_T1.chargedCents / 100 : 0)))} charged with Orders v2 and vault tokens`,
    inputs: [
      ["Donors charged", String(T1_DONORS - (skippedAt !== null ? 1 : 0))],
      ["Share of each gift", "40%, with the rest after proof"],
    ],
    reasoning: "The notice window closed, so every eligible pledge inside its cap is charged.",
    ref: DEMO_DONOR.captureRef,
  });
  add({
    id: "payout1",
    at: PAYOUT_HOUR,
    actor: "Policy Engine",
    title: "Tranche 1 sent in one Payouts batch",
    output: `${usd(trancheOneTotal)} to 2 sample partners, ${hoursText(PAYOUT_HOUR)} before landfall`,
    inputs: ALLOCATIONS.filter((a) => a.tranche === 1).map((a) => [PARTNERS[a.partner].label, usd(a.amount)]),
    reasoning: "Only the Policy Engine can move money. The batch matches the approved allocation exactly.",
    ref: REFS.t1Batch,
  });
  add({
    id: "hook1",
    at: PAYOUT_HOUR,
    actor: "PayPal webhook",
    title: "Payout batch succeeded",
    output: "Both items delivered, ledger updated",
    inputs: [["Items", "2 of 2 succeeded"]],
    reasoning: "PayPal confirmed the batch, and the ledger records it from this webhook alone.",
    ref: REFS.t1Batch,
  });
  add({
    id: "landfall",
    at: 0,
    actor: "Sentinel",
    title: "Landfall confirmed",
    output: `Helene came ashore ${LANDFALL_TEXT}`,
    inputs: [["Source", "National Hurricane Center"]],
    reasoning: "The confirmed track is the first half of the tranche 2 rule. Verifier proof is the second.",
  });

  for (const id of ["a", "b"] as PartnerId[]) {
    const proof = state.proofs[id];
    if (!proof) continue;
    const partner = PARTNERS[id];
    const amount = allocations(state).find((r) => r.partner === id && r.tranche === 2)?.amount ?? null;
    add({
      id: `verify-${id}`,
      at: proof.at,
      actor: "Verifier",
      title: `${partner.label} proof: ${proof.verdict === "pass" ? "pass" : proof.verdict === "partial" ? "partial" : "sent to a human"}`,
      output: proof.checks.find((c) => c.state === "fail")?.note ?? "All checks passed",
      inputs: [
        ["Files", String(proof.files.length)],
        ...proof.checks.map((c): [string, string] => [c.label, c.state === "pass" ? "Pass" : c.state === "fail" ? "Fail" : "Not run"]),
      ],
      reasoning: proof.checks.map((c) => c.note).join(". ") + ".",
    });
    const review = state.reviews[id];
    if (review) {
      add({
        id: `review-${id}`,
        at: review.at,
        actor: "Ops",
        title: `${partner.label} review: ${review.outcome === "released" ? "cleared" : "kept on hold"}`,
        output: review.outcome === "released" ? "Tranche 2 unlocked" : `${usd(amount)} stays in the pool`,
        inputs: [["Verifier verdict", proof.verdict]],
        reasoning: "A person made this call. The Policy Engine acts on it, and the Verifier's finding stays on the record.",
      });
    }
    if (proofCleared(state, id)) {
      add({
        id: `payout2-${id}`,
        at: review?.at ?? proof.at,
        actor: "Policy Engine",
        title: `Tranche 2 sent to ${partner.label}`,
        output: `${usd(amount)} after verified proof`,
        inputs: [
          ["Landfall", "Confirmed"],
          ["Proof", review ? "Cleared by review" : "Verifier pass"],
        ],
        reasoning: "Both tranche 2 rules are met: confirmed track and cleared proof.",
        ...(id === "a" && { ref: REFS.t2Batch }),
      });
    }
  }

  return log.map((entry, i) => ({ entry, i })).sort((x, y) => y.entry.at - x.entry.at || y.i - x.i).map((x) => x.entry);
}
