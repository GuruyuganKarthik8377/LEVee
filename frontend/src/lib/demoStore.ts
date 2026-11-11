"use client";

import { useSyncExternalStore } from "react";
import { PLAYBOOK_HOUR, PROOF_HOUR, REPLAY_END, REPLAY_START, type PartnerId, type ProofCheck, type ProofFile } from "@/fixtures/helene";

export type Verdict = "pass" | "partial" | "human";
export type ReviewOutcome = "released" | "held";

export type SubmittedProof = { files: ProofFile[]; checks: ProofCheck[]; verdict: Verdict; at: number };
export type Review = { outcome: ReviewOutcome; at: number };

/**
 * The one replay every screen shares, so the donor's phone and the responder's console show the same event.
 * Kept in localStorage so it survives navigation and syncs between windows. Each action below maps to a backend call
 * (POST /events/:id/replay, POST /proofs and so on), which is the only place to change when the API goes live.
 */
export type DemoState = {
  /** hours from landfall */
  clock: number;
  approved: boolean;
  skippedAt: number | null;
  proofs: Partial<Record<PartnerId, SubmittedProof>>;
  reviews: Partial<Record<PartnerId, Review>>;
};

export const INITIAL_STATE: DemoState = { clock: REPLAY_START, approved: false, skippedAt: null, proofs: {}, reviews: {} };

const KEY = "levee:demo-v3";
const listeners = new Set<() => void>();
let state = INITIAL_STATE;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...INITIAL_STATE, ...JSON.parse(raw) } : INITIAL_STATE;
  } catch {
    state = INITIAL_STATE;
  }
}

function set(patch: Partial<DemoState>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private windows can refuse storage; the demo still runs in this tab
  }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  read();
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    read();
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDemo() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL_STATE,
  );
}

/** Moves the clock. It cannot pass the playbook line until ops has approved the allocation. */
export function setClock(hours: number) {
  const limit = PLAYBOOK_HOUR === null || state.approved ? REPLAY_END : PLAYBOOK_HOUR;
  set({ clock: Math.min(Math.max(hours, REPLAY_START), limit) });
}

export const approveAllocation = () => set({ approved: true });
export const skipCharge = () => set({ skippedAt: state.clock });
export const undoSkip = () => set({ skippedAt: null });

export function submitProof(partner: PartnerId, proof: Omit<SubmittedProof, "at">) {
  // new proof replaces the old set, so any earlier review no longer applies
  const reviews = { ...state.reviews };
  delete reviews[partner];
  set({ proofs: { ...state.proofs, [partner]: { ...proof, at: state.clock } }, reviews });
}

/** A human only unlocks or holds. The Policy Engine still makes the payout. */
export function decideReview(partner: PartnerId, outcome: ReviewOutcome) {
  set({ reviews: { ...state.reviews, [partner]: { outcome, at: state.clock } } });
}

export const jumpToProofWindow = () => set({ approved: true, clock: Math.max(state.clock, PROOF_HOUR ?? 0) });
export const resetDemo = () => set(INITIAL_STATE);
