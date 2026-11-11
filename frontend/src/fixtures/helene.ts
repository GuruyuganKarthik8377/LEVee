/**
 * Hurricane Helene replay, shaped like the backend's GET /events/:id response (brief, allocations, tranche status)
 * plus fund totals from the ledger. The frontend builds against this until the internal API is live; swap the import
 * for a fetch and nothing else needs to change.
 *
 * The storm facts below are sourced. Every other figure comes from one LEVee replay run on 2026-11-07: real GDACS advisories, Sentinel, the
 * Allocator and the Verifier on claude-haiku-5-5, and PayPal sandbox charges and payouts. The donors, partners and proof are sample data.
 *
 * Sources: NHC report on Hurricane Helene, AL092024 (Hagen et al., 17 Feb 2026), GDACS event 1001101 (HELENE-24).
 */

/* ---------------- timeline ---------------- */

/** NHC: "about 10 n mi southwest of Perry, Florida, around 0310 UTC 27 September", which is 11:10 pm EDT on 26 Sep. */
export const LANDFALL_ISO = "2024-09-27T03:10:00Z";
/** GDACS: 18 advisories, from 23 Sep 2024 15:00 UTC to 27 Sep 2024 21:00 UTC. */
export const FIRST_ADVISORY_ISO = "2024-09-23T15:00:00Z";
export const LAST_ADVISORY_ISO = "2024-09-27T21:00:00Z";
export const ADVISORY_COUNT = 18;

const hoursFromLandfall = (iso: string) => (Date.parse(iso) - Date.parse(LANDFALL_ISO)) / 3_600_000;

/** Every clock value is hours from landfall. */
export const REPLAY_START = hoursFromLandfall(FIRST_ADVISORY_ISO);
export const REPLAY_END = hoursFromLandfall(LAST_ADVISORY_ISO);
/** Advisory 6, the first where every rule passed. */
export const PLAYBOOK_HOUR: number | null = hoursFromLandfall("2024-09-24T21:00:00Z");
/** The playbook's 60 minute skip window, after which charges and the payout run in the same step. */
export const CAPTURE_HOUR = PLAYBOOK_HOUR === null ? null : PLAYBOOK_HOUR + 1;
export const PAYOUT_HOUR = CAPTURE_HOUR;
/** Proof opens when ops confirm landfall, shown at the first GDACS advisory after it. */
export const PROOF_HOUR = hoursFromLandfall("2024-09-27T09:00:00Z");

export const OPS_LIMIT = 1000;

/** The replay run's money, by tranche. Charges are what donors paid, and the pools are what was left after PayPal's fees. */
export const CHARGES = { t1: 1040.0, t2: 1760.0 };
export const NET_POOL = { t1: 998.31, t2: 1692.69 };
/** What the sponsor was invoiced. It paid for tranche 1, and that money went out in its own batch. */
export const MATCH = { t1: 150.0, t2: 150.0 };
export const MATCH_PAID_T1 = 150.0;
/** Early donors pay tranche 1. The one donor who chose "confirmed" only pays tranche 2. */
export const T1_DONORS = 11;
/** PayPal's real references from the replay run. */
export const REFS = { t1Batch: "GBN9MNSTHB6LE", t1MatchBatch: "WNJSSGJ7MU7YU", t1Invoice: "INV2-U76S-CXCC-7W2U-LS3P", t2Batch: "HT8V7EK2NCJFG" };

/** The beats of the replay, shared by the scrubber and the status link on the other screens. */
export const STAGES: { at: number | null; title: string }[] = [
  { at: REPLAY_START, title: "First advisory" },
  { at: PLAYBOOK_HOUR, title: "Playbook met" },
  { at: CAPTURE_HOUR, title: "Pledges captured" },
  { at: PAYOUT_HOUR, title: "Tranche 1 sent" },
  { at: 0, title: "Landfall" },
  { at: PROOF_HOUR, title: "Proof window" },
  { at: REPLAY_END, title: "Last advisory" },
];

/* ---------------- what the screens say about the replay ---------------- */

export const REPLAY_NOTE = "A replay of a past storm, using sandbox money and sample partners. LEVee did not operate during Hurricane Helene.";
export const LANDFALL_TEXT = "near Perry, Florida, as a Category 4 hurricane, about 11:10 pm EDT on 26 Sep 2024";
export const STORM_SOURCES = "Landfall and track: National Hurricane Center. Advisories: GDACS event HELENE-24.";

/* ---------------- event ---------------- */

export type TrancheStatus = "sent" | "held";

export type EventTranche = {
  id: string;
  label: string;
  amount: number | null;
  note: string;
  status: TrancheStatus;
};

export type StormEvent = {
  id: string;
  name: string;
  basin: string;
  replay: boolean;
  brief: { alert: "Orange" | "Red"; confidence: number | null; landfallInHours: number | null };
  partnersReady: number;
  raised: {
    /** pledges captured plus corporate match */
    total: number | null;
    pledged: number | null;
    match: number | null;
    donors: number | null;
    /** what partners' early action plans asked for */
    goal: number | null;
  };
  tranches: EventTranche[];
};

export const HELENE: StormEvent = {
  id: "helene-2024",
  name: "Hurricane Helene",
  basin: "Atlantic / Gulf of Mexico",
  replay: true,
  brief: {
    alert: "Red",
    confidence: 70,
    landfallInHours: PLAYBOOK_HOUR === null ? null : Number((-PLAYBOOK_HOUR).toFixed(1)),
  },
  partnersReady: 2,
  raised: {
    total: 3100.0,
    pledged: 2800.0,
    match: 300.0,
    donors: 12,
    goal: 3500,
  },
  tranches: [
    { id: "t1", label: "Tranche 1", amount: 998.31, note: "Before landfall, to 2 sample partners", status: "sent" },
    { id: "t2a", label: "Tranche 2, Partner A", amount: 1015.62, note: "After verified proof", status: "sent" },
    { id: "t2b", label: "Tranche 2, Partner B", amount: 677.07, note: "Proof under review", status: "held" },
  ],
};

/* ---------------- replay ---------------- */

/** NHC best track, Table 1, with the first and last points interpolated to the GDACS advisory times. */
const BEST_TRACK: [iso: string, lat: number, lon: number][] = [
  [FIRST_ADVISORY_ISO, 17.5, -81.8],
  ["2024-09-23T18:00:00Z", 17.8, -81.9],
  ["2024-09-24T00:00:00Z", 18.2, -82.2],
  ["2024-09-24T06:00:00Z", 18.6, -82.8],
  ["2024-09-24T12:00:00Z", 19.2, -83.7],
  ["2024-09-24T18:00:00Z", 19.4, -84.6],
  ["2024-09-25T00:00:00Z", 19.7, -85.2],
  ["2024-09-25T06:00:00Z", 20.3, -85.9],
  ["2024-09-25T12:00:00Z", 21.1, -86.2],
  ["2024-09-25T18:00:00Z", 22.0, -86.5],
  ["2024-09-26T00:00:00Z", 22.8, -86.7],
  ["2024-09-26T06:00:00Z", 23.6, -86.5],
  ["2024-09-26T12:00:00Z", 24.7, -85.8],
  ["2024-09-26T18:00:00Z", 26.6, -85.0],
  ["2024-09-27T00:00:00Z", 28.7, -84.3],
  [LANDFALL_ISO, 30.0, -83.7],
  ["2024-09-27T05:00:00Z", 30.8, -83.5],
  ["2024-09-27T06:00:00Z", 31.3, -83.3],
  ["2024-09-27T09:00:00Z", 32.9, -83.1],
  ["2024-09-27T12:00:00Z", 34.4, -83.2],
  ["2024-09-27T18:00:00Z", 36.8, -84.9],
  [LAST_ADVISORY_ISO, 37.45, -85.75],
];

export const TRACK = BEST_TRACK.map(([iso, lat, lon]) => ({ t: hoursFromLandfall(iso), lat, lon }));

export type ThreatBrief = {
  t: number;
  confidence: number | null;
  alert: "Green" | "Orange" | "Red" | null;
  headline: string;
  reasons: string[];
};

/** GDACS's alert and the code-computed forecast landfall from each of the 18 real advisories, with Sentinel's real score and reasons where it ran. */
export const BRIEFS: ThreatBrief[] = [
  { t: hoursFromLandfall("2024-09-23T15:00:00Z"), confidence: null, alert: "Green", headline: "GDACS advisory 1: no Gulf Coast landfall forecast yet", reasons: ["GDACS issued a Green alert", "Sentinel doesn't run until a forecast reaches a covered coast, so this advisory cost nothing"] },
  { t: hoursFromLandfall("2024-09-23T21:00:00Z"), confidence: null, alert: "Orange", headline: "GDACS advisory 2: no Gulf Coast landfall forecast yet", reasons: ["GDACS issued a Orange alert", "Sentinel doesn't run until a forecast reaches a covered coast, so this advisory cost nothing"] },
  { t: hoursFromLandfall("2024-09-24T03:00:00Z"), confidence: null, alert: "Green", headline: "GDACS advisory 3: no Gulf Coast landfall forecast yet", reasons: ["GDACS issued a Green alert", "Sentinel doesn't run until a forecast reaches a covered coast, so this advisory cost nothing"] },
  { t: hoursFromLandfall("2024-09-24T09:00:00Z"), confidence: null, alert: "Orange", headline: "GDACS advisory 4: no Gulf Coast landfall forecast yet", reasons: ["GDACS issued a Orange alert", "Sentinel doesn't run until a forecast reaches a covered coast, so this advisory cost nothing"] },
  { t: hoursFromLandfall("2024-09-24T15:00:00Z"), confidence: 50, alert: "Orange", headline: "GDACS advisory 5: forecast landfall in 57.9h", reasons: ["The latest advisory's forecast point for 27 September 00:00 UTC lies at 29.7N 84.3W, close to the computed landfall point.", "GDACS issued an Orange alert with winds of 222 km/h for the event.", "Advisories 1 to 4 carry no forecast points, so no track shift can be measured and the forecast's stability is unverified."] },
  { t: hoursFromLandfall("2024-09-24T21:00:00Z"), confidence: 70, alert: "Orange", headline: "GDACS advisory 6: forecast landfall in 53h", reasons: ["The two advisories that carry forecast points, 5 and 6, both put the track near 30N 84.3W around 27 September, so the landfall point is consistent between them.", "The maximum track shift between advisories is 2.9 km and the ETA shift is 1.1 hours, which is a small move for the forecast landfall.", "GDACS issued an Orange alert with winds of 222 km/h at this advisory, which supports a damaging event."] },
  { t: hoursFromLandfall("2024-09-25T03:00:00Z"), confidence: 72, alert: "Orange", headline: "GDACS advisory 7: forecast landfall in 46.3h", reasons: ["The latest advisory and the one before it both put the storm at about 29.5 to 29.7 N and 84.2 to 84.3 W around 00:00 UTC on 27 September, so the landfall region agrees between them.", "The middle advisory shows the same northward approach toward the Gulf Coast, though it places the storm slightly further along by 06:00 UTC on 27 September.", "The track shifted 6.7 km and the arrival time moved 0.7 hours earlier across the advisories, a small change that does not move the landfall region."] },
  { t: hoursFromLandfall("2024-09-25T09:00:00Z"), confidence: 78, alert: "Orange", headline: "GDACS advisory 8: forecast landfall in 39.8h", reasons: ["Advisories 5, 7 and 8 agree that the centre reaches about 29.5 to 32N near 84.2 to 84.3W on 27 September, and the latest advisory shifts the track only about 31 km with an ETA shift of about 0.6 hours.", "GDACS rates the event Orange with winds of 222 km/h, which supports the damaging-cyclone part of the statement.", "A news headline says Helene is picking up speed toward the Gulf and may become a major hurricane, which matches the advisories but rests on a single item."] },
  { t: hoursFromLandfall("2024-09-25T15:00:00Z"), confidence: 80, alert: "Orange", headline: "GDACS advisory 9: forecast landfall in 33.8h", reasons: ["Advisories 5, 7 and 9 agree closely on a Gulf approach, with centre positions near 29.5 to 29.7N and 84.2 to 84.6W at about 00:00 UTC on 27 September.", "The arrival time did not shift between advisories (0 hours) and the latest track moved 7.7 km, which is small next to the largest earlier shift of 38.5 km.", "GDACS issued an Orange alert with winds of 222 km/h for this event at this advisory."] },
  { t: hoursFromLandfall("2024-09-25T21:00:00Z"), confidence: 80, alert: "Orange", headline: "GDACS advisory 10: forecast landfall in 27.6h", reasons: ["The six advisories shown (advisories 5 to 10) all place landfall on the Florida Gulf coast around 27 September, and the computed ETA shifted by only 0.1 hours.", "GDACS rated the event Orange with winds of 222 km/h, which is strong enough to be damaging at landfall.", "The 00:00 to 06:00 UTC forecast points on 27 September cluster between about 29.5N and 32N and 84W and 85W across the later advisories, so the coastal position is consistent."] },
  { t: hoursFromLandfall("2024-09-26T03:00:00Z"), confidence: 78, alert: "Red", headline: "GDACS advisory 11: forecast landfall in 22.3h", reasons: ["Advisories 7, 9 and 11 each place the storm near 29.5 to 29.7°N and 84.2 to 84.6°W at 00:00 UTC on 27 September, which matches the stated landfall point.", "The largest track shift between advisories is 33.7 km and the ETA moved only 0.6 hours, so the coastal position has been stable.", "GDACS holds a Red alert with winds of 222 km/h, up from the Orange alert reported on 25 September, so damage is likely if landfall happens as forecast."] },
  { t: hoursFromLandfall("2024-09-26T09:00:00Z"), confidence: 80, alert: "Orange", headline: "GDACS advisory 12: forecast landfall in 17h", reasons: ["The latest advisory's forecast track passes about 30.0N 84.4W at 02:00 UTC on 27 September, which matches the stated landfall point.", "The track has been stable: the latest shift is 11.6 km and the arrival time moved 0.8 hours, though the largest shift across advisories was 45.3 km.", "GDACS rates the event Orange with winds of 222 km/h, which is strong enough to cause serious damage on landfall."] },
  { t: hoursFromLandfall("2024-09-26T15:00:00Z"), confidence: 82, alert: "Orange", headline: "GDACS advisory 13: forecast landfall in 11.8h", reasons: ["The latest advisory places the storm at 28.8N 84.3W at 00:00 UTC on 27 September and 33.9N 84.5W at 12:00 UTC, consistent with the computed landfall near 30N 84.35W around 02:49 UTC.", "The track has been stable across the advisories shown: the latest shift is 4.8 km and the ETA shift is 0.8 hours, although an earlier advisory showed a maximum shift of 50.1 km.", "GDACS issued an Orange alert with winds of 222 km/h, and independent reporting repeats the Orange alert and the hurricane warnings."] },
  { t: hoursFromLandfall("2024-09-26T21:00:00Z"), confidence: 80, alert: "Orange", headline: "GDACS advisory 14: forecast landfall in 5.3h", reasons: ["The forecast points in advisories 9 to 14 pass the Florida Big Bend coast near 84 W between 27 September 00:00 and 06:00 UTC, at latitudes from about 28.8 N to 32 N.", "The latest advisory shifted the track by 26 km and the landfall estimate about 0.6 hours earlier, after a largest shift of 76 km earlier in the sequence.", "GDACS issued an Orange alert with winds of 222 km/h, which is consistent with a damaging cyclone at landfall."] },
  { t: hoursFromLandfall("2024-09-27T03:00:00Z"), confidence: 58, alert: "Red", headline: "GDACS advisory 15: forecast landfall in 0.2h", reasons: ["GDACS issued a Red alert with winds of 222 km/h, so the storm is strong enough to be damaging if it arrives as forecast.", "The most recent advisories agree on a path reaching about 31.5 to 33.9 degrees north near 84 degrees west between 27 Sep 06:00 and 12:00 UTC.", "The track has moved as much as 93.4 km between advisories, though the latest shift was 17.3 km and the arrival estimate moved by only one hour."] },
  { t: 0, confidence: null, alert: "Red", headline: "Landfall in Florida's Big Bend", reasons: [`Helene came ashore ${LANDFALL_TEXT}`, "Source: National Hurricane Center", "Sentinel stops here: a person confirms landfall from the official source"] },
  { t: hoursFromLandfall("2024-09-27T09:00:00Z"), confidence: null, alert: "Green", headline: "GDACS advisory 16: storm past the coast", reasons: ["GDACS issued a Green alert", "Sentinel doesn't score after landfall, because the money now depends on proof"] },
  { t: hoursFromLandfall("2024-09-27T15:00:00Z"), confidence: null, alert: "Green", headline: "GDACS advisory 17: storm past the coast", reasons: ["GDACS issued a Green alert", "Sentinel doesn't score after landfall, because the money now depends on proof"] },
  { t: hoursFromLandfall("2024-09-27T21:00:00Z"), confidence: null, alert: "Green", headline: "GDACS advisory 18: storm past the coast", reasons: ["GDACS issued a Green alert", "Sentinel doesn't score after landfall, because the money now depends on proof"] },
];

export type PartnerId = "a" | "b";

export type Partner = {
  id: PartnerId;
  label: string;
  org: string;
  region: string;
  lat: number;
  lon: number;
  plan: string;
};

/** Sample data for the sandbox, not real organisations. Real partners are vetted before they get a PayPal payout account. */
export const PARTNERS: Record<PartnerId, Partner> = {
  a: {
    id: "a",
    label: "Partner A",
    org: "Perry, FL (sample partner)",
    region: "Perry, FL",
    lat: 30.12,
    lon: -83.58,
    plan: "Move households to shelters and pre-position food and water",
  },
  b: {
    id: "b",
    label: "Partner B",
    org: "Valdosta, GA (sample partner)",
    region: "Valdosta, GA",
    lat: 30.83,
    lon: -83.28,
    plan: "Secure drinking water and fuel for evacuation transport",
  },
};

/** b2 has no PayPal reference, because the replay run left that share held for a person's review. */
export const ALLOCATIONS: { id: string; partner: PartnerId; tranche: 1 | 2; amount: number | null; rationale: string; ref: string | null }[] = [
  { id: "a1", partner: "a", tranche: 1, amount: 598.99, rationale: "Partner A is closer to the forecast landfall at 71 km, serves 1200 households with shelter and food and water pre-positioning, and has the larger remaining capacity at 2000 USD, though the 2.9 km track shift is small enough that it does not need a heavier spread.", ref: "GBN9MNSTHB6LE" },
  { id: "b1", partner: "b", tranche: 1, amount: 399.32, rationale: "Partner B is farther from landfall at 134 km but still exposed near the Valdosta gauge, serves 800 households with drinking water and evacuation fuel, and has 1500 USD remaining capacity, so it receives a meaningful share to cover the track uncertainty.", ref: "GBN9MNSTHB6LE" },
  { id: "a2", partner: "a", tranche: 2, amount: 1015.62, rationale: "Partner A is closest to the forecast landfall, serves more households, and has the larger remaining capacity, so it should receive the larger share, while the 93.4 km track shift and 58% confidence keep it from taking everything.", ref: "HT8V7EK2NCJFG" },
  { id: "b2", partner: "b", tranche: 2, amount: 677.07, rationale: "Partner B is farther from the forecast landfall but covers inland Georgia along the shifting track and runs water and evacuation-fuel actions, so it keeps a substantial share to hedge against the track moving toward Valdosta.", ref: null },
];

/* ---------------- proof ---------------- */

export type ProofKind = "list" | "photo" | "receipt";

export type ProofFile = {
  id: string;
  name: string;
  kind: ProofKind;
  size: number;
  hash: string;
  /** which drawing stands in for the picture in the demo sets */
  art?: "shelter" | "food" | "boat" | "water";
  flagged?: string;
};

export type ProofCheck = { label: string; state: "pass" | "fail" | "skipped"; note: string };

/** Digest of a sample photo filed with an earlier storm. The Verifier compares every upload against prior proof like this. */
export const PRIOR_PROOF_HASHES = ["3f9a17c04d2e8b61"];

export const DEMO_PROOFS: Record<PartnerId, ProofFile[]> = {
  a: [
    { id: "a-list", name: "perry-distribution-list.csv", kind: "list", size: 18400, hash: "a10c7e4b92d3f611" },
    { id: "a-photo-1", name: "shelter-intake.jpg", kind: "photo", size: 2310000, hash: "b24f18c07ea9d352", art: "shelter" },
    { id: "a-photo-2", name: "dry-food-stock.jpg", kind: "photo", size: 1980000, hash: "c7d93a61f04b28e5", art: "food" },
    { id: "a-receipt", name: "food-and-tarps-receipt.pdf", kind: "receipt", size: 412000, hash: "d58e20bb1c7f4a96" },
  ],
  b: [
    { id: "b-list", name: "valdosta-fuel-recipients.csv", kind: "list", size: 11200, hash: "e36b91d40a7c52f8" },
    { id: "b-photo-1", name: "fuel-handout.jpg", kind: "photo", size: 2140000, hash: "f19c04e87b3d6a20", art: "boat" },
    {
      id: "b-photo-2",
      name: "water-tanks.jpg",
      kind: "photo",
      size: 2050000,
      hash: PRIOR_PROOF_HASHES[0],
      art: "water",
      flagged: "Same image as a photo filed with an earlier storm",
    },
    { id: "b-receipt", name: "fuel-and-water-receipt.pdf", kind: "receipt", size: 386000, hash: "06ad7f3e29c1b854" },
  ],
};

/** What the Verifier reports for the sample sets. Uploaded files go through src/lib/verifier.ts instead. */
export const DEMO_CHECKS: Record<PartnerId, ProofCheck[]> = {
  a: [
    { label: "Counts match amounts", state: "pass", note: "Sample list adds up to the amount sent" },
    { label: "Dates fall before landfall", state: "pass", note: "Every sample photo and receipt is dated before landfall" },
    { label: "No duplicate or edited images", state: "pass", note: "Both sample photos are new to the Verifier" },
    { label: "Location fits the plan", state: "pass", note: "Sample location: Perry, FL" },
  ],
  b: [
    { label: "Counts match amounts", state: "pass", note: "Sample list adds up to the amount sent" },
    { label: "Dates fall before landfall", state: "pass", note: "The sample receipts are dated before landfall" },
    { label: "No duplicate or edited images", state: "fail", note: "water-tanks.jpg is the same image as a photo from an earlier storm" },
    { label: "Location fits the plan", state: "pass", note: "Sample location: Valdosta, GA" },
  ],
};

/* ---------------- donor ---------------- */

/** The demo donor: the pledge from the spec's Concierge example. */
export const DEMO_DONOR = {
  id: "D-0142",
  pledge: { hazards: ["Hurricanes"], regions: ["US Gulf Coast"], amount: 10, cap: 60, timing: "early" as const },
  captureRef: "85L65288MU803113J",
  captureRefT2: "08063864PW867334F",
};

/** True if a figure above is ever left blank. */
export const FIGURES_PENDING =
  [PLAYBOOK_HOUR, CAPTURE_HOUR, PAYOUT_HOUR, PROOF_HOUR, HELENE.brief.confidence, ...Object.values(HELENE.raised), ...HELENE.tranches.map((t) => t.amount), ...ALLOCATIONS.map((a) => a.amount)].some((value) => value === null);
