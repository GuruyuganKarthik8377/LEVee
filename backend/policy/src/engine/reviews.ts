// The ops review desk: open cases to list, and a person's final decision, after which held money moves at once.
import type { ReviewCase, TrancheState } from "../engine.ts";
import type { EngineContext } from "./context.ts";
import type { createHeldShares } from "./held.ts";
import type { createMatches } from "./matches.ts";

export function createReviews({ store, reviews, at, record, reviewKey }: EngineContext, held: ReturnType<typeof createHeldShares>, matches: ReturnType<typeof createMatches>) {
  return {
    // What the ops screen lists.
    listOpenReviews: () => reviews.listOpen(),

    // A person's decision on a flagged partner. It can't be changed afterwards, because the money follows it.
    // Whether this person may decide is the caller's job: only ops may reach this.
    async decideReview(eventKey: string, partnerId: string, args: { decision: "approve" | "reject"; by: string; note?: string }): Promise<{ review: ReviewCase; state?: TrancheState }> {
      if (!args.by.trim()) throw new Error("A review needs the name of the person deciding");
      const review = await reviews.get(reviewKey(eventKey, partnerId));
      if (!review) throw new Error(`No review open for ${partnerId} on ${eventKey}`);
      const status = args.decision === "approve" ? "approved" : "rejected";
      if (review.status !== "open" && review.status !== status) throw new Error(`This review was already ${review.status} by ${review.decidedBy}`);
      if (review.status === "open") {
        review.status = status;
        review.decidedBy = args.by;
        review.decidedAt = at();
        if (args.note) review.note = args.note;
        await reviews.save(review);
        await record(`${eventKey}:t2`, "review_decided", { detail: { partnerId, decision: status, by: args.by, note: args.note } });
      }
      const state = await store.get(`${eventKey}:t2`);
      if (state?.payout) {
        await held.settleHeld(state);
        if (state.status === "paid") {
          await matches.invoiceSponsors(state);
          await matches.payMatches(state);
        }
      }
      return { review, ...(state && { state }) };
    },
  };
}
