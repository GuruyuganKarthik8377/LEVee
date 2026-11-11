// Levee's storage, all on the one key-value table the server provides, and the record shapes kept in it.
import type { ReviewCase, ReviewStore, TrancheStore } from "../../../policy/src/engine.ts";
import type { PartnerWork } from "../narrator/agent.ts";
import type { TranslationCache } from "../narrator/messages.ts";
import type { PledgePolicy } from "../concierge/policy.ts";
import type { ThreatBrief } from "../sentinel/agent.ts";
import type { VerifierResult } from "../verifier/agent.ts";
import type { ImageRegistry, SeenImage } from "../verifier/checks.ts";

// The one table the server provides for all of this, as JSON by key. Ledger rows and the audit log are its other two.
export type KeyValue = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  list<T>(prefix: string): Promise<T[]>;
};
export function memoryKeyValue(): KeyValue {
  const values = new Map<string, string>();
  return {
    get: async (key) => {
      const v = values.get(key);
      return v === undefined ? undefined : JSON.parse(v);
    },
    set: async (key, value) => void values.set(key, JSON.stringify(value)),
    list: async (prefix) => [...values].filter(([k]) => k.startsWith(prefix)).map(([, v]) => JSON.parse(v)),
  };
}


export const trancheStore = (kv: KeyValue): TrancheStore => ({ get: (key) => kv.get(`tranche:${key}`), save: (state) => kv.set(`tranche:${state.key}`, state) });
export const reviewStore = (kv: KeyValue): ReviewStore => ({
  get: (key) => kv.get(`review:${key}`),
  save: (review) => kv.set(`review:${review.key}`, review),
  listOpen: async () => (await kv.list<ReviewCase>("review:")).filter((r) => r.status === "open"),
});
export const translationCache = (kv: KeyValue): TranslationCache => ({ get: (key) => kv.get(`translation:${key}`), set: (key, value) => kv.set(`translation:${key}`, value) });
export const imageRegistry = (kv: KeyValue): ImageRegistry => ({
  all: () => kv.list<SeenImage>("image:"),
  add: async (images) => {
    for (const i of images) await kv.set(`image:${i.partnerId}:${i.eventKey}:${i.imageId}`, i);
  },
});

export type EventRecord = {
  eventKey: string;
  eventName: string;
  advisoryId: string;
  assessedAt: string;
  brief: ThreatBrief;
  landfall?: { confirmedAt: string; source: string };
  // Firing threw, so the next tick tries again rather than waiting up to 6 hours for a new assessment.
  fireFailed?: boolean;
};
export type VerdictRecord = { partnerId: string; result: VerifierResult; delivered: PartnerWork["delivered"] };
export type PendingVault = { donorId: string; policy: PledgePolicy; confirmedHash: string; language: string };
