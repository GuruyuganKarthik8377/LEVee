// What only ops may do: confirm landfall, decide reviews, and approve a tranche over the limit. The server checks who is ops.
import type { LeveeContext } from "../levee.ts";
import { LeveeError } from "./errors.ts";
import type { EventRecord } from "./stores.ts";

export function createOps({ kv, engine }: LeveeContext, advance: (event: EventRecord, actions: string[]) => Promise<void>) {
  return {
    // Ops: landfall can't be read from GDACS's tracks, so a person confirms it from an official bulletin.
    async confirmLandfall(eventKey: string, landfall: { confirmedAt: string; source: string }) {
      const event = await kv.get<EventRecord>(`event:${eventKey}`);
      if (!event) throw new LeveeError(`No event ${eventKey}`);
      if (!landfall.source.trim()) throw new LeveeError("Landfall needs a source");
      await kv.set(`event:${eventKey}`, { ...event, landfall });
    },

    listOpenReviews: () => engine.listOpenReviews(),

    // A person's decision. Tranche 2 may be waiting on it, so this moves things along at once.
    async decideReview(eventKey: string, partnerId: string, decision: { decision: "approve" | "reject"; by: string; note?: string }) {
      const result = await engine.decideReview(eventKey, partnerId, decision);
      const event = await kv.get<EventRecord>(`event:${eventKey}`);
      const actions: string[] = [];
      if (event) await advance(event, actions);
      return { ...result, actions };
    },

    // One click from ops for a tranche over the limit.
    approveTranche: (trancheKey: string, by: string) => engine.approve(trancheKey, by),
  };
}
