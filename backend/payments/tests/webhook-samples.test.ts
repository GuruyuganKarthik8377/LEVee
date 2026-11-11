import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toLedgerRow, WEBHOOK_EVENT_TYPES } from "../src/webhook.ts";

// PayPal's own sample payloads (POST /v1/notifications/simulate-event), so the mapping is tested against real shapes.
const samples = JSON.parse(readFileSync(new URL("./fixtures/paypal-webhook-samples.json", import.meta.url), "utf8"));

const EXPECTED: Record<string, [kind: string, status: string]> = {
  "PAYMENT.CAPTURE.COMPLETED": ["charge", "COMPLETED"],
  "PAYMENT.CAPTURE.PENDING": ["charge", "PENDING"],
  "PAYMENT.CAPTURE.DECLINED": ["charge", "DECLINED"],
  "PAYMENT.CAPTURE.DENIED": ["charge", "DECLINED"],
  "PAYMENT.CAPTURE.REFUNDED": ["refund", "COMPLETED"],
  "VAULT.PAYMENT-TOKEN.CREATED": ["vault_saved", "SAVED"],
  "VAULT.PAYMENT-TOKEN.DELETED": ["vault_deleted", "DELETED"],
  "PAYMENT.PAYOUTSBATCH.PROCESSING": ["payout_batch", "PROCESSING"],
  "PAYMENT.PAYOUTSBATCH.SUCCESS": ["payout_batch", "SUCCESS"],
  "PAYMENT.PAYOUTSBATCH.DENIED": ["payout_batch", "DENIED"],
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": ["payout_item", "SUCCESS"],
  "PAYMENT.PAYOUTS-ITEM.FAILED": ["payout_item", "FAILED"],
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": ["payout_item", "UNCLAIMED"],
  "PAYMENT.PAYOUTS-ITEM.RETURNED": ["payout_item", "RETURNED"],
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": ["payout_item", "BLOCKED"],
  "PAYMENT.PAYOUTS-ITEM.HELD": ["payout_item", "ONHOLD"],
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": ["payout_item", "REFUNDED"],
  "PAYMENT.PAYOUTS-ITEM.CANCELED": ["payout_item", "CANCELED"],
  "BILLING.SUBSCRIPTION.ACTIVATED": ["subscription", "ACTIVE"],
  "BILLING.SUBSCRIPTION.CANCELLED": ["subscription", "CANCELLED"],
  "BILLING.SUBSCRIPTION.SUSPENDED": ["subscription", "SUSPENDED"],
  "BILLING.SUBSCRIPTION.EXPIRED": ["subscription", "EXPIRED"],
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED": ["subscription", "PAYMENT_FAILED"],
  "INVOICING.INVOICE.PAID": ["invoice", "PAID"],
  "INVOICING.INVOICE.CANCELLED": ["invoice", "CANCELLED"],
  "INVOICING.INVOICE.REFUNDED": ["invoice", "REFUNDED"],
};

test("every subscribed event has a PayPal sample and an expected row", () => {
  for (const type of WEBHOOK_EVENT_TYPES) {
    assert.ok(samples[type], `no sample for ${type}`);
    if (type !== "PAYMENT.SALE.COMPLETED") assert.ok(EXPECTED[type], `no expected row for ${type}`);
  }
});

for (const [type, [kind, status]] of Object.entries(EXPECTED)) {
  test(`${type} sample maps to a complete ${kind} row`, () => {
    const row = toLedgerRow(samples[type]);
    assert.ok(row);
    assert.equal(row.kind, kind);
    assert.equal(row.status, status);
    assert.ok(row.ref, "ref missing");
    assert.ok(row.paypalId, "paypalId missing");
    assert.ok(row.at, "at missing");
    if (row.amount) {
      assert.match(row.amount.currency_code, /^[A-Z]{3}$/);
      assert.match(row.amount.value, /^-?\d+\.\d{2}$/);
    }
  });
}

test("a plain sale is ignored; a subscription's sale becomes a Reserve payment", () => {
  const sale = samples["PAYMENT.SALE.COMPLETED"];
  assert.equal(toLedgerRow(sale), undefined);
  const row = toLedgerRow({ ...sale, resource: { ...sale.resource, billing_agreement_id: "I-SUB" } });
  assert.deepEqual([row?.kind, row?.ref, row?.status, row?.amount?.value], ["reserve_payment", "I-SUB", "COMPLETED", "0.48"]);
});

test("a missing status never reads as a failure: an older-shape pending capture stays PENDING", () => {
  const row = toLedgerRow({ event_type: "PAYMENT.CAPTURE.PENDING", create_time: "t", resource: { id: "C-1", state: "pending", amount: { total: "2.25", currency: "EUR" } } });
  assert.deepEqual([row?.status, row?.reason, row?.amount], ["PENDING", undefined, { currency_code: "EUR", value: "2.25" }]);
});

test("a nested invoice ties back to its matchKey", () => {
  const row = toLedgerRow({
    event_type: "INVOICING.INVOICE.PAID",
    create_time: "t",
    resource: { invoice: { id: "INV2-1", status: "PAID", detail: { reference: "remal:t1:acme" }, amount: { currency_code: "USD", value: "500.00" } } },
  });
  assert.deepEqual([row?.ref, row?.paypalId, row?.status, row?.amount?.value], ["remal:t1:acme", "INV2-1", "PAID", "500.00"]);
});
