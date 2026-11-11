// Usage: npm run reserve-setup   (once per PayPal app)
// Creates the "Levee Reserve" product and a monthly plan that bills quantity x 1.00, so each donor picks a whole amount.
import { RESERVE_CURRENCY } from "../src/types.ts";
import { sandbox } from "./sandbox.ts";

const { client } = sandbox();

// Fixed request ids, so running this twice returns the same product and plan instead of making duplicates.
const product = await client.post<{ id: string }>(
  "/v1/catalogs/products",
  { name: "Levee Reserve", description: "Monthly gift to Levee's standing pool, so early-action money can go out before pledge charges settle.", type: "SERVICE" },
  "levee-reserve-product-v1",
);

const plan = await client.post<{ id: string; status: string }>(
  "/v1/billing/plans",
  {
    product_id: product.id,
    name: "Levee Reserve, monthly",
    status: "ACTIVE",
    quantity_supported: true,
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: "1.00", currency_code: RESERVE_CURRENCY } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
  },
  "levee-reserve-plan-v1",
);

console.log(`Product ${product.id}, plan ${plan.id} (${plan.status}). Add this line to .env:\nPAYPAL_RESERVE_PLAN_ID=${plan.id}`);
