// Usage: npm run refund -- <capture_id>
// Refunds a charge in full, retries to prove it never refunds twice, shows PayPal refusing a second refund,
// then answers "where did my money go?" the way the Narrator agent will: with its read-only Agent Toolkit tools.
import assert from "node:assert/strict";
import { paypalToolsFor } from "../src/agent-tools.ts";
import { configFromEnv } from "../src/paypal.ts";
import { sandbox } from "./sandbox.ts";

const captureId = process.argv[2];
if (!captureId) throw new Error("Pass a capture id from npm run charge, e.g. npm run refund -- 66V7765193493444H");
const { ledger, payments } = sandbox();

const refund = await payments.refund(captureId);
console.log("Refund:", refund);
assert.equal(refund.status, "COMPLETED");

const retry = await payments.refund(captureId);
assert.equal(retry.refundId, refund.refundId, "Retry made a second refund!");
console.log("Retry returned the same refund, so no double refund.");

const again = await payments.refund(captureId, { currency_code: "USD", value: "1.00" });
console.log("A further $1 refund:", again);
assert.equal(again.status, "FAILED");

// The Narrator's toolkit tools, called directly (no LLM needed to prove they work).
const narrator = paypalToolsFor("narrator", configFromEnv());
const call = (name: string, args: object) => narrator[name].execute!(args, { toolCallId: name, messages: [] });
console.log("\nNarrator tool get_refund:", JSON.stringify(await call("get_refund", { refund_id: refund.refundId })).slice(0, 400));
console.log("\nNarrator tool list_transactions:", JSON.stringify(await call("list_transactions", { transaction_id: captureId })).slice(0, 600));

console.log("\nLedger rows:", ledger.rows);
