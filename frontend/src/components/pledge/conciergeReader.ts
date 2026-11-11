import type { Pledge } from "./PledgeCard";
import { readPledge, type Reading } from "./readPledge.ts";

type Turn = { role: "user" | "assistant"; content: string };
/** The parts of the backend's DraftResult this page uses. */
type Draft = {
  status: "ready" | "needs_info" | "refused";
  reply: string;
  policy?: { amountPerEvent: { value: string }; annualCap: { value: string }; preference: Pledge["timing"] };
};

const ask = (turns: Turn[]) => fetch("/api/pledges/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turns }) });

/**
 * Reads the donor's words with the Concierge agent on the backend, which keeps no state, so this keeps the conversation.
 * When the route can't answer, for example with no Anthropic key, the browser reader answers instead, as it always has.
 */
export function conciergeReader(post: (turns: Turn[]) => Promise<Response> = ask) {
  let turns: Turn[] = [];
  return {
    async read(text: string, current: Pledge | null): Promise<Reading> {
      const asked: Turn[] = [...turns, { role: "user", content: text }];
      const draft = await post(asked)
        .then((res) => (res.ok ? (res.json() as Promise<Draft>) : null))
        .catch(() => null);
      if (!draft) return readPledge(text, current);
      // The Concierge asks the caller to drop a refused message, so it is never sent again.
      if (draft.status !== "refused") turns = [...asked, { role: "assistant", content: draft.reply }];
      if (draft.status !== "ready" || !draft.policy) return { kind: "reply", message: draft.reply };
      const { amountPerEvent, annualCap, preference } = draft.policy;
      // The Concierge only accepts Gulf Coast hurricanes, so the card keeps the browser's wording for those.
      return {
        kind: "pledge",
        pledge: { hazards: ["Hurricanes"], regions: ["US Gulf Coast"], amount: Number(amountPerEvent.value), cap: Number(annualCap.value), timing: preference },
        assumed: [],
        heard: [draft.reply],
      };
    },
    reset() {
      turns = [];
    },
  };
}
