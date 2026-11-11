// One storm as the storm map, responder console and ops screens read it.
import type { ReviewCase } from "../../../policy/src/engine.ts";
import type { LeveeContext } from "../levee.ts";
import type { EventRecord, VerdictRecord } from "./stores.ts";

export function createEvents({ deps, kv, events, trancheOf }: LeveeContext) {
  return {
    // GET /events/:id: what the storm map and responder console read.
    async getEvent(eventKey: string) {
      const event = await kv.get<EventRecord>(`event:${eventKey}`);
      if (!event) return undefined;
      const names = Object.fromEntries((await deps.partners()).map((p) => [p.id, p.name]));
      const allReviews = (await kv.list<ReviewCase>(`review:${eventKey}:`)).map((r) => ({ ...r, partnerName: names[r.partnerId] ?? r.partnerId }));
      return {
        eventKey,
        name: event.eventName,
        brief: event.brief,
        landfall: event.landfall,
        tranches: (await trancheOf(eventKey)).map((s) => ({
          key: s.key,
          tranche: s.tranche,
          status: s.status,
          chargeAt: s.chargeAt,
          poolCents: s.payout?.poolCents,
          reserveCents: s.payout?.reserveCents ?? 0,
          heldCents: s.payout?.heldCents,
          proposal: s.proposal,
          paid: (s.payout?.allocations ?? []).map((a) => ({ partnerId: a.partnerId, partnerName: names[a.partnerId] ?? a.partnerId, cents: a.cents })),
          heldForReview: (s.payout?.heldForReview ?? []).map((h) => ({ partnerId: h.partnerId, partnerName: names[h.partnerId] ?? h.partnerId, cents: h.cents, status: h.status })),
          matches: (s.invoices ?? []).map((i) => ({
            sponsorId: i.sponsorId,
            invoicedCents: i.cents,
            status: i.closed ? "closed" : i.payout?.status === "done" ? "paid_out" : i.payout ? "paying_out" : "awaiting_sponsor",
            payUrl: i.result?.payUrl,
            receivedCents: i.payout?.netCents,
            heldCents: i.payout?.heldCents ?? 0,
            paid: (i.payout?.paidTo ?? []).map((p) => ({ partnerId: p.partnerId, partnerName: names[p.partnerId] ?? p.partnerId, cents: p.cents })),
          })),
        })),
        reviews: allReviews,
      };
    },

    // GET /responder: every storm one partner was considered for, with only its own share, money, proof and review.
    // Other partners' amounts and the ops person who decided stay out of it.
    async partnerEvents(partnerId: string) {
      const out = [];
      for (const event of await events()) {
        const tranches = (await trancheOf(event.eventKey)).filter((s) => s.partners.some((p) => p.id === partnerId) || s.proposal?.some((p) => p.partnerId === partnerId));
        if (!tranches.length) continue;
        const mine = (list: { partnerId: string; cents: number }[] | undefined) => (list ?? []).filter((p) => p.partnerId === partnerId).reduce((sum, p) => sum + p.cents, 0);
        const verdict = await kv.get<VerdictRecord>(`verdict:${event.eventKey}:${partnerId}`);
        const review = await kv.get<ReviewCase>(`review:${event.eventKey}:${partnerId}`);
        const t1 = tranches.find((s) => s.tranche === 1);
        out.push({
          eventKey: event.eventKey,
          name: event.eventName,
          landfall: event.landfall?.confirmedAt ?? null,
          // Proof opens once landfall is confirmed, for a partner that was paid tranche 1 (levee/proofs.ts).
          proofOpen: Boolean(event.landfall && mine(t1?.payout?.allocations) > 0),
          tranches: tranches.map((s) => {
            const share = s.proposal?.find((p) => p.partnerId === partnerId);
            const held = s.payout?.heldForReview ?? [];
            return {
              tranche: s.tranche,
              status: s.status,
              shareBps: share?.shareBps ?? null,
              rationale: share?.rationale ?? null,
              paidCents:
                mine(s.payout?.allocations) +
                mine((s.invoices ?? []).filter((i) => i.payout?.status === "done").flatMap((i) => i.payout!.paidTo)) +
                mine(held.filter((h) => h.status === "done").flatMap((h) => h.paidTo ?? [])),
              heldCents: held.filter((h) => h.partnerId === partnerId && h.status === "awaiting_review").reduce((sum, h) => sum + h.cents, 0),
            };
          }),
          proof: verdict ? { verdict: verdict.result.verdict, summary: verdict.result.summary, checks: verdict.result.checks, concerns: verdict.result.concerns, caveats: verdict.result.caveats } : null,
          review: review ? { status: review.status, verdict: review.verdict, note: review.note ?? null, decidedAt: review.decidedAt ?? null } : null,
        });
      }
      return out;
    },
  };
}
