// Usage: npm run vault-save -- donor-1
import { createInterface } from "node:readline/promises";
import { sandbox } from "./sandbox.ts";

const donorId = process.argv[2] ?? "donor-1";
const { payments: vault, ledger } = sandbox();

const { setupTokenId, approveUrl } = await vault.createSetupToken(donorId);
console.log(`Setup token: ${setupTokenId}\n\nOpen this link and log in with a sandbox PERSONAL (donor) account, then approve:\n${approveUrl}\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Press Enter after you approve... ");
rl.close();

const saved = await vault.savePaymentMethod(donorId, setupTokenId);
console.log(`\nSaved. Payment token (vault_id): ${saved.paymentTokenId}\nPayPal customer: ${saved.customerId}\n`);
console.log("Ledger rows:", ledger.rows);
