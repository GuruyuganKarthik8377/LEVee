import { tmpdir } from "node:os";
import { join } from "node:path";
import partnerProfiles from "../../../backend/agents/fixtures/helene/partners.json" with { type: "json" };
import { createLevee, type LeveePartner } from "../../../backend/agents/src/levee.ts";
import type { PaypalReader } from "../../../backend/agents/src/narrator/reader.ts";
import { toolkitReader } from "../../../backend/agents/src/narrator/reader.ts";
import { activeCycloneIds, liveSnapshot } from "../../../backend/agents/src/sentinel/feeds.ts";
import { createMockPayments } from "../../../backend/payments/src/mock.ts";
import { configFromEnv, createPaypalClient, createPaypalPayments } from "../../../backend/payments/src/paypal.ts";
import type { Payments } from "../../../backend/payments/src/types.ts";
import { createWebhookHandler } from "../../../backend/payments/src/webhook.ts";
import { US_GULF_HURRICANE } from "../../../backend/policy/src/playbook.ts";
import { fileStore } from "./store.ts";
import { createResponders } from "./responders.ts";
import { accountsConfigured } from "./supabaseAuth.ts";
import { serverSupabase, supabaseConfigured, supabaseStore } from "./supabaseStore.ts";

/**
 * The one place the website builds the backend: backend/agents/scripts/wiring-example.ts, with Levee's state kept in a file.
 * /run and /give share its store, ledger and PayPal, so the Reserve is one balance everywhere.
 */

const baseUrl = () => process.env.LEVEE_BASE_URL ?? "http://localhost:3000";

/**
 * Whether the backend's PayPal is the sandbox or the mock, which moves no money. The backend refuses anything but the sandbox either way.
 * The pages (/run, /give) have always used the sandbox once its keys are set. The backend's own /api routes wait for LEVEE_PAYMENTS=paypal.
 * LEVEE_PAYMENTS=mock keeps the backend's charges and payouts off PayPal everywhere.
 */
export function usesSandbox(forPages: boolean) {
  const setting = process.env.LEVEE_PAYMENTS;
  // The same check as paypalConfigured in src/lib/paypal.ts, which isn't imported so Node can load this file in tests.
  const keysSet = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  return setting === "paypal" || (forPages && setting !== "mock" && keysSet);
}

function build() {
  // Supabase once its settings are set; otherwise the JSON file, which only works on one server.
  const store = supabaseConfigured() ? supabaseStore(serverSupabase()) : fileStore(process.env.LEVEE_STORE ?? join(tmpdir(), "levee-backend.json"));
  // One of each, kept for the server's life: the mock remembers its retry keys only in memory.
  const mock = createMockPayments(store.ledger);
  let sandbox: { config: ReturnType<typeof configFromEnv>; client: ReturnType<typeof createPaypalClient>; payments: Payments } | undefined;
  const sandboxParts = () => {
    if (sandbox) return sandbox;
    const config = configFromEnv();
    const client = createPaypalClient(config);
    const payments = createPaypalPayments(client, store.ledger, { returnUrl: `${baseUrl()}/api/pledges/approved`, cancelUrl: `${baseUrl()}/pledge`, reservePlanId: process.env.PAYPAL_RESERVE_PLAN_ID });
    return (sandbox = { config, client, payments });
  };
  const paymentsFor = (forPages: boolean) => (usesSandbox(forPages) ? sandboxParts().payments : mock);

  // The two Helene sample partners, paid at the same sandbox emails /run uses. /run keeps them, as its saved Allocator results name them.
  const partnersFor = (forPages: boolean): LeveePartner[] => {
    const emails: Record<string, string | undefined> = { "partner-a": process.env.PAYPAL_PARTNER_A_EMAIL, "partner-b": process.env.PAYPAL_PARTNER_B_EMAIL };
    return partnerProfiles.map((p) => {
      const email = emails[p.id] ?? (usesSandbox(forPages) ? undefined : `${p.id}@example.com`);
      if (!email) throw new Error(`Set PAYPAL_${p.id.replace("-", "_").toUpperCase()}_EMAIL`);
      return { ...p, email };
    });
  };

  const noReader: PaypalReader = { charge: async () => null, refund: async () => null };
  const readerFor = (forPages: boolean): PaypalReader => (usesSandbox(forPages) ? toolkitReader({ clientId: sandboxParts().config.clientId, clientSecret: sandboxParts().config.clientSecret }) : noReader);
  const live = usesSandbox(false);
  const reader = readerFor(false);
  const levee = createLevee({
    kv: store.kv,
    ledger: store.ledger,
    readLedger: store.readLedger,
    audit: store.audit,
    payments: paymentsFor(false),
    reader,
    playbook: US_GULF_HURRICANE,
    snapshots: async () => Promise.all((await activeCycloneIds()).map((id) => liveSnapshot(id))),
    // Real storms pay the responders ops have approved, once accounts are set up (src/server/responders.ts). Until then, the samples.
    partners: async () => (accountsConfigured() ? createResponders(serverSupabase(), store.audit).approvedPartners() : partnersFor(false)),
    // ponytail: notices, receipts and stories go to the server log until an email or SMS sender is chosen.
    deliver: async (message) => console.log("[levee deliver]", message.kind, message.donorId, message.text),
    skipUrl: (trancheKey, pledgeId) => `${baseUrl()}/api/skip/${encodeURIComponent(trancheKey)}/${encodeURIComponent(pledgeId)}`,
    usdPerUnit: { USD: 1 },
  });

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const webhook = live && webhookId ? createWebhookHandler(sandboxParts().client, store.ledger, webhookId) : undefined;
  return { store, levee, webhook, paymentsFor, partnersFor, readerFor };
}

// Built on first use, not at import, so `next build` needs no settings. Kept on globalThis so a dev reload doesn't open a second copy of the file.
const shared = globalThis as unknown as { __leveeBackend?: ReturnType<typeof build> };
const built = () => (shared.__leveeBackend ??= build());

export const levee = () => built().levee;
/** Undefined until LEVEE_PAYMENTS=paypal and PAYPAL_WEBHOOK_ID are set. */
export const paypalWebhook = () => built().webhook;

/** What the pages share with the backend: its store and ledger, its PayPal and its partners. */
export const backendStore = () => built().store;
export const pagePayments = () => built().paymentsFor(true);
export const pagePartners = () => built().partnersFor(true);
/** PayPal's own records of the pages' sandbox charges, for the Narrator to read when a donor asks about them. */
export const pageReader = () => built().readerFor(true);
