import type { createPaypalClient } from "./paypal.ts";
import { RESERVE_CURRENCY, type Ledger, type LedgerRow, type Money } from "./types.ts";

const PAYOUT_ITEM_EVENTS = ["SUCCEEDED", "FAILED", "UNCLAIMED", "RETURNED", "BLOCKED", "HELD", "REFUNDED", "CANCELED"].map(
  (s) => `PAYMENT.PAYOUTS-ITEM.${s}`,
);

export const WEBHOOK_EVENT_TYPES = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  // Orders v2 sends DECLINED; DENIED is the older v1 name, kept in case PayPal sends it.
  "PAYMENT.CAPTURE.DECLINED",
  "PAYMENT.CAPTURE.DENIED",
  "VAULT.PAYMENT-TOKEN.CREATED",
  "VAULT.PAYMENT-TOKEN.DELETED",
  "PAYMENT.PAYOUTSBATCH.PROCESSING",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
  // A batch can finish SUCCESS while a partner was not paid (seen live: UNCLAIMED, RECEIVER_UNREGISTERED), so track items.
  ...PAYOUT_ITEM_EVENTS,
  "PAYMENT.CAPTURE.REFUNDED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  // Each monthly Reserve payment. Subscriptions still report payments with the older v1 "sale" object.
  "PAYMENT.SALE.COMPLETED",
  // Corporate match invoices. PAID also fires for partly paid or payment-pending; the status says which.
  "INVOICING.INVOICE.PAID",
  "INVOICING.INVOICE.CANCELLED",
  "INVOICING.INVOICE.REFUNDED",
];

// Only the fields we read; PayPal sends many more.
type WebhookEvent = { event_type: string; create_time: string; resource: Record<string, any> };

// Status comes from the event name, not the resource: older payload shapes have no status field, and a missing one must
// never read as a failure. Capture statuses match what chargePledge returns, so rows from both paths line up.
const CAPTURE_STATUS: Record<string, string> = {
  "PAYMENT.CAPTURE.COMPLETED": "COMPLETED",
  "PAYMENT.CAPTURE.PENDING": "PENDING",
  "PAYMENT.CAPTURE.DECLINED": "DECLINED",
  "PAYMENT.CAPTURE.DENIED": "DECLINED",
};
// A failed monthly payment leaves the subscription ACTIVE until PayPal suspends it, so it gets its own status.
const SUBSCRIPTION_STATUS: Record<string, string> = {
  "BILLING.SUBSCRIPTION.ACTIVATED": "ACTIVE",
  "BILLING.SUBSCRIPTION.CANCELLED": "CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED": "SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED": "EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED": "PAYMENT_FAILED",
};

// PayPal spells money three ways: { currency_code, value }, { currency, value } (Payouts, older invoices) and
// { currency, total } (sales). Payouts also write "25.0". The ledger always gets { currency_code, value: "25.00" }.
function toMoney(a?: { currency_code?: string; currency?: string; value?: string; total?: string }): Money | undefined {
  return a && { currency_code: (a.currency_code ?? a.currency)!, value: Number(a.value ?? a.total).toFixed(2) };
}

// The amount of a Reserve payment less its fee. Without a fee on the event, the row keeps only the amount.
function saleNet(sale: Record<string, any>): Money | undefined {
  const amount = toMoney(sale.amount);
  const fee = toMoney(sale.transaction_fee);
  return amount && fee && { currency_code: amount.currency_code, value: (Number(amount.value) - Number(fee.value)).toFixed(2) };
}

export function toLedgerRow({ event_type, create_time: at, resource: r }: WebhookEvent): LedgerRow | undefined {
  if (PAYOUT_ITEM_EVENTS.includes(event_type)) {
    const item = r.payout_item;
    return {
      kind: "payout_item",
      ref: item.sender_item_id,
      paypalId: r.payout_item_id,
      status: r.transaction_status,
      amount: toMoney(item.amount),
      ...(r.errors?.name && { reason: r.errors.name }),
      at,
    };
  }
  const captureStatus = CAPTURE_STATUS[event_type];
  if (captureStatus) {
    const reason = r.status_details?.reason ?? (captureStatus === "DECLINED" ? (r.status ?? "DECLINED") : undefined);
    const net = toMoney(r.seller_receivable_breakdown?.net_amount);
    return { kind: "charge", ref: r.custom_id ?? r.id, paypalId: r.id, status: captureStatus, amount: toMoney(r.amount), ...(net && { net }), ...(reason && { reason }), at };
  }
  const subscriptionStatus = SUBSCRIPTION_STATUS[event_type];
  if (subscriptionStatus) {
    const amount = r.quantity && { currency_code: RESERVE_CURRENCY, value: Number(r.quantity).toFixed(2) };
    return { kind: "subscription", ref: r.custom_id ?? r.id, paypalId: r.id, status: subscriptionStatus, ...(amount && { amount }), at };
  }
  switch (event_type) {
    case "VAULT.PAYMENT-TOKEN.CREATED":
      return { kind: "vault_saved", ref: r.customer?.id ?? r.id, paypalId: r.id, status: "SAVED", at };
    case "VAULT.PAYMENT-TOKEN.DELETED":
      return { kind: "vault_deleted", ref: r.customer?.id ?? r.id, paypalId: r.id, status: "DELETED", at };
    case "PAYMENT.PAYOUTSBATCH.PROCESSING":
    case "PAYMENT.PAYOUTSBATCH.SUCCESS":
    case "PAYMENT.PAYOUTSBATCH.DENIED": {
      const h = r.batch_header;
      return { kind: "payout_batch", ref: h.sender_batch_header.sender_batch_id, paypalId: h.payout_batch_id, status: h.batch_status, amount: toMoney(h.amount), at };
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      // The resource is the refund; its "up" link points at the refunded capture, which is the ref refund() uses.
      const captureId = r.links?.find((l: any) => l.rel === "up")?.href?.split("/").pop() ?? r.id;
      return { kind: "refund", ref: captureId, paypalId: r.id, status: "COMPLETED", amount: toMoney(r.amount), at };
    }
    case "PAYMENT.SALE.COMPLETED":
      // Sales without a billing agreement are not Reserve payments.
      if (!r.billing_agreement_id) return undefined;
      return { kind: "reserve_payment", ref: r.billing_agreement_id, paypalId: r.id, status: "COMPLETED", amount: toMoney(r.amount), ...(saleNet(r) && { net: saleNet(r) }), at };
    case "INVOICING.INVOICE.PAID":
    case "INVOICING.INVOICE.CANCELLED":
    case "INVOICING.INVOICE.REFUNDED": {
      // Invoices come in more than one shape. detail.reference is the matchKey invoiceMatch set.
      const invoice = r.invoice ?? r;
      const amount = toMoney(invoice.amount ?? invoice.total_amount);
      return { kind: "invoice", ref: invoice.detail?.reference ?? invoice.reference ?? invoice.id, paypalId: invoice.id, status: invoice.status, ...(amount && { amount }), at };
    }
  }
}

// A standard Request -> Response handler, so a Next.js route can use it directly: export const POST = handler.
// 400 for bad input stops PayPal retrying; a thrown error becomes a 5xx, so PayPal retries later.
export function createWebhookHandler(client: Pick<ReturnType<typeof createPaypalClient>, "post">, ledger: Ledger, webhookId: string) {
  return async (req: Request): Promise<Response> => {
    const raw = await req.text();
    let event: WebhookEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return new Response("invalid JSON", { status: 400 });
    }

    const header = (name: string) => JSON.stringify(req.headers.get(name) ?? "");
    // webhook_event must be the exact text PayPal sent; re-serializing it can break the signature check.
    // Safe to splice in: JSON.parse above proved raw is exactly one JSON value.
    const verifyBody = `{"auth_algo":${header("paypal-auth-algo")},"cert_url":${header("paypal-cert-url")},"transmission_id":${header("paypal-transmission-id")},"transmission_sig":${header("paypal-transmission-sig")},"transmission_time":${header("paypal-transmission-time")},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${raw}}`;
    const { verification_status } = await client.post<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", verifyBody);
    if (verification_status !== "SUCCESS") return new Response("signature check failed", { status: 400 });

    const row = toLedgerRow(event);
    if (row) await ledger.record(row);
    return new Response("ok");
  };
}
