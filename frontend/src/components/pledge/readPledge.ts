import type { Pledge } from "./PledgeCard";

export const MIN_AMOUNT = 5;
export const MAX_AMOUNT = 1000;

/** "$10", "$12.50" or "$1,000". */
export const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

export type Reading = { kind: "pledge"; pledge: Pledge; assumed: string[]; heard: string[] } | { kind: "reply"; message: string };

const ASK_AMOUNT = "I can only help set up a pledge here. How much would you like to give per hurricane, in US dollars? For example, $10.";
const COVERAGE = "LEVee covers hurricanes on the US Gulf Coast. Tell me an amount and I'll set that up.";

/* Whole words in any script: \b only understands ASCII, so it misses Hindi and accented letters. */
const word = (pattern: string, flags = "u") => new RegExp(`(?<![\\p{L}\\p{M}])(?:${pattern})(?![\\p{L}\\p{M}])`, flags);

const NUMBER_WORDS: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, "twenty five": 25, "twenty-five": 25, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100,
  cinco: 5, diez: 10, quince: 15, veinticinco: 25, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, cien: 100,
  पांच: 5, पाँच: 5, दस: 10, पंद्रह: 15, पच्चीस: 25, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सौ: 100,
};

const DOLLAR = "dollars?|usd|bucks|d[oó]lar(?:es)?|डॉलर|डालर";
const NUMBER = "(\\d+(?:\\.\\d{1,2})?)";
const CAP = `max(?:imum)?|m[aá]ximo|cap(?:ped)?(?:\\s+it)?(?:\\s+(?:at|of))?|up to|hasta|no more than|limit(?:\\s+of)?|l[ií]mite(?:\\s+de)?|tope(?:\\s+de)?|अधिकतम|सीमा`;
const YEAR = "(?:a|per|each|al|por|cada|प्रति)\\s*(?:year|a[nñ]o|साल|वर्ष)";

const OTHER_CURRENCY = word("rs\\.?|inr|rupees?|eur|euros?|gbp|pounds?|yen|pesos?|रुपये|रुपए|रुपया|रुपयों");
const INJECTION = /(?:ignore|disregard|forget|override|bypass)\b.{0,40}\b(?:instructions?|rules?|prompts?|guardrails?)|system prompt|you are now|developer mode|jailbreak/;
const OTHER_HAZARD = word("floods?|flooding|earthquakes?|wildfires?|tsunamis?|droughts?|landslides?|heat ?waves?|inundaci[oó]n(?:es)?|terremotos?|बाढ़|भूकंप");
// hurricane, cyclone, typhoon and storm all mean a hurricane pledge, in each language the stand-in reads
const NAMES_A_STORM = word("hurricanes?|cyclones?|typhoons?|storms?|huracan(?:es)?|huracán|ciclones?|ciclón|tormentas?|चक्रवात|तूफान");
const ABOUT_A_PLEDGE = word("hurricanes?|cyclones?|typhoons?|storms?|pledge|give|donate|make it|change it|change to|huracan(?:es)?|huracán|ciclones?|ciclón|tormentas?|donar?|चक्रवात|तूफान|दान");

const COVERED_PLACE = "florida|georgia|(?:(?:us|u\\.s\\.) )?gulf(?: coast| of mexico)?|us|u\\.s\\.?|usa|united states|america|golfo|costa del golfo|estados unidos|फ्लोरिडा|जॉर्जिया|अमेरिका";
const NAMES_A_PLACE = word(COVERED_PLACE);
const COVERED = new RegExp(`^(?:${COVERED_PLACE})(?![\\p{L}\\p{M}])`, "u");
/** Whatever follows "in" or "near". Coverage is an allow-list, so any place not named above is turned down. */
const PLACE_NAMED = /(?<![\p{L}\p{M}])(?:in|near|en|cerca de)\s+(?:the\s+|el\s+|la\s+|los\s+)?([\p{L}\p{M}.'-]+(?:\s+[\p{L}\p{M}.'-]+){0,2})/gu;
const NOT_A_PLACE = /^(?:a|an|any|each|every|my|our|your|this|that|one|all|total|case|advance|time|plain|words?|dollars?|usd|next|future)(?![\p{L}\p{M}])/u;
const FAR_AWAY = word("anywhere|everywhere|worldwide|globally|any (?:region|country)|wherever|cualquier lugar|todo el mundo|(?<!gulf of )mexico|belize|cuba|caribbean|philippines|filipinas|japan|china|africa|europe|canada");

const CONFIRMED_ONLY = /after landfall|once landfall|confirmed|only after|after it (?:hits|lands)|después de|confirmad|पुष्टि|के बाद/;
const EARLY = /early|before landfall/;

/** Thirteen or more digits in a row, with or without spaces or dashes, is treated as a card number. */
export const hasCardNumber = (text: string) => /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/.test(text);

/** Latin digits, no thousands separators, and number words as digits, so one set of patterns reads every language. */
function namesAnotherPlace(t: string) {
  if (FAR_AWAY.test(t)) return true;
  return [...t.matchAll(PLACE_NAMED)].some(([, place]) => !COVERED.test(place) && !NOT_A_PLACE.test(place) && !NAMES_A_STORM.test(place.split(/\s/)[0]));
}

function normalise(text: string) {
  const words = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|");
  return text
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
    .replace(word("(?:a |one )?hundred", "gu"), "100")
    .replace(word(words, "gu"), (w) => String(NUMBER_WORDS[w]));
}

function findAmount(t: string) {
  const figure = t.match(new RegExp(`\\$\\s?${NUMBER}`)) ?? t.match(new RegExp(`${NUMBER}\\s*(?:${DOLLAR})`, "u")) ?? t.match(new RegExp(`usd\\s*${NUMBER}`));
  if (figure) return Number(figure[1]);
  // a bare number only counts on its own or before "per", so 500 of another currency is never read as dollars
  const bare = ABOUT_A_PLEDGE.test(t) ? t.match(new RegExp(`${NUMBER}(?=\\s*(?:per|por|each|cada|every|,|\\.|$))`, "u")) : null;
  return bare ? Number(bare[1]) : null;
}

/**
 * Sandbox stand-in for the Concierge agent. It writes a card only from a pledge LEVee can honour: anything else gets a
 * question or a refusal, and it never guesses an amount. Pass the current pledge to read a follow-up, which changes only what
 * it mentions. The real agent on the backend replaces this once it is deployed, and its card has the same shape.
 */
export function readPledge(text: string, current: Pledge | null = null): Reading {
  const t = normalise(text);
  const reply = (message: string): Reading => ({ kind: "reply", message });

  if (INJECTION.test(t)) return reply("I can't change how I work. I can only set up a pledge. How much would you like to give per hurricane, in US dollars?");
  if (/[₹€£¥]/.test(t) || OTHER_CURRENCY.test(t)) return reply("Pledges are in US dollars for now. What would that be in dollars?");
  if (OTHER_HAZARD.test(t)) return reply(`That kind of disaster isn't covered yet. ${COVERAGE}`);
  if (namesAnotherPlace(t)) return reply(`That place isn't covered yet. ${COVERAGE}`);

  const capMatch = t.match(new RegExp(`(?:${CAP})\\s*(?:of\\s*|de\\s*)?\\$?\\s?${NUMBER}`, "u")) ?? t.match(new RegExp(`\\$?\\s?${NUMBER}\\s*(?:${DOLLAR})?\\s*${YEAR}`, "u"));
  const cap = capMatch ? Number(capMatch[1]) : null;
  const amount = findAmount(capMatch ? t.replace(capMatch[0], " ") : t);

  const confirmed = CONFIRMED_ONLY.test(t);
  const timingNamed = confirmed || EARLY.test(t);

  if (amount === null && !current) return reply(ASK_AMOUNT);
  if (amount === null && cap === null && !timingNamed) return reply("I didn't catch a change there. Try something like “make it $20” or “cap it at $100”.");

  const nextAmount = amount ?? current!.amount;
  if (nextAmount < MIN_AMOUNT) return reply(`The smallest pledge is ${money(MIN_AMOUNT)} per hurricane. What amount would you like?`);
  if (nextAmount > MAX_AMOUNT) return reply(`${money(nextAmount)} is over the ${money(MAX_AMOUNT)} limit per hurricane. What lower amount works for you?`);

  const nextCap = cap ?? current?.cap ?? nextAmount * 6;
  if (nextCap < nextAmount) return reply(`A yearly cap of ${money(nextCap)} is lower than one ${money(nextAmount)} charge. What cap would you like?`);

  const assumed: string[] = [];
  if (!current) {
    if (!NAMES_A_STORM.test(t) || !NAMES_A_PLACE.test(t)) assumed.push("hurricanes on the US Gulf Coast, the only coverage LEVee offers for now");
    if (cap === null) assumed.push(`a yearly cap of ${money(nextCap)}, six hurricanes at your amount`);
  }
  const heard = /confident|sure|certain/.test(t) ? ["You only want forecasts that are confident. Every playbook already needs a Sentinel score of 70 or more."] : [];

  const timing: Pledge["timing"] = timingNamed ? (confirmed ? "confirmed" : "early") : (current?.timing ?? "early");
  return { kind: "pledge", pledge: { hazards: ["Hurricanes"], regions: ["US Gulf Coast"], amount: nextAmount, cap: nextCap, timing }, assumed, heard };
}
