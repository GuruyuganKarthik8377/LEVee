// What every stage of the Policy Engine shares: its dependencies, the clock, and the few helpers they all use.
import type { Ledger, LedgerRow, Money, Payments, PayoutResult } from "../../../payments/src/types.ts";
import type { AuditEntry, Notice, ReviewStore, TrancheState, TrancheStore } from "../engine.ts";
import type { Playbook } from "../playbook.ts";
import { toMoney } from "../rules.ts";

export type EngineDeps = {
  payments: Pick<Payments, "chargePledge" | "sendPayoutBatch" | "refund" | "invoiceMatch" | "checkInvoice">;
  ledger: Pick<Ledger, "record">;
  store: TrancheStore;
  reviews: ReviewStore;
  playbook: Playbook;
  readLedger: () => Promise<LedgerRow[]>;
  // Throwing means the donor did not get the notice, and an unnotified donor is never charged.
  notify: (notice: Notice) => Promise<void>;
  audit: (entry: AuditEntry) => Promise<void>;
  now?: () => Date;
};

export type EngineContext = Omit<EngineDeps, "now"> & {
  now: () => Date;
  at: () => string;
  money: (cents: number) => Money;
  record: (trancheKey: string, action: string, extra?: Partial<AuditEntry>) => Promise<void>;
  reviewKey: (eventKey: string, partnerId: string) => string;
  // Sends one payout batch to the given partners. Callers fix the batch key and amounts before sending, so a retry sends the same money.
  sendBatch: (state: TrancheState, batchKey: string, paidTo: { partnerId: string; cents: number }[], idPrefix?: string) => Promise<PayoutResult>;
};

export function createContext({ payments, ledger, store, reviews, playbook, readLedger, notify, audit, now = () => new Date() }: EngineDeps): EngineContext {
  const at = () => now().toISOString();
  const money = (cents: number) => toMoney(cents, playbook.currency);
  const record = (trancheKey: string, action: string, extra: Partial<AuditEntry> = {}) => audit({ agent: "policy-engine", at: at(), trancheKey, action, ...extra });
  const reviewKey = (eventKey: string, partnerId: string) => `${eventKey}:${partnerId}`;
  const sendBatch = (state: TrancheState, batchKey: string, paidTo: { partnerId: string; cents: number }[], idPrefix = batchKey) =>
    payments.sendPayoutBatch(
      batchKey,
      paidTo.map((a) => ({ allocationId: `${idPrefix}:${a.partnerId}`, partnerEmail: state.partners.find((p) => p.id === a.partnerId)!.email, amount: money(a.cents) })),
    );
  return { payments, ledger, store, reviews, playbook, readLedger, notify, audit, now, at, money, record, reviewKey, sendBatch };
}
