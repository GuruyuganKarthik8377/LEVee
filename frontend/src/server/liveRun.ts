import type { KeyValue, LeveePartner } from "../../../backend/agents/src/levee.ts";
import type { PaypalReader } from "../../../backend/agents/src/narrator/reader.ts";
import type { DonorMessage } from "../../../backend/agents/src/narrator/messages.ts";
import type { EventRecord } from "../../../backend/agents/src/levee/stores.ts";
import { replaySnapshot } from "../../../backend/agents/src/sentinel/feeds.ts";
import type { Ledger, LedgerRow, Payments, PayoutResult } from "../../../backend/payments/src/types.ts";
import type { ChargeItem, TrancheState } from "../../../backend/policy/src/engine.ts";
import { US_GULF_HURRICANE } from "../../../backend/policy/src/playbook.ts";
import { reserveBalanceCents } from "../../../backend/policy/src/rules.ts";
import { log, newRun, type Action, type AiMode, type Charge, type Payout, type Session } from "../lib/liveSession.ts";
import type { MatchSponsor } from "../../../backend/policy/src/playbook.ts";
import { dollars, RULES } from "../lib/rules.ts";
import { FIRED_ADVISORY, heleneReplay, LANDFALL, PROOF_AT, scopedKeyValue, type AiStep, type LiveAgents } from "./replay.ts";

/**
 * /run's buttons, each moving one browser's Hurricane Helene replay on through the real backend (src/server/replay.ts).
 * The Policy Engine decides and moves the money. This only moves the replay's clock, makes the calls a person would, and describes what happened.
 * Every step is safe to repeat after a failure: the engine skips finished parts, and PayPal's keys stop a second charge or batch.
 */

export type RunDeps = { kv: KeyValue; ledger: Ledger; readLedger: () => Promise<LedgerRow[]>; payments: Payments; partners: () => LeveePartner[]; liveAgents?: LiveAgents };

const MINUTE = 60_000;

/**
 * The demo's sample sponsor: a company that matches donors' early gifts 1:1, up to $25 a storm. LEVee invoices it
 * through PayPal Invoicing once tranche 1 pays out, and pays the match on once the invoice is paid.
 * PAYPAL_SPONSOR_EMAIL can be a sandbox account's email, to see the invoice arrive there.
 */
const SPONSOR: MatchSponsor = { id: "sponsor-harbor-pine", email: process.env.PAYPAL_SPONSOR_EMAIL ?? "giving@harborandpine.example.com", businessName: "Harbor & Pine Co.", matchBps: 10_000, maxCentsPerTranche: 2_500 };
const label = (partnerId: string) => (partnerId === "partner-a" ? "Partner A" : "Partner B");
const letter = (partnerId: string): "a" | "b" => (partnerId === "partner-a" ? "a" : "b");
const cents = (money?: { value: string }) => (money ? Math.round(Number(money.value) * 100) : 0);
const usd = (amount: number) => ({ currency_code: US_GULF_HURRICANE.currency, value: (amount / 100).toFixed(2) });
const later = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * MINUTE).toISOString();

/** This browser's replay: its own table, clock and PayPal keys, sharing the backend's ledger, so the Reserve is one balance. */
function replayFor(session: Session, deps: RunDeps, answering?: { reader: PaypalReader }) {
  const run = session.run;
  const pledgeId = `run-${run.id}`;
  const now = () => new Date(run.clock ?? replaySnapshot(run.advisory ?? FIRED_ADVISORY, "helene").asOf);
  // The replay's clock is in 2024 but PayPal dates its rows today, so this run's charges are counted in the replay's year, for its yearly cap.
  const readLedger = async () => (await deps.readLedger()).map((row) => (row.ref === pledgeId ? { ...row, at: now().toISOString() } : row));
  const kv = scopedKeyValue(deps.kv, `run:${run.id}:`);
  // Messages are told after the step that sent them, so the activity reads in order.
  const messages: DonorMessage[] = [];
  const live = run.ai === "live" && !answering ? { onAi: (step: AiStep) => tellAi(session, step), ...deps.liveAgents } : undefined;
  // The sponsor matches tranche 1, the money that goes out before landfall: it's set when the storm fires.
  const sponsors = () => (session.run.stage === "idle" ? [SPONSOR] : []);
  const levee = heleneReplay({ kv, ledger: deps.ledger, readLedger, payments: deps.payments, partners: deps.partners(), runId: run.id, now, advisory: () => run.advisory ?? FIRED_ADVISORY, deliver: async (m) => void messages.push(m), sponsors, ...(answering && { answering }), ...(live && { live }) });

  const event = async () => (await kv.list<EventRecord>("event:"))[0];
  const tranche = async (n: 1 | 2) => {
    const e = await event();
    return e && kv.get<TrancheState>(`tranche:${e.eventKey}:t${n}`);
  };
  const tellMessages = () => {
    const title: Record<string, string> = { notice_tranche1: "Notice sent to you", notice_tranche2: "Notice sent to you", story: "LEVee told you what your money did" };
    const kind = (k: string) => (k.startsWith("notice") ? "notice" : k === "story" ? "story" : "receipt");
    for (const m of messages.splice(0)) log(session, { tone: "rule", kind: kind(m.kind), title: title[m.kind] ?? "Receipt sent to you", detail: m.text });
  };
  /** Runs the hourly job once, at the replay's clock, and returns what it did. A failure becomes the step's error. */
  const tick = async () => {
    const actions: string[] = [];
    for (const report of await levee.tick()) {
      if (report.error) throw new Error(report.error);
      actions.push(...report.actions);
    }
    return actions;
  };
  return { levee, kv, pledgeId, event, tranche, tick, tellMessages };
}

type Replay = ReturnType<typeof replayFor>;

/** What a live agent decided, in the activity, with how long Claude took and what it cost. */
function tellAi(session: Session, step: AiStep) {
  const run = session.run;
  run.aiCostUsd = (run.aiCostUsd ?? 0) + step.costUsd;
  if (step.agent === "sentinel") {
    const b = step.brief;
    log(session, { tone: "ai", by: "Sentinel", title: `Sentinel scored Helene ${b.confidence} out of 100`, detail: b.summary });
    (run.aiSteps ??= []).push({ agent: "Sentinel", decided: `Confidence ${b.confidence}`, ms: step.ms, costUsd: step.costUsd });
  } else {
    const shares = (step.allocation.proposal ?? []).map((p) => `${label(p.partnerId)} ${Math.round(p.shareBps / 100)}%: ${p.rationale}`).join(" ");
    log(session, { tone: "ai", by: "Allocator", title: "The Allocator proposed the split", detail: `${shares || step.allocation.summary} The Policy Engine checks it against each partner's limits.` });
    const split = (step.allocation.proposal ?? []).map((p) => `${label(p.partnerId)} ${Math.round(p.shareBps / 100)}%`).join(", ");
    (run.aiSteps ??= []).push({ agent: "Allocator", decided: split || step.allocation.summary, ms: step.ms, costUsd: step.costUsd });
  }
}

/** The pledge as the engine keeps it. Its yearly cap is what's left of the browser's cap, which carries over between runs. */
function pledgeFor(session: Session, pledgeId: string) {
  const pledge = session.pledge!;
  return { id: pledgeId, donorId: session.id, paymentTokenId: pledge.paymentToken, hazards: [US_GULF_HURRICANE.hazard], regions: [US_GULF_HURRICANE.regionId], amountPerEvent: usd(pledge.amountCents), annualCap: usd(Math.max(pledge.capCents - pledge.chargedCents, 0)), preference: pledge.timing ?? "early" };
}

function chargeOf(item: ChargeItem): Charge {
  const gross = item.cents;
  const net = item.result?.status === "COMPLETED" ? cents(item.result.net) : 0;
  return { status: item.result!.status, captureId: item.result!.captureId ?? "", grossCents: gross, feeCents: net ? gross - net : 0, netCents: net };
}

/** A batch as the page shows it. Statuses come from the ledger: the mock writes them at once, and PayPal's webhook later. */
function payoutOf(batchKey: string, result: PayoutResult | undefined, paidTo: { partnerId: string; cents: number }[], idPrefix: string, rows: LedgerRow[]): Payout {
  const last = (match: (r: LedgerRow) => boolean) => rows.filter(match).at(-1)?.status;
  return {
    batchKey,
    batchId: result?.payoutBatchId,
    status: last((r) => r.kind === "payout_batch" && r.paypalId === result?.payoutBatchId) ?? result?.status,
    items: paidTo.map((p) => ({ partner: letter(p.partnerId), cents: p.cents, status: last((r) => r.kind === "payout_item" && r.ref === `${idPrefix}:${p.partnerId}`) })),
  };
}

const refused = (state: TrancheState) => `PayPal refused this step (${state.payout?.result?.reason ?? "no reason given"}). Nothing was lost, so you can try again.`;

const confirmedOnly = (session: Session) => session.pledge?.timing === "confirmed";
const WAITS = "You chose to give only once landfall is confirmed";

/** Describes this donor's charge in a tranche, once. Returns the charge, or undefined when nothing was charged to them. */
function noteCharge(session: Session, state: TrancheState, pledgeId: string, previous?: Charge): Charge | undefined {
  if (previous || !session.pledge) return previous;
  const item = state.items.find((i) => i.pledgeId === pledgeId);
  if (!item && state.tranche === 1 && confirmedOnly(session)) {
    log(session, { tone: "rule", title: "Tranche 1: nothing charged to you", detail: `${WAITS}, so your whole pledge waits for tranche 2` });
    return undefined;
  }
  if (!item) {
    log(session, { tone: "rule", title: `Tranche ${state.tranche}: yearly cap reached`, detail: `The ${dollars(session.pledge.capCents)} cap has been used, so nothing was charged` });
    return undefined;
  }
  if (!item.result) return undefined;
  const charge = chargeOf(item);
  if (charge.status === "COMPLETED") session.pledge.chargedCents += charge.grossCents;
  log(session, { tone: "paypal", kind: "charge", title: `PayPal charged ${dollars(charge.grossCents)} from your saved account`, detail: `Status ${charge.status}. PayPal's fee ${dollars(charge.feeCents)}, leaving ${dollars(charge.netCents)}`, ref: charge.captureId });
  return charge;
}

/** Closes the skip window, or retries after a refusal: the engine charges and pays at its first tick after chargeAt. */
async function settle(session: Session, r: Replay, n: 1 | 2) {
  const before = (await r.tranche(n))!;
  const clock = session.run.clock!;
  session.run.clock = later(before.chargeAt && before.chargeAt > clock ? before.chargeAt : clock, 1);
  await r.tick();
  return (await r.tranche(n))!;
}

/** Live, Sentinel may be unsure at the first advisory. Like the hourly job, the replay then waits for the next ones, up to this. */
const LAST_LIVE_ADVISORY = FIRED_ADVISORY + 2;

async function fire(session: Session, r: Replay, deps: RunDeps) {
  if (!session.pledge && reserveBalanceCents(await deps.readLedger()) <= 0) throw new Error("There's no money to send yet. Save a pledge or give to the Reserve first.");
  if (session.pledge) await r.kv.set(`pledge:${r.pledgeId}`, pledgeFor(session, r.pledgeId));
  const run = session.run;
  const at = (advisory: number) => {
    run.advisory = advisory;
    run.clock = replaySnapshot(advisory, "helene").asOf;
  };
  at(FIRED_ADVISORY);
  let actions = await r.tick();
  let event = await r.event();
  let state = await r.tranche(1);
  // Too unsure to move money. A real storm brings a new GDACS advisory about every 6 hours, and Sentinel reads it again.
  while (!state && event && run.ai === "live" && event.brief.confidence < RULES.minConfidence && run.advisory! < LAST_LIVE_ADVISORY) {
    log(session, {
      tone: "rule",
      title: `Advisory ${run.advisory}: no money moves yet`,
      detail: `Sentinel's confidence ${event.brief.confidence} is under the rule's ${RULES.minConfidence}. LEVee waits for GDACS's next advisory, about 6 hours later`,
    });
    at(run.advisory! + 1);
    actions = await r.tick();
    event = await r.event();
    state = await r.tranche(1);
  }
  // The engine doesn't fire with nothing to collect: here, a pledge whose yearly cap is used up, or one that waits for landfall, and an empty Reserve.
  if (!state && actions.includes("tranche 1 not fired: no pledges to charge")) {
    session.run.stage = "done";
    if (confirmedOnly(session)) log(session, { tone: "rule", title: "Tranche 1: nothing to collect", detail: `${WAITS}, and the Reserve is empty. Tranche 2 only follows a tranche 1, so nothing was charged` });
    else log(session, { tone: "rule", title: "Tranche 1: yearly cap reached", detail: `The ${dollars(session.pledge!.capCents)} cap has been used, so nothing was charged` });
    log(session, { tone: "rule", title: "Nothing to send", detail: "No money was collected, so no payout was made" });
    return;
  }
  // Live, Sentinel can score under the line. That's the rules working: no money moves, and the person decides what next.
  if (!state && event && session.run.ai === "live" && event.brief.confidence < RULES.minConfidence) {
    const belowLine = { confidence: event.brief.confidence, summary: event.brief.summary };
    log(session, { tone: "rule", title: `Rules not met: Sentinel scored ${belowLine.confidence} at advisory ${run.advisory}, and the rule needs ${RULES.minConfidence}`, detail: "No money moved. Ask Sentinel again, or carry on with the recorded Helene run" });
    // A fresh replay for the next try, so the storm is assessed again rather than remembered.
    session.run = { ...newRun(), belowLine, aiCostUsd: session.run.aiCostUsd, aiSteps: session.run.aiSteps };
    return;
  }
  if (!state || !event) throw new Error(`Nothing fired: ${actions.find((a) => a.startsWith("tranche 1")) ?? "the rules weren't met at this advisory"}`);
  const { brief } = event;
  const how = session.run.ai === "live" ? "Sentinel scored it live, just now" : "The score is the saved result from the replay";
  log(session, { tone: "rule", title: "Fixed rules met for Hurricane Helene", detail: `GDACS advisory ${run.advisory}: ${brief.alertLevel} alert, forecast landfall in ${Math.round(brief.landfall?.leadHours ?? 0)} hours, Sentinel confidence ${brief.confidence}. ${how}` });
  r.tellMessages();
  session.run.stage = "notice";
  // With no donor to notify there's no skip window, so the Reserve's share has already gone.
  if (state.status !== "notice_open") await describeFirst(session, r, deps, state);
}

const chargeFirst = async (session: Session, r: Replay, deps: RunDeps) => {
  await describeFirst(session, r, deps, await settle(session, r, 1));
  if (session.run.stage === "t1_paid") await sponsorMatch(session, r, deps);
};

/**
 * The sponsor's match on tranche 1: the engine has invoiced it through PayPal; the sponsor pays by bank transfer, which
 * LEVee's finance team records on the invoice; then the engine pays the match on to the partners. A failure here never
 * touches what partners already have, so it's reported and the run carries on.
 */
async function sponsorMatch(session: Session, r: Replay, deps: RunDeps) {
  const t1 = session.run.t1!;
  try {
    const invoice = (await r.tranche(1))?.invoices?.find((i) => i.sponsorId === SPONSOR.id);
    if (!invoice || invoice.cents === 0) return;
    if (!invoice.result?.invoiceId) {
      log(session, { tone: "error", title: "The sponsor's invoice wasn't sent", detail: invoice.result?.reason ?? "PayPal didn't answer. The partners' payout isn't affected" });
      return;
    }
    if (!t1.match) {
      t1.match = { sponsor: SPONSOR.businessName, cents: invoice.cents, invoiceId: invoice.result.invoiceId, ...(invoice.result.invoiceNumber && { invoiceNumber: invoice.result.invoiceNumber }) };
      log(session, { tone: "paypal", title: `PayPal invoice sent to ${SPONSOR.businessName} for its ${dollars(invoice.cents)} match`, detail: "It matches donors' early gifts 1:1, up to $25 a storm", ref: invoice.result.invoiceNumber ?? invoice.result.invoiceId });
    }
    if (!t1.match.paid) {
      await deps.payments.recordInvoicePayment?.(invoice.matchKey, invoice.result.invoiceId, usd(invoice.cents));
      t1.match.paid = true;
      log(session, { tone: "person", title: `${SPONSOR.businessName} paid its invoice`, detail: "By bank transfer, recorded on the PayPal invoice" });
    }
    // The engine checks the invoice with PayPal and sends the match on, split the way tranche 1 was.
    if (!t1.match.payout) await r.tick();
    const paid = (await r.tranche(1))?.invoices?.find((i) => i.sponsorId === SPONSOR.id)?.payout;
    if (paid?.result && !t1.match.payout) {
      t1.match.payout = payoutOf(paid.batchKey, paid.result, paid.paidTo, paid.batchKey, await deps.readLedger());
      log(session, { tone: "paypal", title: "Sent the sponsor's match to the partners' PayPal accounts", detail: paid.paidTo.map((p) => `${label(p.partnerId)} ${dollars(p.cents)}`).join(", "), ref: t1.match.payout.batchId });
    }
  } catch (err) {
    log(session, { tone: "error", title: "The sponsor's match didn't finish", detail: `${(err as Error).message}. The partners' payout isn't affected` });
  }
}

async function describeFirst(session: Session, r: Replay, deps: RunDeps, state: TrancheState) {
  const t1 = (session.run.t1 ??= { reserveCents: 0 });
  t1.charge = noteCharge(session, state, r.pledgeId, t1.charge);
  if (state.status === "no_funds") {
    session.run.stage = "done";
    log(session, { tone: "rule", title: "Nothing to send", detail: "No money was collected, so no payout was made" });
    return r.tellMessages();
  }
  if (state.status === "payout_denied") throw new Error(refused(state));
  if (state.status !== "paid" && state.status !== "held_for_review") throw new Error(`Tranche 1 is ${state.status.replaceAll("_", " ")}, so try again shortly`);
  const plan = state.payout!;
  if (t1.poolCents === undefined) {
    t1.reserveCents = plan.reserveCents ?? 0;
    t1.poolCents = plan.poolCents + t1.reserveCents;
    if (t1.reserveCents > 0) log(session, { tone: "rule", title: `Reserve adds ${dollars(t1.reserveCents)}`, detail: "A published share of the balance goes out with tranche 1" });
  }
  t1.payout = payoutOf(plan.batchKey, plan.result, plan.allocations, state.key, await deps.readLedger());
  t1.leadHours ??= Math.round((Date.parse(LANDFALL.confirmedAt) - Date.parse(session.run.clock!)) / 360_000) / 10;
  log(session, { tone: "paypal", title: "Sent to the partners' PayPal accounts before landfall", detail: plan.allocations.map((a) => `${label(a.partnerId)} ${dollars(a.cents)}`).join(", "), ref: t1.payout.batchId });
  session.run.stage = "t1_paid";
  r.tellMessages();
}

async function proof(session: Session, r: Replay) {
  const event = (await r.event())!;
  const t1 = (await r.tranche(1))!;
  await r.levee.confirmLandfall(event.eventKey, LANDFALL);
  session.run.clock = PROOF_AT;
  const results = [];
  for (const { partnerId } of t1.payout!.allocations) results.push(await r.levee.submitProof({ eventKey: event.eventKey, partnerId, photos: [], receipts: [], distribution: [], sample: true }));
  session.run.stage = "proof";
  log(session, { tone: "person", title: "Landfall confirmed by a person", detail: LANDFALL.source });
  for (const result of results) {
    if (result.verdict === "pass") log(session, { tone: "rule", title: `Verifier: ${label(result.partnerId)} passed`, detail: "Its sample receipts and list add up. This is the saved result from the replay" });
    else log(session, { tone: "rule", title: `Verifier: ${label(result.partnerId)} sent to a person`, detail: "One sample photo matches a photo filed after an earlier storm. This is the saved result from the replay" });
  }
}

async function chargeSecond(session: Session, r: Replay, deps: RunDeps) {
  if (!(await r.tranche(2))) await r.tick();
  r.tellMessages();
  if (!(await r.tranche(2))) {
    // Nothing fires without money to send, as with a Reserve-only run.
    if (session.pledge) throw new Error("Tranche 2 didn't open, so try again shortly");
    session.run.t2 = { poolCents: 0, heldCents: 0 };
    session.run.stage = "done";
    return r.tellMessages();
  }
  const state = await settle(session, r, 2);
  const t2 = (session.run.t2 ??= {});
  t2.charge = noteCharge(session, state, r.pledgeId, t2.charge);
  if (state.status === "no_funds") {
    session.run.stage = "done";
    return r.tellMessages();
  }
  if (state.status === "payout_denied") throw new Error(refused(state));
  if (state.status !== "paid" && state.status !== "held_for_review") throw new Error(`Tranche 2 is ${state.status.replaceAll("_", " ")}, so try again shortly`);
  const plan = state.payout!;
  t2.poolCents = plan.poolCents + (plan.reserveCents ?? 0);
  t2.heldCents = (plan.heldForReview ?? []).filter((h) => h.status !== "done").reduce((sum, h) => sum + h.cents, 0);
  if (plan.allocations.length && !t2.payout) {
    t2.payout = payoutOf(plan.batchKey, plan.result, plan.allocations, state.key, await deps.readLedger());
    log(session, { tone: "paypal", title: "PayPal paid the partner whose proof passed", detail: plan.allocations.map((a) => `${label(a.partnerId)} ${dollars(a.cents)}`).join(", "), ref: t2.payout.batchId });
  }
  for (const held of plan.heldForReview ?? []) log(session, { tone: "rule", title: `${dollars(held.cents)} held for ${label(held.partnerId)}`, detail: "Its share stays with LEVee until a person decides" });
  session.run.stage = t2.heldCents > 0 ? "t2_paid" : "done";
  r.tellMessages();
}

async function decide(session: Session, r: Replay, deps: RunDeps, action: "approve" | "reject") {
  const event = (await r.event())!;
  const t2 = session.run.t2!;
  const decision = (t2.decided ??= action);
  const first = !t2.release;
  // Deciding again with the same answer retries the release.
  await r.levee.decideReview(event.eventKey, "partner-b", { decision, by: "You, in the live demo" });
  const state = (await r.tranche(2))!;
  const held = state.payout?.heldForReview?.find((h) => h.partnerId === "partner-b");
  if (first) log(session, { tone: "person", title: decision === "approve" ? "You cleared Partner B" : "You rejected Partner B's proof", detail: decision === "approve" ? "Its held share is released to it" : "Its held share goes to the partner who passed" });
  if (held?.status !== "done") throw new Error(held?.result?.status === "DENIED" ? `PayPal refused this step (${held.result.reason ?? "no reason given"}). Nothing was lost, so you can try again.` : "The held share hasn't been sent yet, so try again shortly");
  if (!held.paidTo?.length) {
    log(session, { tone: "rule", title: "No partner had room for the held share", detail: `${dollars(held.strandedCents ?? held.cents)} stays with LEVee, and is reported` });
  } else {
    t2.release = payoutOf(held.batchKey!, held.result, held.paidTo, held.batchKey!, await deps.readLedger());
    log(session, { tone: "paypal", title: `PayPal paid the held share to ${held.paidTo.map((p) => label(p.partnerId)).join(" and ")}`, detail: held.paidTo.map((p) => `${label(p.partnerId)} ${dollars(p.cents)}`).join(", "), ref: t2.release.batchId });
  }
  session.run.stage = "done";
  r.tellMessages();
}

/** `ai` is only read when triggering the storm: the whole replay then keeps that choice. */
export async function runAction(session: Session, action: Action, deps: RunDeps, ai: AiMode = "saved") {
  const run = session.run;
  run.error = undefined;
  try {
    if (action === "reset") {
      session.run = newRun();
      log(session, { tone: "rule", title: "New replay started", detail: "Your pledge and saved PayPal account stay as they were" });
      return;
    }
    const at = run.stage;
    if (action === "fire" && at === "idle") {
      run.ai = ai;
      run.belowLine = undefined;
    }
    const r = replayFor(session, deps);
    if (action === "fire" && at === "idle") await fire(session, r, deps);
    else if (action === "skip" && at === "notice") {
      if (session.pledge && !(await r.levee.skip((await r.tranche(1))!.key, r.pledgeId))) throw new Error("The skip window has closed");
      run.stage = "skipped";
      log(session, { tone: "person", title: "You skipped this storm", detail: "Nothing was charged, and your pledge stays active" });
    } else if (action === "charge1" && at === "notice") await chargeFirst(session, r, deps);
    else if (action === "proof" && at === "t1_paid") await proof(session, r);
    else if (action === "charge2" && at === "proof") await chargeSecond(session, r, deps);
    else if ((action === "approve" || action === "reject") && at === "t2_paid" && run.t2?.heldCents) await decide(session, r, deps, action);
  } catch (err) {
    session.run.error = (err as Error).message;
    log(session, { tone: "error", title: "That step didn't finish", detail: session.run.error });
  }
}

type ReadPayout = (batchId: string) => Promise<{ status: string; items: string[] }>;

/** Asks PayPal how unfinished batches are doing, and notes when one settles. The same check /run has always made, for when no webhook reaches this server. */
export async function refreshBatches(session: Session, readPayout: ReadPayout) {
  const payouts = [session.run.t1?.payout, session.run.t1?.match?.payout, session.run.t2?.payout, session.run.t2?.release].filter((p): p is Payout => !!p?.batchId);
  for (const payout of payouts) {
    const settled = payout.status === "SUCCESS" && payout.items.every((i) => i.status && i.status !== "PENDING");
    if (settled || payout.status === "DENIED") continue;
    try {
      const batch = await readPayout(payout.batchId!);
      const wasDone = payout.status === "SUCCESS";
      payout.status = batch.status;
      payout.items.forEach((item, i) => (item.status = batch.items[i] ?? item.status));
      if (!wasDone && batch.status === "SUCCESS") log(session, { tone: "paypal", title: "PayPal confirmed the batch", detail: payout.items.map((i) => `${label(i.partner === "a" ? "partner-a" : "partner-b")}: ${i.status ?? "SUCCESS"}`).join(", "), ref: payout.batchId });
    } catch {
      // the next check tries again
    }
  }
}

/** Questions one browser may ask the Narrator: each is a Claude call, so a demo can't run up the bill. */
export const MAX_QUESTIONS = 20;

export type NarratorReply = { text: string; fromClaude: boolean; recordsRead: string[]; refund?: { refunded: boolean; reason: string } };

/**
 * "Where did my $10 go?" about this browser's own run. The Narrator answers from this donor's charges and PayPal's
 * records of them, and any figure it can't source is replaced by a plain summary. If the donor asks for money back,
 * the Policy Engine decides, as everywhere else.
 */
export async function askAboutRun(session: Session, question: string, deps: RunDeps & { reader: PaypalReader }): Promise<NarratorReply> {
  const asked = session.asked ?? 0;
  if (asked >= MAX_QUESTIONS) return { text: `That's the ${MAX_QUESTIONS} questions this demo answers for one browser. Your activity on the left has every charge and payout.`, fromClaude: false, recordsRead: [] };
  session.asked = asked + 1;
  const answer = await replayFor(session, deps, { reader: deps.reader }).levee.askNarrator(session.id, question, true);
  if (answer.refund) log(session, { tone: "rule", title: answer.refund.refunded ? "Policy Engine refunded your charge" : "Policy Engine kept your charge", detail: answer.refund.reason, ...(answer.refund.result?.refundId && { ref: answer.refund.result.refundId }) });
  return { text: answer.text, fromClaude: answer.fromClaude, recordsRead: answer.recordsRead, ...(answer.refund && { refund: { refunded: answer.refund.refunded, reason: answer.refund.reason } }) };
}
