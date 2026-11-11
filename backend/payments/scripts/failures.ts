// Usage: npm run failures -- <vault_id> <partner-email>
// Runs every payment failure against the real sandbox and checks Levee handles each one.
import assert from "node:assert/strict";
import { sandbox, usd, waitForBatch } from "./sandbox.ts";

export async function runFailures(vaultId: string, partnerEmail: string) {
  const run = Date.now();
  const { client, ledger, payments } = sandbox();
  const failing = (mockCode: string) => sandbox({ ledger, mockCode }).payments;

  console.log("1. Donor's card declined");
  const declined = await failing("INSTRUMENT_DECLINED").chargePledge({ pledgeId: "pledge-f1", chargeKey: `f1:${run}`, paymentTokenId: vaultId, amount: usd("10.00") });
  console.log("  ", declined);
  assert.deepEqual(declined, { status: "DECLINED", reason: "INSTRUMENT_DECLINED" });

  console.log("2. Donor's saved PayPal revoked or unknown");
  const revoked = await payments.chargePledge({ pledgeId: "pledge-f2", chargeKey: `f2:${run}`, paymentTokenId: "revoked-token-123", amount: usd("10.00") });
  console.log("  ", revoked);
  assert.deepEqual(revoked, { status: "DECLINED", reason: "PERMISSION_DENIED" });

  console.log("3. Platform balance too low for the payout batch");
  const batchKey = `f3:${run}`;
  const allocation = [{ allocationId: `alloc-f3:${run}`, partnerEmail, amount: usd("1.00") }];
  const denied = await failing("INSUFFICIENT_FUNDS").sendPayoutBatch(batchKey, allocation);
  console.log("  ", denied);
  assert.deepEqual(denied, { status: "DENIED", reason: "INSUFFICIENT_FUNDS" });
  const resent = await payments.sendPayoutBatch(batchKey, allocation);
  console.log("   Resent with the same batchKey once funds are there:", resent);
  assert.notEqual(resent.status, "DENIED");

  console.log("4. Partner has no PayPal account (batch succeeds, partner unpaid)");
  const unregistered = await payments.sendPayoutBatch(`f4:${run}`, [{ allocationId: `alloc-f4:${run}`, partnerEmail: `levee-unregistered-${run}@example.com`, amount: usd("1.00") }]);
  const batch = await waitForBatch(client, unregistered.payoutBatchId!);
  const item = batch.items[0];
  console.log(`   Batch: ${batch.batch_header.batch_status}, partner: ${item.transaction_status} (${item.errors?.name})`);
  assert.equal(item.transaction_status, "UNCLAIMED");
  console.log("   The webhook records this as a payout_item row: UNCLAIMED, RECEIVER_UNREGISTERED.");

  return ledger.rows;
}

if (import.meta.main) {
  const [vaultId, partnerEmail] = process.argv.slice(2);
  if (!vaultId || !partnerEmail) throw new Error("Usage: npm run failures -- <vault_id> <partner-email>");
  const rows = await runFailures(vaultId, partnerEmail);
  console.log("\nAll failure cases behaved as expected. Ledger rows:", rows);
}
