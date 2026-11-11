// Usage: npm run webhook-server   (listens on http://localhost:8787/webhooks/paypal)
// Local stand-in for the Next.js route until the app exists; the route will just call the same handler.
import { createServer } from "node:http";
import { configFromEnv, createPaypalClient } from "../src/paypal.ts";
import { memoryLedger } from "../src/types.ts";
import { createWebhookHandler } from "../src/webhook.ts";

const webhookId = process.env.PAYPAL_WEBHOOK_ID;
if (!webhookId) throw new Error("Set PAYPAL_WEBHOOK_ID in .env (npm run webhook-register prints it)");

const ledger = memoryLedger();
const handle = createWebhookHandler(createPaypalClient(configFromEnv()), ledger, webhookId);
const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks/paypal") return void res.writeHead(404).end();
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  try {
    const response = await handle(new Request(`http://localhost${req.url}`, { method: "POST", headers, body: Buffer.concat(chunks) }));
    res.writeHead(response.status).end(await response.text());
    console.log(`Webhook answered ${response.status}. Ledger rows:`, ledger.rows);
  } catch (err) {
    console.error(err);
    res.writeHead(500).end();
  }
}).listen(port, () => console.log(`Webhook listener on http://localhost:${port}/webhooks/paypal`));
