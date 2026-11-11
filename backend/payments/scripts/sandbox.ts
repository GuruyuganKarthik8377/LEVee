// Shared setup for the sandbox scripts.
import { setTimeout as sleep } from "node:timers/promises";
import { configFromEnv, createPaypalClient, createPaypalPayments } from "../src/paypal.ts";
import { memoryLedger } from "../src/types.ts";

// No frontend yet, so after an approval PayPal sends the donor to a placeholder page; the approval counts either way.
const urls = { returnUrl: "https://example.com/levee/approved", cancelUrl: "https://example.com/levee/cancelled" };

// mockCode turns on PayPal's sandbox negative testing: PayPal answers with that failure (e.g. INSTRUMENT_DECLINED).
export function sandbox({ ledger = memoryLedger(), mockCode }: { ledger?: ReturnType<typeof memoryLedger>; mockCode?: string } = {}) {
  const extraHeaders = mockCode ? { "PayPal-Mock-Response": JSON.stringify({ mock_application_codes: mockCode }) } : undefined;
  const client = createPaypalClient({ ...configFromEnv(), extraHeaders });
  const payments = createPaypalPayments(client, ledger, { ...urls, reservePlanId: process.env.PAYPAL_RESERVE_PLAN_ID });
  return { client, ledger, payments };
}

export const usd = (value: string) => ({ currency_code: "USD", value });

type Batch = {
  batch_header: { batch_status: string };
  items: { transaction_status: string; errors?: { name: string }; payout_item: { receiver: string; sender_item_id: string } }[];
};

// Polls until PayPal finishes the batch and every item has left PENDING (a batch can finish a moment before its items).
export async function waitForBatch(client: ReturnType<typeof createPaypalClient>, payoutBatchId: string): Promise<Batch> {
  for (let i = 0; ; i++) {
    const batch = await client.get<Batch>(`/v1/payments/payouts/${payoutBatchId}`);
    const busy = ["PENDING", "PROCESSING"].includes(batch.batch_header.batch_status) || batch.items.some((it) => it.transaction_status === "PENDING");
    if (!busy) return batch;
    if (i === 40) throw new Error(`Batch ${payoutBatchId} still ${batch.batch_header.batch_status} after 2 minutes`);
    await sleep(3000);
  }
}
