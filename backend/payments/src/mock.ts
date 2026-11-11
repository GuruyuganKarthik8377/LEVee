import {
  assertAllocations,
  assertMoney,
  reserveAmount,
  sumMoney,
  type ChargeResult,
  type InvoiceResult,
  type Ledger,
  type Money,
  type Payments,
  type PayoutResult,
  type RefundResult,
} from "./types.ts";

// Magic values that make the mock fail the same way the sandbox does, so every failure screen can be built and demoed.
export const MOCK_FAILURES = {
  declinedToken: "MOCK-DECLINE", // chargePledge -> DECLINED, INSTRUMENT_DECLINED
  pendingToken: "MOCK-PENDING", // chargePledge -> PENDING, PENDING_REVIEW
  unclaimedEmailPrefix: "unclaimed", // payout item -> UNCLAIMED, RECEIVER_UNREGISTERED
  failedEmailPrefix: "failed", // payout item -> FAILED, RECEIVER_ACCOUNT_LOCKED
  // A batch larger than the mock balance -> DENIED, INSUFFICIENT_FUNDS
};

// Behaves like the real module (idempotent keys, validation, failure results, ledger rows) so everything can be built and tested without PayPal.
// Rows the real module only gets later by webhook (payout items, subscription activation, monthly payments) are written at once here.
export function createMockPayments(ledger: Ledger, { balance = "10000.00" } = {}): Payments {
  let n = 0;
  const id = (prefix: string) => `MOCK-${prefix}-${++n}`;
  const at = () => new Date().toISOString();
  const cents = (m: Money) => Math.round(Number(m.value) * 100);
  const charges = new Map<string, ChargeResult>();
  const batches = new Map<string, PayoutResult>();
  const captures = new Map<string, Money>();
  const refunds = new Map<string, RefundResult>();
  const subscriptions = new Map<string, string>();
  const invoices = new Map<string, InvoiceResult>();
  const bankPaid = new Map<string, Money>();
  const paidInvoices = new Set<string>();
  let balanceCents = Math.round(Number(balance) * 100);

  return {
    async createSetupToken(donorId) {
      const setupTokenId = id("SETUP");
      await ledger.record({ kind: "vault_setup", ref: donorId, paypalId: setupTokenId, status: "PAYER_ACTION_REQUIRED", at: at() });
      return { setupTokenId, approveUrl: `https://www.sandbox.paypal.com/mock-approve?token=${setupTokenId}` };
    },

    async savePaymentMethod(donorId, setupTokenId) {
      if (!setupTokenId) throw new Error("setupTokenId required");
      const paymentTokenId = id("VAULT");
      await ledger.record({ kind: "vault_saved", ref: donorId, paypalId: paymentTokenId, status: "SAVED", at: at() });
      return { paymentTokenId, customerId: id("CUST") };
    },

    async chargePledge({ pledgeId, chargeKey, paymentTokenId, amount }) {
      assertMoney(amount);
      if (!paymentTokenId) throw new Error("paymentTokenId required");
      const existing = charges.get(chargeKey);
      if (existing) return existing;

      let result: ChargeResult;
      if (paymentTokenId === MOCK_FAILURES.declinedToken) {
        result = { status: "DECLINED", reason: "INSTRUMENT_DECLINED" };
        await ledger.record({ kind: "charge", ref: pledgeId, paypalId: id("DEBUG"), status: "DECLINED", amount, reason: result.reason, at: at() });
      } else {
        const pending = paymentTokenId === MOCK_FAILURES.pendingToken;
        // Fee as seen in sandbox: 3.49% + $0.49 ($10.00 nets $9.16).
        const net = { currency_code: amount.currency_code, value: ((cents(amount) - Math.round(cents(amount) * 0.0349) - 49) / 100).toFixed(2) };
        result = { status: pending ? "PENDING" : "COMPLETED", orderId: id("ORDER"), captureId: id("CAPTURE"), ...(!pending && { net }), ...(pending && { reason: "PENDING_REVIEW" }) };
        if (!pending) {
          captures.set(result.captureId!, amount);
          balanceCents += cents(amount);
        }
        await ledger.record({ kind: "charge", ref: pledgeId, paypalId: result.captureId!, status: result.status, amount, ...(pending && { reason: "PENDING_REVIEW" }), at: at() });
      }
      charges.set(chargeKey, result);
      return result;
    },

    async sendPayoutBatch(batchKey, allocations) {
      assertAllocations(allocations);
      const existing = batches.get(batchKey);
      if (existing) return existing;
      const amount = sumMoney(allocations.map((a) => a.amount));
      const totalCents = Math.round(Number(amount.value) * 100);

      // Like PayPal: a denied batch creates nothing, so the same batchKey can be sent again once funds are there.
      if (totalCents > balanceCents) {
        await ledger.record({ kind: "payout_batch", ref: batchKey, paypalId: id("DEBUG"), status: "DENIED", amount, reason: "INSUFFICIENT_FUNDS", at: at() });
        return { status: "DENIED", reason: "INSUFFICIENT_FUNDS" };
      }

      balanceCents -= totalCents;
      const result: PayoutResult = { payoutBatchId: id("PAYOUT"), status: "PENDING" };
      batches.set(batchKey, result);
      await ledger.record({ kind: "payout_batch", ref: batchKey, paypalId: result.payoutBatchId!, status: "PENDING", amount, at: at() });
      for (const a of allocations) {
        const [status, reason] = a.partnerEmail.startsWith(MOCK_FAILURES.unclaimedEmailPrefix)
          ? ["UNCLAIMED", "RECEIVER_UNREGISTERED"]
          : a.partnerEmail.startsWith(MOCK_FAILURES.failedEmailPrefix)
            ? ["FAILED", "RECEIVER_ACCOUNT_LOCKED"]
            : ["SUCCESS", undefined];
        await ledger.record({ kind: "payout_item", ref: a.allocationId, paypalId: id("ITEM"), status, amount: a.amount, ...(reason && { reason }), at: at() });
      }
      await ledger.record({ kind: "payout_batch", ref: batchKey, paypalId: result.payoutBatchId!, status: "SUCCESS", amount, at: at() });
      return result;
    },

    async invoiceMatch({ matchKey, sponsor, amount }) {
      assertMoney(amount);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sponsor.email)) throw new Error(`Invalid sponsor email: ${sponsor.email}`);
      const existing = invoices.get(matchKey);
      if (existing) return existing;
      const invoiceId = id("INVOICE");
      const result: InvoiceResult = { status: "SENT", invoiceId, invoiceNumber: String(n), payUrl: `https://www.sandbox.paypal.com/mock-invoice/${invoiceId}` };
      invoices.set(matchKey, result);
      await ledger.record({ kind: "invoice", ref: matchKey, paypalId: invoiceId, status: "SENT", amount, at: at() });
      return result;
    },

    async recordInvoicePayment(matchKey, invoiceId, amount) {
      assertMoney(amount);
      if (bankPaid.has(invoiceId)) return;
      bankPaid.set(invoiceId, amount);
      await ledger.record({ kind: "invoice", ref: matchKey, paypalId: invoiceId, status: "PAID", amount, net: amount, at: at() });
    },

    // Paid or cancelled when a test adds the invoice row a webhook would, using the sandbox's fee as above.
    // A payment recorded by bank transfer has no PayPal fee.
    async checkInvoice(_matchKey, invoiceId) {
      const bank = bankPaid.get(invoiceId);
      if (bank) {
        if (!paidInvoices.has(invoiceId)) {
          paidInvoices.add(invoiceId);
          balanceCents += cents(bank);
        }
        return { status: "PAID", net: bank };
      }
      const rows = (ledger as { rows?: { kind: string; paypalId: string; status: string; amount?: Money }[] }).rows ?? [];
      const row = rows.filter((r) => r.kind === "invoice" && r.paypalId === invoiceId).at(-1);
      if (row?.status === "CANCELLED" || row?.status === "REFUNDED") return { status: "CLOSED" };
      if (row?.status !== "PAID" || !row.amount) return { status: "UNPAID" };
      const net = { currency_code: row.amount.currency_code, value: ((cents(row.amount) - Math.round(cents(row.amount) * 0.0349) - 49) / 100).toFixed(2) };
      if (!paidInvoices.has(invoiceId)) {
        paidInvoices.add(invoiceId);
        balanceCents += cents(net);
      }
      return { status: "PAID", net };
    },

    // shortcut: any refund closes the capture (a second one fails as fully refunded); fine while Levee only refunds whole charges.
    async refund(captureId, amount) {
      if (amount) assertMoney(amount);
      const captured = captures.get(captureId);
      if (!captured) throw new Error(`Unknown capture: ${captureId}`);
      const key = `${captureId}:${amount ? `${amount.value}${amount.currency_code}` : "full"}`;
      const existing = refunds.get(key);
      if (existing) return existing;
      const refunded = amount ?? captured;
      let result: RefundResult;
      if ([...refunds.keys()].some((k) => k.startsWith(`${captureId}:`))) {
        result = { status: "FAILED", reason: "CAPTURE_FULLY_REFUNDED" };
        await ledger.record({ kind: "refund", ref: captureId, paypalId: id("DEBUG"), status: "FAILED", amount: refunded, reason: result.reason, at: at() });
      } else {
        result = { status: "COMPLETED", refundId: id("REFUND") };
        balanceCents -= cents(refunded);
        await ledger.record({ kind: "refund", ref: captureId, paypalId: result.refundId!, status: "COMPLETED", amount: refunded, at: at() });
      }
      refunds.set(key, result);
      return result;
    },

    async createReserveSubscription(donorId, requested) {
      const monthly = reserveAmount(requested);
      const subscriptionId = id("SUB");
      subscriptions.set(subscriptionId, donorId);
      await ledger.record({ kind: "subscription", ref: donorId, paypalId: subscriptionId, status: "APPROVAL_PENDING", amount: monthly, at: at() });
      // As if the donor approved and the first month was billed.
      await ledger.record({ kind: "subscription", ref: donorId, paypalId: subscriptionId, status: "ACTIVE", amount: monthly, at: at() });
      await ledger.record({ kind: "reserve_payment", ref: subscriptionId, paypalId: id("SALE"), status: "COMPLETED", amount: monthly, at: at() });
      balanceCents += cents(monthly);
      return { subscriptionId, approveUrl: `https://www.sandbox.paypal.com/mock-subscribe?id=${subscriptionId}` };
    },

    async cancelReserveSubscription(subscriptionId, reason) {
      const donorId = subscriptions.get(subscriptionId);
      if (!donorId) throw new Error(`Unknown subscription: ${subscriptionId}`);
      if (!reason) throw new Error("reason required");
      await ledger.record({ kind: "subscription", ref: donorId, paypalId: subscriptionId, status: "CANCELLED", at: at() });
    },
  };
}
