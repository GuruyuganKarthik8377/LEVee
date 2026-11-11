// What a donor is allowed to hear about, built from the Policy Engine's records. No AI, and only this donor's items.
import type { LedgerRow } from "../../../payments/src/types.ts";
import type { TrancheState } from "../../../policy/src/engine.ts";
import { reserveBalanceCents } from "../../../policy/src/rules.ts";

export type Money = { currency_code: string; value: string };

export type DonorCharge = {
  // The only handle Claude gets. It maps to PayPal ids in code, so a question can't reach someone else's record.
  id: string;
  trancheKey: string;
  pledgeId: string;
  eventName: string;
  tranche: 1 | 2;
  status: "COMPLETED" | "PENDING" | "DECLINED" | "SKIPPED" | "NOT_NOTIFIED" | "IN_PROGRESS";
  amount: Money;
  reason?: string;
  net?: Money;
  fee?: Money;
  at?: string;
  captureId?: string;
  orderId?: string;
  refund?: { refundId?: string; status: string };
  // The charge completed after the payout had gone, so its money went to the Reserve instead.
  joinedReserve?: boolean;
  // pool is what donors' charges brought in, and fromReserve what the Reserve added. Partner amounts pay out both.
  payout?: { status: string; pool: Money; fromReserve?: Money; held: Money; partners: { name: string; amount: Money }[] };
};

// A donor's monthly gift, and what the shared pool it joined has done. No gift can be traced to a storm, so this never tries.
export type DonorReserve = {
  status: string;
  monthly?: Money;
  gifts: { amount: Money; at: string }[];
  totalGiven: Money;
  pool: { balance: Money; spent: { eventName: string; amount: Money }[] };
};

export function donorReserve(donorId: string, states: TrancheState[], rows: LedgerRow[]): DonorReserve | undefined {
  const subscriptions = rows.filter((r) => r.kind === "subscription" && r.ref === donorId);
  if (subscriptions.length === 0) return undefined;
  const ids = new Set(subscriptions.map((r) => r.paypalId));
  const gifts = rows.filter((r) => r.kind === "reserve_payment" && ids.has(r.ref) && r.amount).map((r) => ({ amount: r.amount!, at: r.at }));
  const monthly = subscriptions.filter((r) => r.amount).at(-1)?.amount;
  return {
    status: subscriptions.at(-1)!.status,
    ...(monthly && { monthly }),
    gifts,
    totalGiven: money(gifts.reduce((sum, g) => sum + cents(g.amount), 0)),
    pool: {
      balance: money(reserveBalanceCents(rows)),
      spent: states.filter((s) => s.payout?.reserveCents).map((s) => ({ eventName: s.eventName, amount: money(s.payout!.reserveCents!) })),
    },
  };
}

const cents = (m: Money) => Math.round(Number(m.value) * 100);
const money = (c: number, currency_code = "USD"): Money => ({ currency_code, value: (c / 100).toFixed(2) });

// The engine only knows a payout's status from when PayPal accepted it. The ledger is kept current by webhooks, so it wins.
export function donorActivity(donorId: string, states: TrancheState[], partnerNames: Record<string, string> = {}, ledgerRows: LedgerRow[] = []): DonorCharge[] {
  const latestBatchStatus = (batchId?: string) => ledgerRows.filter((r) => r.kind === "payout_batch" && r.paypalId === batchId).at(-1)?.status;
  const charges: DonorCharge[] = [];
  for (const state of states) {
    for (const item of state.items) {
      if (item.donorId !== donorId) continue;
      const amount = money(item.cents);
      const status: DonorCharge["status"] = item.notCharged === "skipped" ? "SKIPPED" : item.notCharged === "notice_failed" ? "NOT_NOTIFIED" : (item.result?.status ?? "IN_PROGRESS");
      const r = item.result;
      const p = state.payout;
      charges.push({
        id: `charge-${charges.length + 1}`,
        trancheKey: state.key,
        pledgeId: item.pledgeId,
        eventName: state.eventName,
        tranche: state.tranche,
        status,
        amount,
        ...(r?.reason && { reason: r.reason }),
        ...(r?.net && { net: r.net, fee: money(item.cents - cents(r.net)) }),
        ...(item.firstAttemptAt && status === "COMPLETED" && { at: item.firstAttemptAt }),
        ...(r?.captureId && { captureId: r.captureId }),
        ...(r?.orderId && { orderId: r.orderId }),
        ...(item.refund && { refund: { ...(item.refund.refundId && { refundId: item.refund.refundId }), status: item.refund.status } }),
        ...(item.joinedReserve && { joinedReserve: true }),
        ...(status === "COMPLETED" && !item.joinedReserve && p && (p.heldForReview?.length || (p.result && p.result.status !== "DENIED")) && {
          payout: {
            status: latestBatchStatus(p.result?.payoutBatchId) ?? p.result?.status ?? "HELD_FOR_REVIEW",
            pool: money(p.poolCents),
            ...(p.reserveCents && { fromReserve: money(p.reserveCents) }),
            // Includes any share waiting on a person's review.
            held: money(p.heldCents + (p.heldForReview ?? []).filter((h) => h.status !== "done").reduce((sum, h) => sum + h.cents, 0)),
            partners: p.allocations.map((a) => ({ name: partnerNames[a.partnerId] ?? a.partnerId, amount: money(a.cents) })),
          },
        }),
      });
    }
  }
  return charges;
}

// Every number in Claude's text must come from the facts it was given. "10", "10.00" and "10,00" count as the same number, and so do "1349.67", "1,349.67" and "1.349,67".
// A last group of three digits groups thousands. Any other last group is decimals.
const normalize = (n: string) => {
  const groups = n.split(/[.,]/);
  const decimals = groups.length > 1 && groups.at(-1)!.length !== 3 ? groups.pop() : undefined;
  return decimals === undefined ? groups.join("") : `${groups.join("")}.${decimals}`.replace(/\.?0+$/, "");
};
const numberPattern = /\p{Nd}+(?:[.,]\p{Nd}+)*/gu;
const toWestern = (text: string) => text.replace(/\p{Nd}/gu, (d) => {
  // Each Unicode digit block runs 0 to 9 from a code point ending in 0 or 6, so walk back to find its value.
  const code = d.codePointAt(0)!;
  for (let zero = code; zero > code - 10; zero--) if (!/\p{Nd}/u.test(String.fromCodePoint(zero - 1))) return String(code - zero);
  return d;
});

export function numbersIn(text: string): string[] {
  return (toWestern(text).match(numberPattern) ?? []).map(normalize);
}

export function allowedNumbers(facts: unknown): Set<string> {
  const allowed = new Set<string>();
  const add = (n: string) => {
    allowed.add(n);
    // Facts carry ISO dates and whole amounts, while people write "26 May" and "$10".
    allowed.add(n.replace(/^0+(?=\d)/, ""));
    if (n.includes(".")) allowed.add(n.split(".")[0]);
  };
  // Value by value: as JSON text, the array [60,40] would read as the single number 60.4.
  const walk = (value: unknown) => {
    if (typeof value === "number" || typeof value === "string") numbersIn(String(value)).forEach(add);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(facts);
  return allowed;
}

// False if Claude stated a number the facts don't contain. Ids are taken out first, because they contain digits by chance.
export function onlyKnownNumbers(text: string, allowed: Set<string>, ids: string[] = []): boolean {
  let scrubbed = text;
  for (const id of ids) scrubbed = scrubbed.split(id).join(" ");
  return numbersIn(scrubbed).every((n) => allowed.has(n) || allowed.has(n.replace(/^0+(?=\d)/, "")));
}
