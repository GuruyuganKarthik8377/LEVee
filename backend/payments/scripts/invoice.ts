// Usage: npm run invoice -- <sponsor-email> [amount]
// Sends a corporate match invoice, retries to prove it never sends twice, then reads it back with the Allocator's
// read-only Agent Toolkit tool. Open the printed pay link as a sandbox account to pay it as the sponsor.
import assert from "node:assert/strict";
import { paypalToolsFor } from "../src/agent-tools.ts";
import { configFromEnv } from "../src/paypal.ts";
import { sandbox } from "./sandbox.ts";

const [email, value = "500.00"] = process.argv.slice(2);
if (!email) throw new Error("Usage: npm run invoice -- <sponsor-email> [amount]");
const { ledger, payments } = sandbox();

const match = {
  matchKey: `demo:${Date.now()}:t1:sponsor`,
  sponsor: { email, businessName: "Demo Sponsor Inc." },
  amount: { currency_code: "USD", value },
  description: "Match for Levee donors' tranche 1 ahead of a forecast cyclone",
};

const invoice = await payments.invoiceMatch(match);
console.log("Invoice:", invoice);
assert.equal(invoice.status, "SENT");

const retry = await payments.invoiceMatch(match);
assert.equal(retry.invoiceId, invoice.invoiceId, "Retry sent a second invoice!");
console.log("Retry returned the same invoice, so no duplicate.");

const allocator = paypalToolsFor("allocator", configFromEnv());
const found = (await allocator.get_invoice.execute!({ invoice_id: invoice.invoiceId }, { toolCallId: "get_invoice", messages: [] })) as any;
const seen = typeof found === "string" ? JSON.parse(found) : found;
console.log(`\nAllocator tool get_invoice: ${seen.id} ${seen.status}, ${seen.amount?.value} ${seen.amount?.currency_code}, reference ${seen.detail?.reference}`);

console.log("\nLedger rows:", ledger.rows);
