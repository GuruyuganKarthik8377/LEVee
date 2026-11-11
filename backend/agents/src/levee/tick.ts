// The hourly job: assess new advisories, fire tranche 1, then move every storm along, tranche 2 included.
import type { Partner } from "../../../policy/src/playbook.ts";
import type { ReviewCase } from "../../../policy/src/engine.ts";
import { checkTranche1 } from "../../../policy/src/rules.ts";
import type { LeveeContext, LeveePartner, TickReport } from "../levee.ts";
import type { ThreatBrief } from "../sentinel/agent.ts";
import type { Snapshot } from "../sentinel/feeds.ts";
import { computeSignals } from "../sentinel/signals.ts";
import type { createDonors } from "./donors.ts";
import type { EventRecord } from "./stores.ts";

export function createTick({ deps, kv, playbook, now, store, reviews, engine, assess, allocate, pledges, events, trancheOf, verdictsFor }: LeveeContext, { tellDonors }: ReturnType<typeof createDonors>) {
  const eventKeyOf = (snapshot: Snapshot) => (snapshot.mode === "replay" ? `replay-${deps.replayRunId ?? "demo"}-${snapshot.event.id}` : `gdacs-${snapshot.event.id}`);

  // What other storms already ask of each partner, so one partner isn't promised more than its plan can use.
  async function withCommitments(eventKey: string, partners: LeveePartner[]): Promise<LeveePartner[]> {
    const committed = new Map<string, number>();
    for (const event of await events()) {
      if (event.eventKey === eventKey) continue;
      for (const state of await trancheOf(event.eventKey)) {
        for (const a of [...(state.payout?.allocations ?? []), ...(state.invoices ?? []).flatMap((i) => i.payout?.paidTo ?? [])]) committed.set(a.partnerId, (committed.get(a.partnerId) ?? 0) + a.cents);
      }
    }
    return partners.map((p) => ({ ...p, committedUsd: p.committedUsd + (committed.get(p.id) ?? 0) / 100 }));
  }
  const forEngine = (partners: LeveePartner[]): Partner[] => partners.map((p) => ({ id: p.id, email: p.email, capacityCents: Math.max(Math.round((p.capacityUsd - p.committedUsd) * 100), 0) }));

  async function fireTranche1(event: EventRecord, otherActive: ThreatBrief[]) {
    const partners = await withCommitments(event.eventKey, await deps.partners());
    const ready = checkTranche1(event.brief, playbook, now()).every((c) => c.passed) && !(await store.get(`${event.eventKey}:t1`));
    // The Allocator is only paid for when money is really about to move.
    const allocation = ready ? await allocate({ brief: event.brief, partners, otherActive, tranche: 1 }) : undefined;
    if (allocation) await deps.audit(allocation.audit);
    const excluded = new Set(allocation?.excluded.map((e) => e.partnerId));
    return engine.evaluateTranche1({
      eventKey: event.eventKey,
      brief: event.brief,
      pledges: await pledges(),
      partners: forEngine(partners.filter((p) => !excluded.has(p.id))),
      ...(allocation?.proposal && { proposal: allocation.proposal }),
      ...(deps.sponsors && { sponsors: await deps.sponsors() }),
    });
  }

  async function maybeFireTranche2(event: EventRecord, actions: string[]) {
    if (!event.landfall || (await store.get(`${event.eventKey}:t2`))) return;
    if ((await store.get(`${event.eventKey}:t1`))?.status !== "paid") return;
    const partners = await withCommitments(event.eventKey, await deps.partners());
    const records = await verdictsFor(event.eventKey);
    const allIn = partners.every((p) => records.some((r) => r.partnerId === p.id));
    const hoursSince = (now().getTime() - new Date(event.landfall.confirmedAt).getTime()) / 3_600_000;
    if (!allIn && hoursSince < playbook.proofDeadlineHours) return;

    // A partner a person rejected can't be proposed. Any flagged partner's proposed share is held by the engine, not paid.
    const open = new Map<string, ReviewCase | undefined>();
    for (const p of partners) open.set(p.id, await reviews.get(`${event.eventKey}:${p.id}`));
    const eligible = partners.filter((p) => open.get(p.id)?.status !== "rejected");
    const passedOne = eligible.some((p) => open.get(p.id)?.status === "approved" || records.find((r) => r.partnerId === p.id)?.result.verdict === "pass");
    const allocation = passedOne ? await allocate({ brief: event.brief, partners: eligible, otherActive: [], tranche: 2 }) : undefined;
    if (allocation) await deps.audit(allocation.audit);

    const decision = await engine.evaluateTranche2({
      eventKey: event.eventKey,
      eventName: event.eventName,
      landfall: event.landfall,
      verdicts: records.map((r) => ({ partnerId: r.partnerId, verdict: r.result.verdict, summary: r.result.summary, failedChecks: r.result.checks.filter((c) => !c.passed).map((c) => `${c.rule}: ${c.actual}`) })),
      pledges: await pledges(),
      partners: forEngine(eligible),
      ...(allocation?.proposal && { proposal: allocation.proposal }),
      ...(deps.sponsors && { sponsors: await deps.sponsors() }),
    });
    actions.push(decision.fired ? "tranche 2 fired" : `tranche 2 waiting: ${decision.reason}`);
  }

  async function advance(event: EventRecord, actions: string[]) {
    await maybeFireTranche2(event, actions);
    for (const state of await trancheOf(event.eventKey)) {
      const before = state.status;
      const after = await engine.execute(state.key);
      if (after.status !== before) actions.push(`${state.key} ${before} -> ${after.status}`);
      await tellDonors(event, after, actions);
    }
  }

  return {
    advance,

    // The hourly job. One storm's failure doesn't stop another's, and running it twice moves nothing twice.
    // shortcut: assumes one tick at a time, since two overlapping ones would pay for the same LLM calls (money stays safe, through the engine's keys). Take a lock if ticks can overlap.
    async tick(): Promise<TickReport[]> {
      const report = new Map<string, TickReport>();
      const line = (eventKey: string) => report.get(eventKey) ?? (report.set(eventKey, { eventKey, actions: [] }), report.get(eventKey)!);
      const assessed: EventRecord[] = [];

      for (const snapshot of await deps.snapshots()) {
        const eventKey = eventKeyOf(snapshot);
        const r = line(eventKey);
        try {
          const signals = computeSignals(snapshot);
          // No Levee coast in its path means nothing can trigger.
          if (!signals.landfall) {
            r.actions.push("no Levee coast in its path, no LLM call");
            continue;
          }
          const known = await kv.get<EventRecord>(`event:${eventKey}`);
          const latest = snapshot.advisories.at(-1)!.id;
          const ageHours = known ? (now().getTime() - new Date(known.assessedAt).getTime()) / 3_600_000 : Infinity;
          // An old brief only needs replacing while tranche 1 still depends on it, and nothing needs assessing after landfall.
          const fired = !!(await store.get(`${eventKey}:t1`));
          if (known?.landfall || (known?.advisoryId === latest && (fired || ageHours < playbook.tranche1.maxBriefAgeHours))) {
            r.actions.push("nothing new to assess, no LLM call");
            continue;
          }
          const { brief, audit } = await assess(snapshot);
          if (audit) await deps.audit(audit);
          const event: EventRecord = { ...known, eventKey, eventName: brief.eventName, advisoryId: latest, assessedAt: now().toISOString(), brief };
          await kv.set(`event:${eventKey}`, event);
          assessed.push(event);
          r.actions.push(`assessed: confidence ${brief.confidence}`);
        } catch (err) {
          r.error = (err as Error).message;
        }
      }

      const retries = (await events()).filter((e) => e.fireFailed && !assessed.some((a) => a.eventKey === e.eventKey));
      for (const event of [...assessed, ...retries]) {
        const r = line(event.eventKey);
        try {
          const others = assessed.filter((e) => e.eventKey !== event.eventKey).map((e) => e.brief);
          const decision = await fireTranche1(event, others);
          if (event.fireFailed) await kv.set(`event:${event.eventKey}`, { ...event, fireFailed: false });
          r.actions.push(decision.fired ? "tranche 1 fired" : `tranche 1 not fired: ${decision.reason}`);
        } catch (err) {
          r.error = (err as Error).message;
          await kv.set(`event:${event.eventKey}`, { ...event, fireFailed: true });
        }
      }

      for (const event of await events()) {
        const r = line(event.eventKey);
        try {
          await advance(event, r.actions);
        } catch (err) {
          r.error = (err as Error).message;
        }
      }
      return [...report.values()];
    },
  };
}
