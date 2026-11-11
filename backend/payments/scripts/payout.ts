// Usage: npm run payout -- <partner1-email> <partner2-email> [amount-each]
// Pays each partner from levee-platform's sandbox balance in one batch, then retries to prove it never pays twice.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { sandbox } from "./sandbox.ts";

const args = process.argv.slice(2);
const value = args.at(-1)?.includes("@") ? "25.00" : args.pop()!;
if (args.length < 2) throw new Error("Pass both partner sandbox emails, e.g. npm run payout -- a@business.example.com b@business.example.com 25.00");

const { client, ledger, payments } = sandbox();

const batchKey = `demo:${Date.now()}:t1`;
const allocations = args.map((partnerEmail, i) => ({ allocationId: `alloc-${i + 1}`, partnerEmail, amount: { currency_code: "USD", value } }));

const first = await payments.sendPayoutBatch(batchKey, allocations);
console.log("Batch sent:", first);
if (first.status === "DENIED") throw new Error(`PayPal denied the batch: ${first.reason}`);

const retry = await payments.sendPayoutBatch(batchKey, allocations);
assert.equal(retry.payoutBatchId, first.payoutBatchId, "Retry created a second batch: partners paid twice!");
// The retry may see a newer status (PENDING -> SUCCESS), which is a legitimate new ledger row, but never a second batch.
assert.equal(new Set(ledger.rows.map((r) => r.paypalId)).size, 1, "Ledger has rows for two different batches");
console.log("Retry returned the same batch, so no double payout.");

type Batch = { batch_header: { batch_status: string }; items: { transaction_status: string; payout_item: { receiver: string } }[] };
for (let i = 0; i < 10; i++) {
  const batch = await client.get<Batch>(`/v1/payments/payouts/${first.payoutBatchId}`);
  console.log(`Batch status: ${batch.batch_header.batch_status}`, batch.items.map((it) => `${it.payout_item.receiver}: ${it.transaction_status}`));
  if (!["PENDING", "PROCESSING"].includes(batch.batch_header.batch_status)) break;
  await sleep(3000);
}
console.log("Ledger rows:", ledger.rows);
