// Notices and receipts. Figures are always filled in by code, so no translation can change an amount or a deadline.
import type Anthropic from "@anthropic-ai/sdk";
import type { Notice } from "../../../policy/src/engine.ts";
import { MODEL, withRetryableClient } from "./model.ts";
import type { DonorCharge } from "./activity.ts";

export const TEMPLATES = {
  notice_tranche1: "{{storm}} is forecast to reach the coast, and it has met Levee's published rules. Under your pledge, {{amount}} will be charged at {{chargeAt}} and sent to local responders before the storm lands. You don't need to do anything. To skip this storm, tap before then: {{skipUrl}}",
  notice_tranche2: "{{storm}} has made landfall. Under your pledge, {{amount}} will be charged at {{chargeAt}} and sent to partners whose proof passed review. You don't need to do anything. To skip this charge, tap before then: {{skipUrl}}",
  receipt: "Thank you. For {{storm}}, {{amount}} was charged to your saved PayPal account. PayPal's fee was {{fee}}, so {{net}} of your gift goes to responders, as part of a {{pool}} payout. Reference: {{reference}}.",
  receipt_reserve: "Thank you. For {{storm}}, {{amount}} was charged to your saved PayPal account, and PayPal's fee was {{fee}}. PayPal finished this charge after the storm's payment had gone out, so {{net}} of your gift joined Levee's Reserve, which pays responders when the next storm comes. Reference: {{reference}}.",
  receipt_pending: "For {{storm}}, a charge of {{amount}} is still being processed by PayPal. We'll send your receipt once it completes. Reference: {{reference}}.",
  declined: "We couldn't charge {{amount}} for {{storm}}, and nothing was taken. If you'd like to keep helping, please check the payment method saved with PayPal.",
} as const;
export type TemplateKind = keyof typeof TEMPLATES;

export type DonorMessage = {
  kind: TemplateKind | "story";
  donorId: string;
  language: string;
  text: string;
  // Always included, so a translation can be checked against the original.
  english: string;
  translated: boolean;
};

export type TranslationCache = { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void> };
export function memoryCache(): TranslationCache {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}

const placeholders = (t: string) => [...t.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

export function validTranslation(english: string, translated: string): boolean {
  if (!translated.trim() || translated.trim() === english) return false;
  if (placeholders(english).join() !== placeholders(translated).join()) return false;
  return !/\p{Nd}/u.test(translated.replace(/\{\{\w+\}\}/g, ""));
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);

// One LLM call per template per language, ever: thousands of donors share it. A failure never delays a message, because it falls back to English.
async function templateFor(kind: TemplateKind, language: string, cache: TranslationCache, client?: Anthropic): Promise<{ template: string; translated: boolean }> {
  const english = TEMPLATES[kind];
  if (language.toLowerCase().startsWith("en")) return { template: english, translated: false };
  const key = `${kind}:${language}`;
  const cached = await cache.get(key);
  if (cached) return { template: cached, translated: true };
  try {
    const response = await withRetryableClient(client).beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: `Translate this message to a donor into the language with BCP 47 tag ${language}. Keep it warm, plain and short. Copy every {{placeholder}} exactly, untranslated, and add no digits or other numbers. Reply with only the translation.`,
      messages: [{ role: "user", content: english }],
      output_config: { effort: "low" },
    });
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (response.stop_reason === "end_turn" && validTranslation(english, text)) {
      await cache.set(key, text);
      return { template: text, translated: true };
    }
  } catch {
    // English below. A notice has a deadline, and an unsent notice means the donor can't be charged.
  }
  return { template: english, translated: false };
}

const when = (iso: string) => {
  const d = new Date(iso);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};
const usd = (m: { value: string }) => `$${m.value}`;

async function render(kind: TemplateKind, donorId: string, language: string, values: Record<string, string>, cache: TranslationCache, client?: Anthropic): Promise<DonorMessage> {
  const { template, translated } = await templateFor(kind, language, cache, client);
  return { kind, donorId, language: translated ? language : "en", text: fill(template, values), english: fill(TEMPLATES[kind], values), translated };
}

export async function writeNotice(notice: Notice, skipUrl: string, language: string, cache: TranslationCache, client?: Anthropic): Promise<DonorMessage> {
  const kind: TemplateKind = notice.trancheKey.endsWith(":t2") ? "notice_tranche2" : "notice_tranche1";
  return render(kind, notice.donorId, language, { storm: notice.eventName, amount: usd(notice.amount), chargeAt: when(notice.skipUntil), skipUrl }, cache, client);
}

// Null for a charge with nothing to tell yet, such as one the donor skipped.
export async function writeReceipt(charge: DonorCharge, donorId: string, language: string, cache: TranslationCache, client?: Anthropic): Promise<DonorMessage | null> {
  const base = { storm: charge.eventName, amount: usd(charge.amount), reference: charge.captureId ?? "" };
  if (charge.status === "DECLINED") return render("declined", donorId, language, base, cache, client);
  if (charge.status === "PENDING") return render("receipt_pending", donorId, language, base, cache, client);
  if (charge.status === "COMPLETED" && charge.net && charge.fee && charge.joinedReserve) {
    return render("receipt_reserve", donorId, language, { ...base, fee: usd(charge.fee), net: usd(charge.net) }, cache, client);
  }
  if (charge.status === "COMPLETED" && charge.net && charge.fee && charge.payout) {
    const { pool, fromReserve } = charge.payout;
    const total = fromReserve ? { value: (Number(pool.value) + Number(fromReserve.value)).toFixed(2) } : pool;
    return render("receipt", donorId, language, { ...base, fee: usd(charge.fee), net: usd(charge.net), pool: usd(total) }, cache, client);
  }
  return null;
}
