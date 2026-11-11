// How the server wires Levee together: the example in README.md, kept here so the type check proves it still compiles.
// Swap each in-memory store for Postgres, and deliver for real email or SMS.
import { configFromEnv, createPaypalClient, createPaypalPayments } from "../../payments/src/paypal.ts";
import { memoryLedger } from "../../payments/src/types.ts";
import { createWebhookHandler } from "../../payments/src/webhook.ts";
import { US_GULF_HURRICANE } from "../../policy/src/playbook.ts";
import { createLevee, memoryKeyValue, type LeveePartner } from "../src/levee.ts";
import { toolkitReader } from "../src/narrator/reader.ts";
import { activeCycloneIds, liveSnapshot } from "../src/sentinel/feeds.ts";

export function wireLevee(partners: LeveePartner[], baseUrl: string) {
  const config = configFromEnv();
  const client = createPaypalClient(config);
  const ledger = memoryLedger(); // Postgres: unique (kind, paypal_id, status), ON CONFLICT DO NOTHING
  const payments = createPaypalPayments(client, ledger, {
    returnUrl: `${baseUrl}/pledge/approved`,
    cancelUrl: `${baseUrl}/pledge/cancelled`,
    reservePlanId: process.env.PAYPAL_RESERVE_PLAN_ID,
  });

  const levee = createLevee({
    kv: memoryKeyValue(), // Postgres: one key-value table
    ledger,
    readLedger: async () => ledger.rows,
    audit: async (entry) => console.log(JSON.stringify(entry)), // Postgres: an append-only audit table
    payments,
    reader: toolkitReader({ clientId: config.clientId, clientSecret: config.clientSecret }),
    playbook: US_GULF_HURRICANE,
    snapshots: async () => Promise.all((await activeCycloneIds()).map((id) => liveSnapshot(id))),
    partners: async () => partners,
    deliver: async (message) => console.log(message.kind, message.donorId, message.text), // email or SMS
    skipUrl: (trancheKey, pledgeId) => `${baseUrl}/skip/${encodeURIComponent(trancheKey)}/${encodeURIComponent(pledgeId)}`,
    usdPerUnit: { USD: 1 },
  });

  const webhook = createWebhookHandler(client, ledger, process.env.PAYPAL_WEBHOOK_ID!);
  return { levee, webhook };
}
