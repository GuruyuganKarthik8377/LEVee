// Sponsors' matching gifts: an invoice once a payout is accepted, then a payout of what each sponsor really paid.
import type { TrancheState } from "../engine.ts";
import type { PayoutResult } from "../../../payments/src/types.ts";
import { matchCents, planTopUp, toCents } from "../rules.ts";
import type { EngineContext } from "./context.ts";

export function createMatches({ payments, store, reviews, playbook, money, record, reviewKey, sendBatch }: EngineContext) {
  // Runs after a payout is accepted. A failed invoice never touches the payout: it is reported, and the next run tries again.
  async function invoiceSponsors(state: TrancheState) {
    if (!state.sponsors?.length || !state.payout) return;
    state.invoices ??= state.sponsors.map((s) => ({ sponsorId: s.id, matchKey: `${state.key}:${s.id}`, cents: matchCents(state.payout!.poolCents, s.matchBps, s.maxCentsPerTranche) }));
    for (const invoice of state.invoices) {
      if (invoice.result?.status === "SENT" || invoice.result?.status === "PAID" || invoice.cents === 0) continue;
      const sponsor = state.sponsors.find((s) => s.id === invoice.sponsorId)!;
      try {
        invoice.result = await payments.invoiceMatch({
          matchKey: invoice.matchKey,
          sponsor: { email: sponsor.email, businessName: sponsor.businessName },
          amount: money(invoice.cents),
          description: `Matching gift for ${state.eventName}, tranche ${state.tranche}`,
        });
        await store.save(state);
        await record(state.key, "match_invoice", { detail: { ...invoice } });
      } catch (err) {
        await record(state.key, "match_invoice_outcome_unknown", { detail: { sponsorId: invoice.sponsorId, error: (err as Error).message } });
      }
    }
    await store.save(state);
  }

  // Pays out what sponsors have really paid. Safe to run again: each payout's batch key and amounts are fixed before sending.
  async function payMatches(state: TrancheState) {
    const plan = state.payout;
    if (!plan || !state.invoices?.length) return;
    // Someone still under review may turn out not to deserve this money, so it waits for the decision.
    if (plan.heldForReview?.some((h) => h.status !== "done")) return;
    const rejected = new Set<string>();
    for (const a of plan.allocations) {
      const review = await reviews.get(reviewKey(state.eventKey, a.partnerId));
      if (review?.status === "open") return;
      if (review?.status === "rejected") rejected.add(a.partnerId);
    }

    for (const invoice of state.invoices) {
      if (invoice.closed || invoice.payout?.status === "done" || !invoice.result?.invoiceId) continue;
      if (!invoice.payout) {
        let paid;
        try {
          paid = await payments.checkInvoice(invoice.matchKey, invoice.result.invoiceId);
        } catch (err) {
          await record(state.key, "match_check_failed", { detail: { sponsorId: invoice.sponsorId, error: (err as Error).message } });
          continue;
        }
        if (paid.status === "CLOSED") {
          invoice.closed = true;
          await store.save(state);
          await record(state.key, "match_closed_unpaid", { detail: { sponsorId: invoice.sponsorId } });
          continue;
        }
        if (paid.status !== "PAID") continue;
        const netCents = toCents(paid.net ?? money(invoice.cents));
        const alreadyFor = (partnerId: string) =>
          (plan.allocations.find((a) => a.partnerId === partnerId)?.cents ?? 0) + state.invoices!.flatMap((i) => i.payout?.paidTo ?? []).filter((p) => p.partnerId === partnerId).reduce((sum, p) => sum + p.cents, 0);
        const shares = plan.allocations
          .filter((a) => !rejected.has(a.partnerId))
          .map((a) => ({ partner: state.partners.find((p) => p.id === a.partnerId)!, weightCents: a.cents, alreadyCents: alreadyFor(a.partnerId) }));
        const { paidTo, heldCents } = planTopUp(netCents, shares, playbook);
        invoice.payout = { status: "sending", netCents, batchKey: `${state.key}:match:${invoice.sponsorId}`, paidTo, heldCents };
        await store.save(state);
      }
      const payout = invoice.payout;
      if (payout.paidTo.length === 0) {
        payout.status = "done";
        await store.save(state);
        await record(state.key, "match_held", { detail: { sponsorId: invoice.sponsorId, heldCents: payout.heldCents } });
        continue;
      }
      let result: PayoutResult;
      try {
        result = await sendBatch(state, payout.batchKey, payout.paidTo);
      } catch (err) {
        await record(state.key, "match_payout_outcome_unknown", { detail: { sponsorId: invoice.sponsorId, error: (err as Error).message } });
        continue;
      }
      payout.result = result;
      if (result.status === "DENIED") {
        await store.save(state);
        await record(state.key, "match_payout_denied", { detail: { sponsorId: invoice.sponsorId, reason: result.reason } });
        continue;
      }
      payout.status = "done";
      await store.save(state);
      await record(state.key, "match_paid_out", { detail: { sponsorId: invoice.sponsorId, netCents: payout.netCents, paidTo: payout.paidTo, heldCents: payout.heldCents, batch: result.payoutBatchId } });
    }
  }

  return { invoiceSponsors, payMatches };
}
