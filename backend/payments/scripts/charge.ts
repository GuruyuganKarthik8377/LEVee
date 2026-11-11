// Usage: npm run charge -- <vault_id> [amount]
import assert from "node:assert/strict";
import { sandbox } from "./sandbox.ts";

const [paymentTokenId, value = "10.00"] = process.argv.slice(2);
if (!paymentTokenId) throw new Error("Pass the vault_id printed by vault-save, e.g. npm run charge -- 1pt11330j3509753f");

const { payments, ledger } = sandbox();

const input = { pledgeId: "pledge-demo", chargeKey: `pledge-demo:${Date.now()}:t1`, paymentTokenId, amount: { currency_code: "USD", value } };

const first = await payments.chargePledge(input);
console.log("Charged:", first);

// A retry with the same chargeKey must return the same capture, not charge the donor again.
const retry = await payments.chargePledge(input);
assert.equal(retry.captureId, first.captureId, "Retry created a second capture: double charge!");
assert.equal(ledger.rows.length, 1, "Retry wrote a second ledger row");
console.log("Retry returned the same capture, so no double charge.");

console.log("Ledger rows:", ledger.rows);
