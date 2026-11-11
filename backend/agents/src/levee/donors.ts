// What each donor hears and sees: receipts, stories, their activity, the Narrator's answers, their skip, and the Reserve.
import type { TrancheState } from "../../../policy/src/engine.ts";
import { reserveBalanceCents, toMoney } from "../../../policy/src/rules.ts";
import type { LeveeContext } from "../levee.ts";
import { donorActivity, donorReserve, type DonorCharge } from "../narrator/activity.ts";
import { answerDonor, writeStory, type DonorAnswer, type PartnerWork } from "../narrator/agent.ts";
import { writeReceipt } from "../narrator/messages.ts";
import type { EventRecord } from "./stores.ts";

export function createDonors({ deps, kv, payments, playbook, reviews, cache, languageOf, engine, events, trancheOf, verdictsFor }: LeveeContext) {
  async function tellDonors(event: EventRecord, state: TrancheState, actions: string[]) {
    const names = Object.fromEntries((await deps.partners()).map((p) => [p.id, p.name]));
    const rows = await deps.readLedger();
    for (const donorId of new Set(state.items.map((i) => i.donorId))) {
      for (const charge of donorActivity(donorId, [state], names, rows)) {
        // By status, so a charge PayPal was still deciding on gets its real receipt once it completes.
        const key = `sent:receipt:${state.key}:${charge.pledgeId}:${charge.status}`;
        if (await kv.get(key)) continue;
        const message = await writeReceipt(charge, donorId, await languageOf(donorId), cache, deps.client);
        if (!message) continue;
        try {
          await deps.deliver(message);
          await kv.set(key, true);
          actions.push(`receipt to ${donorId}`);
        } catch (err) {
          actions.push(`receipt to ${donorId} failed, will retry: ${(err as Error).message}`);
        }
      }
    }
    if (state.tranche === 2 && state.status === "paid") await tellStories(event, actions);
  }

  // Runs when tranche 2 pays, as that's when there is verified work to describe.
  async function tellStories(event: EventRecord, actions: string[]) {
    const all = await trancheOf(event.eventKey);
    const first = all.find((s) => s.tranche === 1);
    const earliest = first?.items.map((i) => i.firstAttemptAt).filter((t): t is string => !!t).sort()[0];
    const lead = earliest && event.landfall ? { hoursBeforeLandfall: Math.round((new Date(event.landfall.confirmedAt).getTime() - new Date(earliest).getTime()) / 360_000) / 10 } : undefined;
    const partners = await deps.partners();
    const records = await verdictsFor(event.eventKey);
    const work: PartnerWork[] = [];
    for (const p of partners) {
      const record = records.find((r) => r.partnerId === p.id);
      const review = await reviews.get(`${event.eventKey}:${p.id}`);
      if (review?.status === "rejected") continue;
      const passed = record?.result.verdict === "pass" || review?.status === "approved";
      work.push({ partnerName: p.name, area: p.area.name, verdict: passed ? "pass" : "human", delivered: record?.delivered ?? [] });
    }
    const names = Object.fromEntries(partners.map((p) => [p.id, p.name]));
    const rows = await deps.readLedger();
    for (const donorId of new Set(all.flatMap((s) => s.items.map((i) => i.donorId)))) {
      const key = `sent:story:${event.eventKey}:${donorId}`;
      if (await kv.get(key)) continue;
      const language = await languageOf(donorId);
      const story = await writeStory({ charges: donorActivity(donorId, all, names, rows), work, language, ...(lead && { lead }), cache, ...(deps.client && { client: deps.client }) });
      if (!story) continue;
      await deps.audit(story.audit);
      try {
        await deps.deliver({ kind: "story", donorId, language: story.language, text: story.text, english: story.text, translated: false });
        await kv.set(key, true);
        actions.push(`story to ${donorId}`);
      } catch (err) {
        actions.push(`story to ${donorId} failed, will retry: ${(err as Error).message}`);
      }
    }
  }

  return {
    tellDonors,

    skip: (trancheKey: string, pledgeId: string) => engine.skip(trancheKey, pledgeId),

    // GET /donors/:id/activity
    async donorActivity(donorId: string): Promise<DonorCharge[]> {
      const names = Object.fromEntries((await deps.partners()).map((p) => [p.id, p.name]));
      const states = (await Promise.all((await events()).map((e) => trancheOf(e.eventKey)))).flat();
      return donorActivity(donorId, states, names, await deps.readLedger());
    },

    // "Where did my $10 go?" A refund request only happens if the engine's rules allow it.
    async askNarrator(donorId: string, question: string, replay = false): Promise<DonorAnswer & { refund?: Awaited<ReturnType<typeof engine.refundCharge>> }> {
      const names = Object.fromEntries((await deps.partners()).map((p) => [p.id, p.name]));
      const states = (await Promise.all((await events()).map((e) => trancheOf(e.eventKey)))).flat();
      const charges = donorActivity(donorId, states, names, await deps.readLedger());
      const reserve = donorReserve(donorId, states, await deps.readLedger());
      const answer = await answerDonor({ question, charges, ...(reserve && { reserve }), reader: deps.reader, replay, ...(deps.client && { client: deps.client }) });
      await deps.audit(answer.audit);
      if (!answer.refundRequest) return answer;
      const refund = await engine.refundCharge(answer.refundRequest.trancheKey, answer.refundRequest.pledgeId, donorId);
      return { ...answer, refund };
    },

    // Stops a donor's monthly gift. Gifts already made stay in the pool. False if they have nothing running.
    async cancelReserve(donorId: string): Promise<boolean> {
      const rows = (await deps.readLedger()).filter((r) => r.kind === "subscription" && r.ref === donorId);
      const running = rows.at(-1);
      if (!running || ["CANCELLED", "EXPIRED"].includes(running.status)) return false;
      await payments.cancelReserveSubscription(running.paypalId, "Cancelled by the donor");
      return true;
    },

    reserveBalance: async () => toMoney(reserveBalanceCents(await deps.readLedger()), playbook.currency),
  };
}
