import { paypalWebhook } from "../../../../server/levee.ts";

/** PayPal's webhook. The handler checks PayPal's signature, then writes the ledger. */
export const POST = (request: Request) => {
  const webhook = paypalWebhook();
  return webhook ? webhook(request) : Response.json({ error: "not_configured" }, { status: 503 });
};
