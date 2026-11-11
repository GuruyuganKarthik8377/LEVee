import Anthropic from "@anthropic-ai/sdk";

// The one model all five agents use. Each agent's effort level and the saved results in fixtures/ were measured on claude-opus-5-5, so re-run them after changing this.
export const MODEL = "claude-haiku-5-5";
export const withRetryableClient = (client?: Anthropic) => client ?? new Anthropic();

// For prompts of 100K tokens or fewer, which is all of these. Dollars per million tokens.
const USD_PER_MILLION = { input: 0.1, output: 0.5 };
export const costUsd = (usage: { inputTokens: number; outputTokens: number }) => (usage.inputTokens * USD_PER_MILLION.input + usage.outputTokens * USD_PER_MILLION.output) / 1_000_000;
