// A donor's pledge: the Concierge's chat, the confirmed card, and saving their PayPal account once PayPal sends them back.
import type { Pledge } from "../../../policy/src/playbook.ts";
import { completePledge as finishVault, draftPledge, openVault, type DraftResult, type Turn } from "../concierge/agent.ts";
import type { PledgePolicy } from "../concierge/policy.ts";
import type { LeveeContext } from "../levee.ts";
import { LeveeError } from "./errors.ts";
import type { PendingVault } from "./stores.ts";

export function createPledges({ deps, kv, payments }: LeveeContext) {
  return {
    // POST /pledges: one chat turn. The caller keeps the turns, and drops the last one on "refused".
    async pledgeChat(turns: Turn[]): Promise<DraftResult> {
      const draft = await draftPledge(turns, deps.client);
      if (draft.audit) await deps.audit(draft.audit);
      return draft;
    },

    // The donor tapped confirm on the card. Returns PayPal's approval pages.
    async confirmPledge(args: { donorId: string; policy: PledgePolicy; confirmedHash: string; language?: string }) {
      const vault = await openVault({ donorId: args.donorId, policy: args.policy, confirmedHash: args.confirmedHash, payments });
      const pending: PendingVault = { donorId: args.donorId, policy: args.policy, confirmedHash: args.confirmedHash, language: args.language ?? "en" };
      await kv.set(`vault:${vault.setupTokenId}`, pending);
      return vault;
    },

    // PayPal sent the donor back. The terms come from what was confirmed, not from this request.
    async completePledge(setupTokenId: string): Promise<Pledge> {
      const pending = await kv.get<PendingVault>(`vault:${setupTokenId}`);
      if (!pending) throw new LeveeError("No confirmed pledge for this PayPal approval");
      const already = await kv.get<Pledge>(`vault-done:${setupTokenId}`);
      if (already) return already;
      const pledge = await finishVault({ donorId: pending.donorId, policy: pending.policy, confirmedHash: pending.confirmedHash, setupTokenId, payments });
      await kv.set(`pledge:${pledge.id}`, pledge);
      await kv.set(`vault-done:${setupTokenId}`, pledge);
      await kv.set(`language:${pending.donorId}`, pending.language);
      return pledge;
    },
  };
}
