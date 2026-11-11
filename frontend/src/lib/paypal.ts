/**
 * Server-only PayPal helpers. Sandbox is hard-coded on purpose: this hackathon build must never reach the live API,
 * whatever credentials end up in the environment.
 */
const API = "https://api-m.sandbox.paypal.com";

export const paypalConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const notConfigured = () => Response.json({ error: "not_configured" }, { status: 503 });

function basicAuth() {
  return `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`;
}

async function oauth(params: Record<string, string>) {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", ...params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal token request failed with ${res.status}`);
  return (await res.json()) as { access_token: string };
}

/**
 * The browser-safe token that JS SDK v6 is created with. PayPal ties it to the site's domain (domains[]), taken from
 * LEVEE_BASE_URL once the site is deployed. On localhost PayPal accepts the token without one.
 */
export async function browserClientToken() {
  return (await oauth({ response_type: "client_token", ...siteDomain() })).access_token;
}

function siteDomain(): Record<string, string> {
  try {
    const host = new URL(process.env.LEVEE_BASE_URL ?? "").hostname;
    return host && host !== "localhost" && host !== "127.0.0.1" ? { "domains[]": host } : {};
  } catch {
    return {};
  }
}

async function vaultPost<T>(path: string, body: unknown) {
  const { access_token } = await oauth({});
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", "PayPal-Request-Id": crypto.randomUUID() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export function createSetupToken(origin: string) {
  return vaultPost<{ id: string }>("/v3/vault/setup-tokens", {
    payment_source: {
      paypal: {
        usage_type: "MERCHANT",
        experience_context: { return_url: `${origin}/pledge`, cancel_url: `${origin}/pledge`, vault_instruction: "ON_PAYER_APPROVAL" },
      },
    },
  });
}

export function createPaymentToken(setupToken: string) {
  return vaultPost<{ id: string }>("/v3/vault/payment-tokens", { payment_source: { token: { id: setupToken, type: "SETUP_TOKEN" } } });
}

/** Wraps a route so a missing config answers 503, which tells the button to stay in its sandbox preview. */
export async function paypalRoute(handler: () => Promise<Response>) {
  if (!paypalConfigured()) return notConfigured();
  try {
    return await handler();
  } catch (error) {
    console.error(error);
    return Response.json({ error: "paypal_failed" }, { status: 502 });
  }
}

/* ---------------- donations, charges and payouts ---------------- */

export class PayPalRefused extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
  ) {
    super(`PayPal refused this: ${issue}`);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<T> {
  const { access_token } = await oauth({});
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId && { "PayPal-Request-Id": requestId }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalRefused(res.status, data.details?.[0]?.issue ?? data.name ?? `status ${res.status}`);
  return data as T;
}

const money = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });
const toCents = (value?: string) => Math.round(Number(value ?? 0) * 100);

export type Capture = { status: string; captureId: string; orderId: string; grossCents: number; feeCents: number; netCents: number };

type OrderResponse = {
  id: string;
  status: string;
  purchase_units?: {
    custom_id?: string;
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount?: { value: string };
        seller_receivable_breakdown?: { paypal_fee?: { value: string }; net_amount?: { value: string } };
      }[];
    };
  }[];
};

/** Reads what PayPal really did, because the amount and fee must never come from the browser. */
function captureFrom(order: OrderResponse): Capture {
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) throw new Error(`Order ${order.id} came back ${order.status} with no capture`);
  const gross = toCents(capture.amount?.value);
  const breakdown = capture.seller_receivable_breakdown;
  return { status: capture.status, captureId: capture.id, orderId: order.id, grossCents: gross, feeCents: toCents(breakdown?.paypal_fee?.value), netCents: breakdown?.net_amount ? toCents(breakdown.net_amount.value) : gross };
}

/** A one-time gift: the donor approves it in PayPal's window, then the server captures it. */
export async function createGiftOrder(cents: number, giftId: string) {
  const order = await call<OrderResponse>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [{ custom_id: giftId, description: "Gift to the LEVee Reserve (sandbox)", amount: money(cents) }],
      payment_source: { paypal: { experience_context: { brand_name: "LEVee", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" } } },
    },
    `gift-order-${giftId}`,
  );
  return order.id;
}

export async function captureGiftOrder(orderId: string) {
  return captureFrom(await call<OrderResponse>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, `gift-capture-${orderId}`));
}

/** Charges a saved PayPal account with the donor absent. The same key within 6 hours can't charge twice. */
export async function chargeSavedAccount(args: { paymentToken: string; cents: number; key: string; description: string }) {
  return captureFrom(
    await call<OrderResponse>(
      "POST",
      "/v2/checkout/orders",
      { intent: "CAPTURE", purchase_units: [{ custom_id: args.key.slice(0, 120), description: args.description, amount: money(args.cents) }], payment_source: { paypal: { vault_id: args.paymentToken } } },
      args.key,
    ),
  );
}

export type BatchItem = { id: string; email: string; cents: number };

export async function sendPayout(batchKey: string, items: BatchItem[]) {
  const data = await call<{ batch_header: { payout_batch_id: string; batch_status: string } }>("POST", "/v1/payments/payouts", {
    sender_batch_header: { sender_batch_id: batchKey, email_subject: "LEVee sandbox funds", email_message: "Sandbox funds released by the LEVee demo." },
    items: items.map((i) => ({ recipient_type: "EMAIL", receiver: i.email, sender_item_id: i.id, amount: { currency: "USD", value: (i.cents / 100).toFixed(2) } })),
  });
  return { batchId: data.batch_header.payout_batch_id, status: data.batch_header.batch_status };
}

export async function readPayout(batchId: string) {
  const data = await call<{ batch_header: { batch_status: string }; items?: { transaction_status: string }[] }>("GET", `/v1/payments/payouts/${encodeURIComponent(batchId)}`);
  return { status: data.batch_header.batch_status, items: (data.items ?? []).map((i) => i.transaction_status) };
}

export async function refundCapture(captureId: string) {
  const data = await call<{ id: string; status: string }>("POST", `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {}, `refund-${captureId}`);
  return { refundId: data.id, status: data.status };
}
