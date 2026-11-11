import { createHash, randomUUID } from "node:crypto";
import {
  assertAllocations,
  assertMoney,
  reserveAmount,
  sumMoney,
  type Ledger,
  type Money,
  type Payments,
  type PayoutResult,
  type RefundResult,
} from "./types.ts";

type Config = {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  retryDelayMs?: number;
  // Sandbox negative testing, e.g. { "PayPal-Mock-Response": '{"mock_application_codes":"INSTRUMENT_DECLINED"}' }.
  extraHeaders?: Record<string, string>;
};

export class PaypalError extends Error {
  status: number;
  body: any;
  constructor(path: string, status: number, text: string) {
    super(`PayPal ${path} failed (${status}): ${text}`);
    this.status = status;
    try {
      this.body = JSON.parse(text);
    } catch {
      this.body = text;
    }
  }

  // PayPal puts the specific reason in details[0].issue (e.g. INSTRUMENT_DECLINED), or only in name (e.g. INSUFFICIENT_FUNDS).
  get issue(): string {
    return this.body?.details?.[0]?.issue ?? this.body?.name ?? `HTTP_${this.status}`;
  }
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

export function configFromEnv(env = process.env): Config {
  const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: clientSecret } = env;
  const apiBase = env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
  if (!clientId || !clientSecret) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env");
  // The hackathon build is sandbox-only; refuse live keys so a mistake can't move real money.
  if (!apiBase.includes("sandbox")) throw new Error(`Refusing non-sandbox API base: ${apiBase}`);
  return { clientId, clientSecret, apiBase };
}

export function createPaypalClient(config: Config) {
  let token: { value: string; expiresAt: number } | undefined;

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt) return token.value;
    const res = await fetch(`${config.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return token.value;
  }

  // Retries network errors, timeouts, 429 and 5xx. Safe for money calls because each one carries an idempotency key
  // (PayPal-Request-Id for orders, sender_batch_id for payouts), so a retry after PayPal already acted can't act twice.
  // Other 4xx are PayPal's final answer and are thrown at once.
  async function request<T>(method: "GET" | "POST", path: string, body?: string, requestId?: string): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${config.apiBase}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            ...(body !== undefined && { "Content-Type": "application/json" }),
            ...(requestId && { "PayPal-Request-Id": requestId }),
            // Full objects back (e.g. a refund's amount), not just id and status.
            Prefer: "return=representation",
            ...config.extraHeaders,
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw err;
        await sleep(attempt);
        continue;
      }
      // An access token can expire between our check and PayPal's; fetch a fresh one and try again once.
      if (res.status === 401 && attempt === 1) {
        token = undefined;
        continue;
      }
      const text = await res.text();
      // Some calls (e.g. cancelling a subscription) answer 204 with no body.
      if (res.ok) return (text ? JSON.parse(text) : undefined) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
        await sleep(attempt);
        continue;
      }
      throw new PaypalError(path, res.status, text);
    }
  }

  const sleep = (attempt: number) => new Promise((r) => setTimeout(r, (config.retryDelayMs ?? 500) * 2 ** (attempt - 1)));

  // A string body is sent as-is (already JSON); anything else is serialized.
  const post = <T>(path: string, body: unknown, requestId?: string) =>
    request<T>("POST", path, typeof body === "string" ? body : JSON.stringify(body), requestId);
  const get = <T>(path: string) => request<T>("GET", path);

  return { post, get };
}

type Link = { href: string; rel: string };

type Capture = { id: string; status: string; status_details?: { reason?: string }; seller_receivable_breakdown?: { net_amount?: Money } };
type Order = { id: string; status: string; purchase_units?: { payments?: { captures?: Capture[] } }[] };
type Refund = { id: string; status: string; amount?: Money; status_details?: { reason?: string } };
type Invoice = {
  id: string;
  status: string;
  detail: { invoice_number?: string; metadata?: { recipient_view_url?: string } };
  amount?: Money;
  payments?: { paid_amount?: Money; transactions?: { payment_id?: string; method?: string; amount?: Money }[] };
};

type Options = {
  // Where PayPal sends the donor after approving (or cancelling) a saved payment method or subscription.
  returnUrl: string;
  cancelUrl: string;
  // Printed by npm run reserve-setup; only needed for Reserve subscriptions.
  reservePlanId?: string;
};

export function createPaypalPayments(
  client: ReturnType<typeof createPaypalClient>,
  ledger: Ledger,
  { returnUrl, cancelUrl, reservePlanId }: Options,
): Payments {
  const at = () => new Date().toISOString();

  // A payment through PayPal has a fee to take off. One the merchant recorded by hand, such as a bank transfer, has none.
  async function receivedFrom(payment: { payment_id?: string; method?: string; amount?: Money }): Promise<Money> {
    if (payment.method !== "PAYPAL" || !payment.payment_id) return payment.amount!;
    const id = encodeURIComponent(payment.payment_id);
    try {
      const capture = await client.get<Capture>(`/v2/payments/captures/${id}`);
      return capture.seller_receivable_breakdown?.net_amount ?? payment.amount!;
    } catch (err) {
      if (!(err instanceof PaypalError) || err.status !== 404) throw err;
    }
    // Older invoices were paid as v1 sales.
    const sale = await client.get<{ amount: { total: string; currency: string }; transaction_fee?: { value: string } }>(`/v1/payments/sale/${id}`);
    return { currency_code: sale.amount.currency, value: (Number(sale.amount.total) - Number(sale.transaction_fee?.value ?? 0)).toFixed(2) };
  }

  return {
    async createSetupToken(donorId: string) {
      const data = await client.post<{ id: string; status: string; links: Link[] }>(
        "/v3/vault/setup-tokens",
        {
          payment_source: {
            paypal: {
              description: "Levee pledge: charged only when a forecast storm triggers your pledge, within your yearly cap.",
              permit_multiple_payment_tokens: false,
              usage_type: "MERCHANT",
              customer_type: "CONSUMER",
              experience_context: {
                brand_name: "Levee",
                shipping_preference: "NO_SHIPPING",
                return_url: returnUrl,
                cancel_url: cancelUrl,
              },
            },
          },
        },
        randomUUID(),
      );
      const approveUrl = data.links.find((l) => l.rel === "approve")?.href;
      if (!approveUrl) throw new Error(`No approve link in setup token response: ${JSON.stringify(data)}`);
      await ledger.record({ kind: "vault_setup", ref: donorId, paypalId: data.id, status: data.status, at: at() });
      return { setupTokenId: data.id, approveUrl };
    },

    async savePaymentMethod(donorId: string, setupTokenId: string) {
      const data = await client.post<{ id: string; customer: { id: string } }>(
        "/v3/vault/payment-tokens",
        { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
        `save-${setupTokenId}`,
      );
      await ledger.record({ kind: "vault_saved", ref: donorId, paypalId: data.id, status: "SAVED", at: at() });
      return { paymentTokenId: data.id, customerId: data.customer.id };
    },

    async chargePledge({ pledgeId, chargeKey, paymentTokenId, amount }) {
      assertMoney(amount);
      let order: Order;
      try {
        // With a vault_id and the donor not present, PayPal creates and captures the order in this one call.
        order = await client.post<Order>(
          "/v2/checkout/orders",
          {
            intent: "CAPTURE",
            // custom_id comes back on the capture webhook, so ledger rows from both paths share the same ref.
            purchase_units: [{ reference_id: pledgeId, custom_id: pledgeId, amount }],
            payment_source: { paypal: { vault_id: paymentTokenId } },
          },
          chargeKey,
        );
      } catch (err) {
        // Seen live in sandbox: a decline is 422 (INSTRUMENT_DECLINED, TRANSACTION_REFUSED...) and an unknown or
        // revoked vault_id is 403 PERMISSION_DENIED. Both are final for this token; anything else stays an error.
        if (!(err instanceof PaypalError) || ![403, 422].includes(err.status)) throw err;
        const reason = err.issue;
        await ledger.record({ kind: "charge", ref: pledgeId, paypalId: err.body?.debug_id ?? chargeKey, status: "DECLINED", amount, reason, at: at() });
        return { status: "DECLINED", reason };
      }
      const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) throw new Error(`Order ${order.id} came back ${order.status} with no capture: ${JSON.stringify(order)}`);
      // A capture can also come back DECLINED or FAILED inside a successful order response.
      const status = capture.status === "COMPLETED" || capture.status === "PENDING" ? capture.status : "DECLINED";
      const reason = capture.status_details?.reason ?? (status === "DECLINED" ? capture.status : undefined);
      await ledger.record({ kind: "charge", ref: pledgeId, paypalId: capture.id, status, amount, ...(reason && { reason }), at: at() });
      const net = capture.seller_receivable_breakdown?.net_amount;
      return { status, orderId: order.id, captureId: capture.id, ...(net && { net }), ...(reason && { reason }) };
    },

    async sendPayoutBatch(batchKey, allocations) {
      assertAllocations(allocations);
      const amount = sumMoney(allocations.map((a) => a.amount));
      type BatchHeader = { payout_batch_id: string; batch_status: PayoutResult["status"] };
      let header: BatchHeader;
      try {
        header = (await client.post<{ batch_header: BatchHeader }>("/v1/payments/payouts", {
          sender_batch_header: {
            sender_batch_id: batchKey,
            email_subject: "Levee early-action funds",
            email_message: "Funds released ahead of a forecast storm. Proof of early action unlocks the next tranche.",
          },
          items: allocations.map((a) => ({
            recipient_type: "EMAIL",
            receiver: a.partnerEmail,
            amount: { currency: a.amount.currency_code, value: a.amount.value },
            sender_item_id: a.allocationId,
            note: `Levee allocation ${a.allocationId}`,
          })),
        })).batch_header;
      } catch (err) {
        if (!(err instanceof PaypalError)) throw err;
        // Payouts ignores PayPal-Request-Id: a retry with the same sender_batch_id is refused (never paid twice),
        // and the error links to the original batch, so return that one instead of failing.
        const original = err.body?.details?.find((d: any) => d.field === "SENDER_BATCH_ID")?.link?.find((l: any) => l.rel === "self")?.href;
        if (original) {
          header = (await client.get<{ batch_header: BatchHeader }>(new URL(original).pathname)).batch_header;
        } else if (err.status === 422) {
          // Seen live: INSUFFICIENT_FUNDS is a 422 and no batch is created, so nobody was paid.
          const reason = err.issue;
          await ledger.record({ kind: "payout_batch", ref: batchKey, paypalId: err.body?.debug_id ?? batchKey, status: "DENIED", amount, reason, at: at() });
          return { status: "DENIED", reason };
        } else {
          throw err;
        }
      }
      const { payout_batch_id, batch_status } = header;
      await ledger.record({ kind: "payout_batch", ref: batchKey, paypalId: payout_batch_id, status: batch_status, amount, at: at() });
      return { payoutBatchId: payout_batch_id, status: batch_status };
    },

    async refund(captureId, amount) {
      if (amount) assertMoney(amount);
      let refund: Refund;
      try {
        refund = await client.post<Refund>(
          `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
          { ...(amount && { amount }), note_to_payer: "Levee has refunded your storm pledge." },
          // shortcut: two separate partial refunds of the same amount on one capture would share this key and the
          // second would be a no-op; Levee only refunds whole tranche charges. Add a refund id to the contract if that changes.
          `refund:${captureId}:${amount ? `${amount.value}${amount.currency_code}` : "full"}`,
        );
      } catch (err) {
        // 422 is PayPal's final no, e.g. CAPTURE_FULLY_REFUNDED or REFUND_TIME_LIMIT_EXCEEDED.
        if (!(err instanceof PaypalError) || err.status !== 422) throw err;
        const reason = err.issue;
        await ledger.record({ kind: "refund", ref: captureId, paypalId: err.body?.debug_id ?? captureId, status: "FAILED", ...(amount && { amount }), reason, at: at() });
        return { status: "FAILED", reason };
      }
      const status: RefundResult["status"] = refund.status === "COMPLETED" || refund.status === "PENDING" ? refund.status : "FAILED";
      const reason = refund.status_details?.reason ?? (status === "FAILED" ? refund.status : undefined);
      const refunded = refund.amount ?? amount;
      await ledger.record({ kind: "refund", ref: captureId, paypalId: refund.id, status, ...(refunded && { amount: refunded }), ...(reason && { reason }), at: at() });
      return { status, refundId: refund.id, ...(reason && { reason }) };
    },

    async createReserveSubscription(donorId, requested) {
      const monthly = reserveAmount(requested);
      if (!reservePlanId) throw new Error("Set PAYPAL_RESERVE_PLAN_ID in .env (npm run reserve-setup prints it)");
      const data = await client.post<{ id: string; status: string; links: Link[] }>(
        "/v1/billing/subscriptions",
        {
          plan_id: reservePlanId,
          quantity: String(Number(monthly.value)),
          // Comes back on every subscription webhook, so ledger rows can be tied to the donor.
          custom_id: donorId,
          application_context: {
            brand_name: "Levee",
            shipping_preference: "NO_SHIPPING",
            user_action: "SUBSCRIBE_NOW",
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
        randomUUID(),
      );
      const approveUrl = data.links.find((l) => l.rel === "approve")?.href;
      if (!approveUrl) throw new Error(`No approve link in subscription response: ${JSON.stringify(data)}`);
      await ledger.record({ kind: "subscription", ref: donorId, paypalId: data.id, status: data.status, amount: monthly, at: at() });
      return { subscriptionId: data.id, approveUrl };
    },

    async cancelReserveSubscription(subscriptionId, reason) {
      const path = `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`;
      try {
        await client.post(`${path}/cancel`, { reason });
      } catch (err) {
        // A retry after a lost response gets 422 (already cancelled); the status check below decides.
        if (!(err instanceof PaypalError) || err.status !== 422) throw err;
      }
      const sub = await client.get<{ status: string; custom_id?: string }>(path);
      if (sub.status !== "CANCELLED") throw new Error(`Subscription ${subscriptionId} is ${sub.status}, not CANCELLED`);
      await ledger.record({ kind: "subscription", ref: sub.custom_id ?? subscriptionId, paypalId: subscriptionId, status: "CANCELLED", at: at() });
    },

    async invoiceMatch({ matchKey, sponsor, amount, description }) {
      assertMoney(amount);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sponsor.email)) throw new Error(`Invalid sponsor email: ${sponsor.email}`);
      // Invoicing ignores PayPal-Request-Id (seen live: a retry created a second invoice), so the invoice number
      // carries the idempotency instead: it comes from matchKey, PayPal refuses a reused one, and a retry finds the original by it.
      const invoiceNumber = `LV-${createHash("sha256").update(matchKey).digest("hex").slice(0, 16)}`;
      let invoice: Invoice;
      try {
        invoice = await client.post<Invoice>("/v2/invoicing/invoices", {
          detail: {
            invoice_number: invoiceNumber,
            currency_code: amount.currency_code,
            // Comes back on every invoice webhook, so payments can be tied to the match.
            reference: matchKey,
            note: "Your matching gift for Levee donors' early-action pledges.",
            payment_term: { term_type: "DUE_ON_RECEIPT" },
          },
          primary_recipients: [{ billing_info: { email_address: sponsor.email, business_name: sponsor.businessName } }],
          items: [{ name: "Matching gift", description, quantity: "1", unit_amount: amount }],
        });
      } catch (err) {
        if (!(err instanceof PaypalError) || err.status !== 422) throw err;
        if (err.issue === "DUPLICATE_INVOICE_NUMBER") {
          const found = await client.post<{ items?: Invoice[] }>("/v2/invoicing/search-invoices", { invoice_number: invoiceNumber });
          const original = found.items?.find((i) => i.detail.invoice_number === invoiceNumber);
          // Outcome unknown, so throw: the caller retries later with the same matchKey, which can't make a second invoice.
          if (!original) throw new Error(`Invoice ${invoiceNumber} exists but PayPal's search can't find it yet; retry later`);
          invoice = original;
        } else {
          const reason = err.issue;
          await ledger.record({ kind: "invoice", ref: matchKey, paypalId: err.body?.debug_id ?? matchKey, status: "FAILED", amount, reason, at: at() });
          return { status: "FAILED", reason };
        }
      }

      // The original may still be a DRAFT if an earlier attempt stopped before sending; PayPal's 422 means it was sent after all.
      if (invoice.status === "DRAFT") {
        try {
          await client.post(`/v2/invoicing/invoices/${invoice.id}/send`, { send_to_recipient: true, send_to_invoicer: false });
        } catch (err) {
          if (!(err instanceof PaypalError) || err.status !== 422) throw err;
        }
      }
      invoice = await client.get<Invoice>(`/v2/invoicing/invoices/${invoice.id}`);
      if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") throw new Error(`Invoice ${invoice.id} is ${invoice.status} after sending`);

      const status = invoice.status === "PAID" || invoice.status === "MARKED_AS_PAID" ? "PAID" : "SENT";
      await ledger.record({ kind: "invoice", ref: matchKey, paypalId: invoice.id, status, amount, at: at() });
      return {
        status,
        invoiceId: invoice.id,
        ...(invoice.detail.invoice_number && { invoiceNumber: invoice.detail.invoice_number }),
        ...(invoice.detail.metadata?.recipient_view_url && { payUrl: invoice.detail.metadata.recipient_view_url }),
      };
    },

    async recordInvoicePayment(matchKey, invoiceId, amount) {
      assertMoney(amount);
      const path = `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`;
      const invoice = await client.get<Invoice>(path);
      if (invoice.status === "PAID" || invoice.status === "MARKED_AS_PAID") return;
      await client.post(`${path}/payments`, { method: "BANK_TRANSFER", payment_date: new Date().toISOString().slice(0, 10), amount, note: `Matching gift received for ${matchKey}` });
    },

    async checkInvoice(matchKey, invoiceId) {
      const invoice = await client.get<Invoice>(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`);
      if (["CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "MARKED_AS_REFUNDED"].includes(invoice.status)) return { status: "CLOSED" };
      if (invoice.status !== "PAID" && invoice.status !== "MARKED_AS_PAID") return { status: "UNPAID" };

      const currency = (invoice.payments?.paid_amount ?? invoice.amount)!.currency_code;
      let netCents = 0;
      for (const t of invoice.payments?.transactions ?? []) netCents += Math.round(Number((await receivedFrom(t)).value) * 100);
      const net = { currency_code: currency, value: (netCents / 100).toFixed(2) };
      await ledger.record({ kind: "invoice", ref: matchKey, paypalId: invoiceId, status: "PAID", ...(invoice.amount && { amount: invoice.amount }), net, at: at() });
      return { status: "PAID", net };
    },
  };
}
