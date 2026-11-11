// Usage: npm run webhook-register -- https://<public-host>/webhooks/paypal
// Subscribes the URL to every event Levee's ledger uses and prints the webhook ID to put in .env.
// PayPal caps webhooks per app, so delete stale tunnel URLs under Apps & Credentials > Sandbox Webhooks.
import { configFromEnv, createPaypalClient } from "../src/paypal.ts";
import { WEBHOOK_EVENT_TYPES } from "../src/webhook.ts";

const url = process.argv[2];
if (!url?.startsWith("https://")) throw new Error("Pass the public https URL, ending in /webhooks/paypal");

const webhook = await createPaypalClient(configFromEnv()).post<{ id: string }>("/v1/notifications/webhooks", {
  url,
  event_types: WEBHOOK_EVENT_TYPES.map((name) => ({ name })),
});
console.log(`Registered. Add this line to .env:\nPAYPAL_WEBHOOK_ID=${webhook.id}`);
