import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";

// "AI proposes, rules dispose": agents only get PayPal Agent Toolkit tools that read. Charges, payouts, refunds and
// subscriptions run through this payments module behind the Policy Engine, never as an agent's tool call.
// A refund a donor asks the Narrator for becomes a proposal the Policy Engine checks against the review window.
// The toolkit's tools are objects with zod `parameters` and `execute`. Agents call them from an Anthropic SDK tool loop:
// the Vercel AI SDK can't be the runtime, because ai@4 (what the toolkit targets) always sends temperature, which Claude rejects.
export const AGENT_PAYPAL_ACTIONS = {
  // Explains a donor's Reserve subscription and the plan behind it.
  concierge: { subscriptionPlans: { show: true }, subscriptions: { show: true } },
  // "Where did my $10 go?": the real transaction, order, refund and subscription records.
  narrator: { transactions: { list: true }, orders: { get: true }, payments: { getRefunds: true }, subscriptions: { show: true } },
  // Sees which sponsor matches are invoiced and paid when splitting money; the Policy Engine sends the invoices.
  allocator: { invoices: { get: true, list: true, search: true } },
};

export type AgentName = keyof typeof AGENT_PAYPAL_ACTIONS;

export function paypalToolsFor(agent: AgentName, { clientId, clientSecret }: { clientId: string; clientSecret: string }) {
  return new PayPalAgentToolkit({
    clientId,
    clientSecret,
    // Sandbox only, like the rest of the hackathon build.
    configuration: { actions: AGENT_PAYPAL_ACTIONS[agent], context: { sandbox: true } },
  }).getTools();
}
