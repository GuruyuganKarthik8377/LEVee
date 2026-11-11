// Same shape PayPal uses, so values pass straight through. Never use floats for money.
export type Money = { currency_code: string; value: string };

export type LedgerRow = {
  kind:
    | "vault_setup" | "vault_saved" | "vault_deleted"
    | "charge" | "refund"
    | "payout_batch" | "payout_item"
    | "subscription" | "reserve_payment" | "reserve_draw" | "reserve_credit"
    | "invoice";
  // pledgeId for charges, captureId for refunds, batchKey for batches, allocationId for payout items,
  // donorId (or PayPal customer id) for vault rows, donorId for subscriptions, subscription id for reserve payments,
  // trancheKey for what the Policy Engine draws from or credits to the Reserve.
  ref: string;
  // For a request PayPal refused outright there is no PayPal object, so this is the refusal's debug_id.
  paypalId: string;
  status: string;
  amount?: Money;
  // What Levee really received after PayPal's fee, when PayPal says.
  net?: Money;
  // PayPal's reason code when something failed, e.g. INSTRUMENT_DECLINED, INSUFFICIENT_FUNDS, RECEIVER_UNREGISTERED.
  reason?: string;
  at: string;
};

// Append-only: a status change (PENDING -> COMPLETED) is a new row, but record must ignore a row whose
// (kind, paypalId, status) already exists, since retries and webhook resends repeat rows.
// In Postgres: a unique constraint on those three columns plus ON CONFLICT DO NOTHING.
export type Ledger = { record(row: LedgerRow): Promise<void> };

export type Allocation = { allocationId: string; partnerEmail: string; amount: Money };

// COMPLETED: money captured. PENDING: PayPal is still deciding; a webhook later adds a COMPLETED or DECLINED row.
// DECLINED: PayPal said no (card declined, donor's saved PayPal revoked...); skip this pledge and tell the donor.
// net is what Levee actually receives after PayPal's fee. Pay partners from this, not from the amount charged.
export type ChargeResult = { status: "COMPLETED" | "PENDING" | "DECLINED"; orderId?: string; captureId?: string; net?: Money; reason?: string };

// DENIED: PayPal refused the whole batch (e.g. INSUFFICIENT_FUNDS); nothing was paid, fix it and resend with the same batchKey.
// Anything else means the batch was accepted. It can still end SUCCESS with some partners unpaid: per-partner
// results arrive by webhook as payout_item ledger rows (SUCCESS, UNCLAIMED, FAILED, RETURNED, BLOCKED...).
export type PayoutResult = { status: "PENDING" | "PROCESSING" | "SUCCESS" | "DENIED" | "CANCELED"; payoutBatchId?: string; reason?: string };

// Every method throws only when the outcome is unknown (network down, PayPal outage after retries, a bug).
// Retrying with the same key is safe within limits: PayPal keeps a chargeKey for only 6 hours (its Orders API spec), so a
// later retry can charge twice and needs a person to check first. A reused batchKey is refused for as long as PayPal keeps the batch.
export interface Payments {
  createSetupToken(donorId: string): Promise<{ setupTokenId: string; approveUrl: string }>;
  savePaymentMethod(donorId: string, setupTokenId: string): Promise<{ paymentTokenId: string; customerId: string }>;
  // chargeKey must be unique per pledge per tranche (e.g. "pledge-1:remal:t1").
  chargePledge(input: { pledgeId: string; chargeKey: string; paymentTokenId: string; amount: Money }): Promise<ChargeResult>;
  // batchKey must be unique per tranche (e.g. "remal:t1"). To re-pay partners whose items failed, send just
  // those allocations under a new key (e.g. "remal:t1:retry1").
  sendPayoutBatch(batchKey: string, allocations: Allocation[]): Promise<PayoutResult>;
  // Bills a corporate sponsor for its match when a trigger fires. matchKey must be unique per sponsor per tranche
  // (e.g. "remal:t1:acme"); retrying with it never sends a second invoice. The sponsor pays at payUrl, and
  // INVOICING.INVOICE.PAID arrives by webhook as an invoice ledger row.
  invoiceMatch(input: { matchKey: string; sponsor: Sponsor; amount: Money; description: string }): Promise<InvoiceResult>;
  // Whether a sponsor has paid, and what Levee received after fees. Read from PayPal, so a missed webhook can't strand the money.
  checkInvoice(matchKey: string, invoiceId: string): Promise<InvoicePayment>;
  // A sponsor paid its invoice outside PayPal, by bank transfer, and Levee's finance team records it on the invoice, as
  // PayPal Invoicing allows. checkInvoice then reads it as paid, with no PayPal fee. Recording an invoice that's already
  // paid does nothing, so this is safe to repeat.
  recordInvoicePayment?(matchKey: string, invoiceId: string, amount: Money): Promise<void>;
  // No amount = refund the whole capture. Retrying the same refund returns the first result, never refunds twice.
  // FAILED is PayPal's final no (e.g. CAPTURE_FULLY_REFUNDED, REFUND_TIME_LIMIT_EXCEEDED). Whether a refund is
  // allowed at all (the review window) is the Policy Engine's rule, not this module's.
  refund(captureId: string, amount?: Money): Promise<RefundResult>;
  // Optional monthly "Reserve" gift that builds a standing pool. Whole currency units only (PayPal bills
  // quantity x a 1.00 plan). The donor approves at approveUrl; ACTIVATED and each monthly payment arrive by webhook.
  createReserveSubscription(donorId: string, monthly: Money): Promise<{ subscriptionId: string; approveUrl: string }>;
  cancelReserveSubscription(subscriptionId: string, reason: string): Promise<void>;
}

export type RefundResult = { status: "COMPLETED" | "PENDING" | "FAILED"; refundId?: string; reason?: string };

export type Sponsor = { email: string; businessName: string };

// SENT: the sponsor has the invoice (PAID if a retry finds it already paid). FAILED: PayPal refused it, e.g. a bad email.
export type InvoiceResult = { status: "SENT" | "PAID" | "FAILED"; invoiceId?: string; invoiceNumber?: string; payUrl?: string; reason?: string };

// UNPAID includes partly paid: money goes out once the whole invoice is paid. CLOSED: cancelled or refunded, so nothing will come.
export type InvoicePayment = { status: "UNPAID" | "PAID" | "CLOSED"; net?: Money };

export function assertMoney(m: Money): void {
  if (!/^\d+(\.\d{1,2})?$/.test(m.value) || Number(m.value) <= 0) throw new Error(`Invalid amount: ${m.value}`);
  if (!/^[A-Z]{3}$/.test(m.currency_code)) throw new Error(`Invalid currency: ${m.currency_code}`);
}

// Sums in whole cents so 0.10 + 0.20 is exactly 0.30.
export function sumMoney(amounts: Money[]): Money {
  if (amounts.length === 0) throw new Error("Nothing to sum");
  const currency = amounts[0].currency_code;
  if (amounts.some((a) => a.currency_code !== currency)) throw new Error("Mixed currencies in one batch");
  const cents = amounts.reduce((sum, a) => sum + Math.round(Number(a.value) * 100), 0);
  return { currency_code: currency, value: (cents / 100).toFixed(2) };
}

// The Reserve plan bills quantity x 1.00 in this currency each month (see scripts/reserve-setup.ts).
export const RESERVE_CURRENCY = "USD";

// Returns the amount as "10.00" so ledger rows match the webhook's, whether the caller wrote "10" or "10.00".
export function reserveAmount(monthly: Money): Money {
  assertMoney(monthly);
  if (monthly.currency_code !== RESERVE_CURRENCY) throw new Error(`Reserve gifts are in ${RESERVE_CURRENCY}`);
  if (!/^\d+(\.0{1,2})?$/.test(monthly.value)) throw new Error(`Reserve gifts are whole amounts, got ${monthly.value}`);
  return { currency_code: RESERVE_CURRENCY, value: Number(monthly.value).toFixed(2) };
}

export function assertAllocations(allocations: Allocation[]): void {
  if (allocations.length === 0) throw new Error("No allocations");
  allocations.forEach((a) => assertMoney(a.amount));
  if (allocations.some((a) => !a.partnerEmail)) throw new Error("Allocation without partnerEmail");
  if (new Set(allocations.map((a) => a.allocationId)).size !== allocations.length) throw new Error("Duplicate allocationId");
  sumMoney(allocations.map((a) => a.amount));
}

export function memoryLedger(): Ledger & { rows: LedgerRow[] } {
  const rows: LedgerRow[] = [];
  return {
    rows,
    async record(row) {
      if (!rows.some((r) => r.kind === row.kind && r.paypalId === row.paypalId && r.status === row.status)) rows.push(row);
    },
  };
}
