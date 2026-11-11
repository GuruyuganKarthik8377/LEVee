// The rules and numbers a donor is bound by. All code, no AI: Claude's reading of their words only gets this far if it passes here.
import { createHash } from "node:crypto";
import { US_GULF_HURRICANE, type Pledge } from "../../../policy/src/playbook.ts";
import { toCents, toMoney, trancheCents } from "../../../policy/src/rules.ts";

export type Money = { currency_code: string; value: string };
export type PledgePolicy = {
  hazards: string[];
  regions: string[];
  amountPerEvent: Money;
  annualCap: Money;
  preference: "early" | "confirmed";
  // Optional monthly gift to the standing pool. Whole dollars only.
  reserveMonthly?: Money;
};

// What Claude read from the donor's words, before any rule is applied.
export type Reading = {
  amountPerEvent: number | null;
  annualCap: number | null;
  currency: string | null;
  hazardsAsked: string[];
  coveredRegionAsked: boolean;
  otherPlacesAsked: string[];
  preference: "early" | "confirmed" | null;
  reserveMonthly: number | null;
  ambiguous: boolean;
};

export type Problem =
  | "amount_missing" | "amount_invalid" | "amount_too_small" | "amount_too_large"
  | "cap_missing" | "cap_invalid" | "cap_below_amount" | "cap_too_large"
  | "currency_missing" | "currency_unsupported"
  | "place_not_covered" | "hazard_not_covered"
  | "reserve_invalid"
  | "ambiguous";

const CURRENCY = US_GULF_HURRICANE.currency;
export const REGION_LABEL = "the US Gulf Coast";
// At about 3.49% + $0.49 per charge, tranche 1 of a smaller pledge barely reaches a partner: $5 sends $1.44 of its first $2.00.
export const MIN_PER_EVENT = 5;
// Limits that catch a slip of the finger or a misread number. Anything larger is a conversation with the team, not a chat box.
export const MAX_PER_EVENT = 1000;
export const MAX_ANNUAL_CAP = 5000;

const dollars = (n: number) => `$${n.toFixed(2)}`;
const isMoney = (n: number) => Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export function checkReading(r: Reading): Problem[] {
  const problems: Problem[] = [];
  if (r.ambiguous) problems.push("ambiguous");

  if (r.currency === null) {
    if (r.amountPerEvent !== null || r.annualCap !== null) problems.push("currency_missing");
  } else if (r.currency.toUpperCase() !== CURRENCY) problems.push("currency_unsupported");

  if (r.amountPerEvent === null) problems.push("amount_missing");
  else if (!isMoney(r.amountPerEvent)) problems.push("amount_invalid");
  else if (r.amountPerEvent < MIN_PER_EVENT) problems.push("amount_too_small");
  else if (r.amountPerEvent > MAX_PER_EVENT) problems.push("amount_too_large");

  if (r.annualCap === null) problems.push("cap_missing");
  else if (!isMoney(r.annualCap)) problems.push("cap_invalid");
  else if (r.annualCap > MAX_ANNUAL_CAP) problems.push("cap_too_large");
  else if (r.amountPerEvent !== null && r.annualCap < r.amountPerEvent) problems.push("cap_below_amount");

  if (!r.coveredRegionAsked && r.otherPlacesAsked.length > 0) problems.push("place_not_covered");
  const hazards = r.hazardsAsked.map((h) => h.toLowerCase());
  if (hazards.length > 0 && !hazards.includes("cyclone")) problems.push("hazard_not_covered");

  if (r.reserveMonthly !== null && (!Number.isInteger(r.reserveMonthly) || r.reserveMonthly <= 0 || r.reserveMonthly > MAX_PER_EVENT)) problems.push("reserve_invalid");
  return problems;
}

// English fallback for each problem, used if Claude didn't ask a question that fits.
export const PROBLEM_QUESTIONS: Record<Problem, string> = {
  amount_missing: "How much would you like to give per storm, in US dollars?",
  amount_invalid: "Could you give the amount per storm in dollars and cents?",
  amount_too_small: `The smallest pledge is ${dollars(MIN_PER_EVENT)} per storm, because PayPal's fee would take most of a smaller gift. Would ${dollars(MIN_PER_EVENT)} work?`,
  amount_too_large: `A pledge can be up to ${dollars(MAX_PER_EVENT)} per storm here. What amount would you like?`,
  cap_missing: "What is the most you'd want to give in one year? You won't be charged beyond it.",
  cap_invalid: "Could you give your yearly limit in dollars and cents?",
  cap_below_amount: "Your yearly limit is lower than your amount per storm. Which would you like to change?",
  cap_too_large: `A yearly limit can be up to ${dollars(MAX_ANNUAL_CAP)} here. What limit would you like?`,
  currency_missing: "Is that in US dollars?",
  currency_unsupported: "Pledges are in US dollars for now. How much would you like to give in dollars?",
  place_not_covered: `Levee only covers ${REGION_LABEL} for now. Would you like to pledge for that region?`,
  hazard_not_covered: "Levee only covers hurricanes for now. Would you like to pledge for hurricanes?",
  reserve_invalid: "A monthly Reserve gift has to be a whole number of dollars. What amount would you like?",
  ambiguous: "I want to get this exactly right. Could you tell me the amount per storm and your yearly limit?",
};

export function policyFrom(r: Reading): PledgePolicy {
  const money = (n: number) => ({ currency_code: CURRENCY, value: n.toFixed(2) });
  return {
    hazards: [US_GULF_HURRICANE.hazard],
    regions: [US_GULF_HURRICANE.regionId],
    amountPerEvent: money(r.amountPerEvent!),
    annualCap: money(r.annualCap!),
    // The pitch is early action, and the card says so plainly before the donor confirms.
    preference: r.preference ?? "early",
    ...(r.reserveMonthly !== null && { reserveMonthly: money(r.reserveMonthly) }),
  };
}

export type PledgeCard = {
  headline: string;
  whatYouPay: string[];
  yearlyLimit: string;
  whereAndWhat: string;
  yourControl: string[];
  reserve?: string;
  notCovered?: string;
};

// Every figure here is computed, so a mistake in Claude's wording can't change what the donor agrees to.
export function buildCard(policy: PledgePolicy, notCovered: string[] = []): PledgeCard {
  const playbook = US_GULF_HURRICANE;
  const asPledge = { amountPerEvent: policy.amountPerEvent, preference: policy.preference } as Pledge;
  const money = (cents: number) => `$${toMoney(cents, CURRENCY).value}`;
  const first = trancheCents(asPledge, 1, playbook);
  const second = trancheCents(asPledge, 2, playbook);
  const perEvent = toCents(policy.amountPerEvent);
  const storms = Math.floor(toCents(policy.annualCap) / perEvent);

  return {
    headline: `${money(perEvent)} per hurricane, up to ${money(toCents(policy.annualCap))} a year`,
    whatYouPay:
      policy.preference === "early"
        ? [
            `${money(first)} before landfall, once forecasts meet Levee's published rules.`,
            `${money(second)} after landfall is confirmed, going only to partners whose proof passed.`,
          ]
        : [`${money(second)} after landfall is confirmed, going only to partners whose proof passed. Nothing before landfall.`],
    yearlyLimit: `You'll never be charged more than ${money(toCents(policy.annualCap))} in a calendar year. That covers about ${storms} ${storms === 1 ? "storm" : "storms"}.`,
    whereAndWhat: `Hurricanes heading for ${REGION_LABEL}.`,
    yourControl: [
      `You get a notice before each charge and have ${playbook.skipWindowMinutes} minutes to skip that storm.`,
      "PayPal's processing fee comes out of each gift, so a little less than you give reaches partners.",
    ],
    ...(policy.reserveMonthly && { reserve: `Plus $${policy.reserveMonthly.value} a month to Levee's Reserve, billed by PayPal until you cancel.` }),
    ...(notCovered.length > 0 && { notCovered: `Not covered yet: ${notCovered.join(", ")}.` }),
  };
}

export function cardHash(policy: PledgePolicy): string {
  const canonical = [policy.amountPerEvent.value, policy.amountPerEvent.currency_code, policy.annualCap.value, policy.preference, [...policy.hazards].sort().join(), [...policy.regions].sort().join(), policy.reserveMonthly?.value ?? ""].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

// Card numbers must never reach the LLM or its logs: 13 to 19 digits passing the Luhn check that real card numbers pass.
export function containsCardNumber(text: string): boolean {
  for (const match of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}
