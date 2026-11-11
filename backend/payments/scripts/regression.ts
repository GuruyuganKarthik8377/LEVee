// Usage: npm run regression -- <vault_id> <partner1-email> <partner2-email>
// The whole money path against the real sandbox, as the demo tells it: tranche 1 to both partners before landfall,
// tranche 2 only to the partner that passed proof, a sponsor match, a refund, then every failure. Stops at the first wrong result.
import assert from "node:assert/strict";
import { paypalToolsFor } from "../src/agent-tools.ts";
import { configFromEnv } from "../src/paypal.ts";
import { runFailures } from "./failures.ts";
import { sandbox, usd, waitForBatch } from "./sandbox.ts";

const [vaultId, partnerA, partnerB] = process.argv.slice(2);
if (!vaultId || !partnerA || !partnerB) throw new Error("Usage: npm run regression -- <vault_id> <partner1-email> <partner2-email>");

const { client, ledger, payments } = sandbox();
const event = `reg${Date.now()}`;
const pledgeId = `pledge-${event}`;
const ok = (message: string) => console.log(`  ok  ${message}`);
const title = (message: string) => console.log(`\n${message}`);

title("Tranche 1: charge the donor, pay both partners before landfall");
const t1Input = { pledgeId, chargeKey: `${pledgeId}:t1`, paymentTokenId: vaultId, amount: usd("10.00") };
const t1Charge = await payments.chargePledge(t1Input);
assert.equal(t1Charge.status, "COMPLETED");
ok(`charged $10.00, capture ${t1Charge.captureId}`);
assert.equal((await payments.chargePledge(t1Input)).captureId, t1Charge.captureId);
ok("charge retry returned the same capture");

const t1Allocations = [
  { allocationId: `${event}:t1:partner-a`, partnerEmail: partnerA, amount: usd("4.00") },
  { allocationId: `${event}:t1:partner-b`, partnerEmail: partnerB, amount: usd("4.00") },
];
const t1Batch = await payments.sendPayoutBatch(`${event}:t1`, t1Allocations);
assert.ok(t1Batch.payoutBatchId);
const t1Paid = await waitForBatch(client, t1Batch.payoutBatchId);
assert.deepEqual(t1Paid.items.map((i) => i.transaction_status), ["SUCCESS", "SUCCESS"]);
ok(`both partners paid $4.00, batch ${t1Batch.payoutBatchId}`);
assert.equal((await payments.sendPayoutBatch(`${event}:t1`, t1Allocations)).payoutBatchId, t1Batch.payoutBatchId);
ok("payout retry returned the same batch");

title("Tranche 2: landfall confirmed, only the partner that passed proof gets paid");
// Choosing who passed is the Verifier and Policy Engine's job. Here partner A passed and partner B's reused photo failed.
const t2Input = { pledgeId, chargeKey: `${pledgeId}:t2`, paymentTokenId: vaultId, amount: usd("15.00") };
const t2Charge = await payments.chargePledge(t2Input);
assert.equal(t2Charge.status, "COMPLETED");
assert.notEqual(t2Charge.captureId, t1Charge.captureId);
ok(`charged $15.00 under its own key, capture ${t2Charge.captureId}`);

const t2Allocations = [{ allocationId: `${event}:t2:partner-a`, partnerEmail: partnerA, amount: usd("12.00") }];
const t2Batch = await payments.sendPayoutBatch(`${event}:t2`, t2Allocations);
assert.ok(t2Batch.payoutBatchId);
assert.notEqual(t2Batch.payoutBatchId, t1Batch.payoutBatchId);
const t2Paid = await waitForBatch(client, t2Batch.payoutBatchId);
assert.deepEqual(t2Paid.items.map((i) => [i.payout_item.receiver, i.transaction_status]), [[partnerA, "SUCCESS"]]);
ok(`partner A paid $12.00, partner B not in the batch, batch ${t2Batch.payoutBatchId}`);

title("Sponsor match");
const match = { matchKey: `${event}:t1:sponsor`, sponsor: { email: partnerB, businessName: "Regression Sponsor" }, amount: usd("10.00"), description: "Match for tranche 1" };
const invoice = await payments.invoiceMatch(match);
assert.equal(invoice.status, "SENT");
ok(`invoice sent, ${invoice.invoiceId}`);
assert.equal((await payments.invoiceMatch(match)).invoiceId, invoice.invoiceId);
ok("invoice retry returned the same invoice");
const allocator = paypalToolsFor("allocator", configFromEnv());
const raw = await allocator.get_invoice.execute!({ invoice_id: invoice.invoiceId }, { toolCallId: "get_invoice", messages: [] });
const seen = typeof raw === "string" ? JSON.parse(raw) : (raw as any);
assert.equal(seen.detail.reference, match.matchKey);
ok("Allocator's read-only tool sees it");
// Leaves nothing unpaid in the sandbox, and fires a real INVOICING.INVOICE.CANCELLED webhook.
await client.post(`/v2/invoicing/invoices/${invoice.invoiceId}/cancel`, { send_to_recipient: false, send_to_invoicer: false, note: "Regression run" });
ok("invoice cancelled");

title("Refund");
const refund = await payments.refund(t2Charge.captureId!);
assert.equal(refund.status, "COMPLETED");
ok(`refunded the $15.00 charge, refund ${refund.refundId}`);
assert.equal((await payments.refund(t2Charge.captureId!)).refundId, refund.refundId);
ok("refund retry returned the same refund");
assert.equal((await payments.refund(t2Charge.captureId!, usd("1.00"))).reason, "CAPTURE_FULLY_REFUNDED");
ok("a second refund was refused");
const narrator = paypalToolsFor("narrator", configFromEnv());
const found = JSON.stringify(await narrator.get_refund.execute!({ refund_id: refund.refundId }, { toolCallId: "get_refund", messages: [] }));
assert.ok(found.includes(refund.refundId!));
ok("Narrator's read-only tool sees it");

title("Ledger");
const count = (kind: string) => ledger.rows.filter((r) => r.kind === kind).length;
assert.deepEqual([count("charge"), count("payout_batch"), count("invoice"), count("refund")].every((n) => n > 0), true);
assert.ok(ledger.rows.every((r) => r.ref && r.paypalId && r.status && r.at));
const statuses = (kind: string) => ledger.rows.filter((r) => r.kind === kind).map((r) => r.status).join(", ");
ok(`charge: ${statuses("charge")}`);
ok(`payout_batch: ${statuses("payout_batch")}`);
ok(`invoice: ${statuses("invoice")}`);
ok(`refund: ${statuses("refund")}`);

title("Failure cases");
await runFailures(vaultId, partnerA);

console.log(`\nRegression passed. Run id ${event}.`);
