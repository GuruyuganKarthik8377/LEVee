import { randomUUID } from "node:crypto";

/**
 * What /run and /give remember about one browser, and the two helpers that change it. No storage here: src/lib/liveStore.ts saves it.
 * Kept apart so the server code that runs the replay (src/server/liveRun.ts) can use it outside Next.js, as its test does.
 */

/** The buttons on /run. Each one moves the Helene replay on (src/server/liveRun.ts). */
export type Action = "fire" | "skip" | "charge1" | "proof" | "charge2" | "approve" | "reject" | "reset";

/** `by` names the agent for an "ai" entry. `kind` marks what the donor's own page shows: their notices, charges, receipts and story. */
export type Activity = { at: string; title: string; detail: string; ref?: string; tone: "paypal" | "rule" | "person" | "error" | "ai"; by?: string; kind?: "notice" | "charge" | "receipt" | "story" };

/** How the replay's agents answer: their saved results from the recorded Helene run, or Claude, live. */
export type AiMode = "saved" | "live";

export type Payout = { batchKey: string; batchId?: string; status?: string; items: { partner: "a" | "b"; cents: number; status?: string }[] };

export type Charge = { status: string; captureId: string; grossCents: number; feeCents: number; netCents: number };

/** A sponsor's matching gift on tranche 1: PayPal's invoice to the sponsor, its payment, and the payout of the match. */
export type Match = { sponsor: string; cents: number; invoiceId: string; invoiceNumber?: string; paid?: boolean; payout?: Payout };

export type RunStage = "idle" | "notice" | "t1_paid" | "proof" | "t2_paid" | "done" | "skipped";

export type Run = {
  id: string;
  stage: RunStage;
  /** The replay's clock, in 2024. */
  clock?: string;
  /** The GDACS advisory the replay is at. Live, it moves on while Sentinel is still unsure. */
  advisory?: number;
  /** leadHours: how long before landfall tranche 1's payout went out. */
  t1?: { charge?: Charge; reserveCents: number; poolCents?: number; payout?: Payout; leadHours?: number; match?: Match };
  t2?: { charge?: Charge; poolCents?: number; payout?: Payout; heldCents?: number; decided?: "approve" | "reject"; release?: Payout };
  error?: string;
  /** Saved results unless the person chose live AI when triggering the storm. */
  ai?: AiMode;
  /** Claude's cost so far in a live run, in US dollars. */
  aiCostUsd?: number;
  /** Each live agent call, for "How this run was decided". */
  aiSteps?: { agent: string; decided: string; ms: number; costUsd: number }[];
  /** The last live try, when Sentinel scored under the rule's line and no money moved. */
  belowLine?: { confidence: number; summary: string };
};

export type Gift = { id: string; orderId: string; cents: number; status: "created" | "captured" | "refunded"; captureId?: string; feeCents?: number; netCents?: number; at: string; refundId?: string };

export type Session = {
  id: string;
  // timing is missing on pledges saved before it existed, which were all charged early.
  pledge?: { amountCents: number; capCents: number; paymentToken: string; chargedCents: number; timing?: "early" | "confirmed" };
  gifts: Gift[];
  run: Run;
  activity: Activity[];
  /** Questions this browser has asked the Narrator, each a Claude call. */
  asked?: number;
};

export const newRun = (): Run => ({ id: randomUUID().slice(0, 13), stage: "idle" });

export const log = (session: Session, entry: Omit<Activity, "at">) => session.activity.unshift({ at: new Date().toISOString(), ...entry });
