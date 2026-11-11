// Usage: npm run reserve-subscribe -- donor-1 10
// Starts a monthly Reserve gift, waits for the donor to approve it in PayPal, shows the first payment, then offers to cancel.
import { createInterface } from "node:readline/promises";
import { sandbox } from "./sandbox.ts";

const [donorId = "donor-1", dollars = "10"] = process.argv.slice(2);
const { client, ledger, payments } = sandbox();

const { subscriptionId, approveUrl } = await payments.createReserveSubscription(donorId, { currency_code: "USD", value: dollars });
console.log(`Subscription ${subscriptionId} for $${dollars}/month.\n\nOpen this link, log in with a sandbox PERSONAL (donor) account and subscribe:\n${approveUrl}\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Press Enter after you approve... ");

type Sub = { status: string; quantity: string; billing_info?: { last_payment?: { amount: { value: string }; time: string }; next_billing_time?: string } };
const sub = await client.get<Sub>(`/v1/billing/subscriptions/${subscriptionId}`);
console.log(`\nStatus: ${sub.status}, quantity ${sub.quantity}`);
console.log(`Last payment: ${sub.billing_info?.last_payment ? `$${sub.billing_info.last_payment.amount.value} at ${sub.billing_info.last_payment.time}` : "none yet"}`);
console.log(`Next billing: ${sub.billing_info?.next_billing_time ?? "?"}`);

if ((await rl.question("\nCancel it now? (y/N) ")).toLowerCase() === "y") {
  await payments.cancelReserveSubscription(subscriptionId, "Levee sandbox test");
  console.log("Cancelled.");
}
rl.close();
console.log("Ledger rows:", ledger.rows);
