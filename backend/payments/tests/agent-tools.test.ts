import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_PAYPAL_ACTIONS, paypalToolsFor, type AgentName } from "../src/agent-tools.ts";

// The guardrail: if anyone widens an agent's PayPal actions, this list stops matching and the test fails.
const EXPECTED: Record<AgentName, string[]> = {
  concierge: ["show_subscription_details", "show_subscription_plan_details"],
  narrator: ["get_order", "get_refund", "list_transactions", "show_subscription_details"],
  allocator: ["get_invoice", "list_invoices", "search_invoicing"],
};

// Toolkit tools that move money or change PayPal state. No agent may ever hold one.
const MONEY_MOVING = [
  "create_order", "pay_order", "create_refund",
  "create_subscription", "update_subscription", "cancel_subscription", "create_subscription_plan", "update_plan",
  "create_invoice", "send_invoice", "record_payment_for_invoice", "record_refund_for_invoice",
  "accept_dispute_claim",
];

for (const agent of Object.keys(AGENT_PAYPAL_ACTIONS) as AgentName[]) {
  test(`${agent} gets only its read-only PayPal tools`, () => {
    const tools = Object.keys(paypalToolsFor(agent, { clientId: "test", clientSecret: "test" })).sort();
    assert.deepEqual(tools, EXPECTED[agent]);
    assert.deepEqual(tools.filter((t) => MONEY_MOVING.includes(t)), []);
  });
}
