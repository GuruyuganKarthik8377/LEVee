// What the Policy Engine reads from a storm assessment, and nothing more. Policy owns this shape, so the rules depend on no agent:
// the Sentinel's ThreatBrief already has these fields, and any other source of briefs only needs these five.
export type TrancheBrief = {
  eventName: string;
  asOf: string;
  alertLevel: string;
  confidence: number;
  landfall: { regionId: string; leadHours: number } | null;
};
