// A published Early Action Playbook: thresholds fixed in advance, so donors and judges can read exactly when money moves.
export type Playbook = {
  id: string;
  regionId: string;
  hazard: "cyclone";
  currency: string;
  tranche1: {
    alertLevels: string[];
    maxLeadHours: number;
    // Money arriving later than this before landfall is too late for early action.
    minLeadHours: number;
    minConfidence: number;
    // A brief older than this describes a forecast that may have moved.
    maxBriefAgeHours: number;
    // Share of an "early" donor's amount per event. The rest is tranche 2.
    shareBps: number;
  };
  // How long a donor can skip after the pre-charge notice.
  skipWindowMinutes: number;
  // Above this estimated total, a person approves in one click before anything happens.
  opsApprovalAboveCents: number;
  maxPerPartnerCents: number;
  // How long after a charge a donor can ask for it back.
  refundWindowHours: number;
  // A partner without a Verifier pass when tranche 2 fires. "hold": its share waits for a person's decision.
  // "reallocate": verified partners get the whole pool at once, and a later approval has nothing to pay out.
  unverifiedShare: "hold" | "reallocate";
  // After landfall, how long partners get to send proof before tranche 2 goes ahead without the rest.
  proofDeadlineHours: number;
  // What one storm's tranche 1 takes from the Reserve: a share of the balance, up to a limit, so the pool outlasts any one storm.
  reserve: { shareBps: number; maxCentsPerEvent: number };
};

export const BAY_OF_BENGAL_CYCLONE: Playbook = {
  id: "bay-of-bengal-north-cyclone-v1",
  regionId: "bay-of-bengal-north",
  hazard: "cyclone",
  currency: "USD",
  tranche1: {
    alertLevels: ["Orange", "Red"],
    maxLeadHours: 72,
    minLeadHours: 6,
    minConfidence: 70,
    maxBriefAgeHours: 6,
    shareBps: 4000,
  },
  skipWindowMinutes: 60,
  opsApprovalAboveCents: 100_000,
  maxPerPartnerCents: 200_000,
  refundWindowHours: 48,
  unverifiedShare: "hold",
  proofDeadlineHours: 24,
  reserve: { shareBps: 5000, maxCentsPerEvent: 50_000 },
};

// Hurricanes count as cyclones here: "cyclone" is the hazard's name in code, whatever a basin calls it.
export const US_GULF_HURRICANE: Playbook = {
  ...BAY_OF_BENGAL_CYCLONE,
  id: "us-gulf-coast-hurricane-v1",
  regionId: "us-gulf-coast",
};

export type Pledge = {
  id: string;
  donorId: string;
  paymentTokenId: string;
  hazards: string[];
  regions: string[];
  amountPerEvent: { currency_code: string; value: string };
  annualCap: { currency_code: string; value: string };
  // "early" pays both tranches. "confirmed" pays only once landfall is confirmed.
  preference: "early" | "confirmed";
};

// capacityCents caps what a partner can use in one tranche, from what its early action plan asked for.
export type Partner = { id: string; email: string; capacityCents?: number };

// The Allocator's proposal. Shares, not amounts: the amount to split is only known after charges settle and fees are taken.
export type AllocationProposal = { partnerId: string; shareBps: number; rationale?: string }[];

// A company's signed match. A fixed rate agreed in advance, so no AI decides how much to bill it.
export type MatchSponsor = { id: string; email: string; businessName: string; matchBps: number; maxCentsPerTranche: number };

export type VerifierVerdict = { partnerId: string; verdict: "pass" | "partial" | "human"; summary?: string; failedChecks?: string[] };
