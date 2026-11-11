// Charging each donor once the skip window has closed, with a retry limit inside PayPal's 6-hour key memory.
import type { TrancheState } from "../engine.ts";
import type { EngineContext } from "./context.ts";

// PayPal keeps a chargeKey for 6 hours. Past this margin a retry could charge the donor twice, so a person checks instead.
const CHARGE_RETRY_LIMIT_MS = 5 * 3_600_000;

export function createCharges({ payments, store, now, at, money, record }: EngineContext) {
  // True once every charge has a known outcome, so paying can start. False means stop here: the state is already saved.
  async function chargeDue(state: TrancheState, trancheKey: string): Promise<boolean> {
    for (const item of state.items) {
      if (item.result || item.notCharged) continue;
      if (item.firstAttemptAt && now().getTime() - new Date(item.firstAttemptAt).getTime() > CHARGE_RETRY_LIMIT_MS) {
        state.status = "needs_review";
        await store.save(state);
        await record(trancheKey, "charge_needs_review", { detail: { pledgeId: item.pledgeId, chargeKey: item.chargeKey } });
        return false;
      }
      // Saved before calling PayPal, so the retry limit holds even if this process dies mid-charge.
      item.firstAttemptAt ??= at();
      await store.save(state);
      try {
        item.result = await payments.chargePledge({ pledgeId: item.pledgeId, chargeKey: item.chargeKey, paymentTokenId: item.paymentTokenId, amount: money(item.cents) });
        await store.save(state);
        await record(trancheKey, "charge_result", { detail: { pledgeId: item.pledgeId, cents: item.cents, ...item.result } });
      } catch (err) {
        await record(trancheKey, "charge_outcome_unknown", { detail: { pledgeId: item.pledgeId, error: (err as Error).message } });
      }
    }
    if (state.items.some((i) => !i.result && !i.notCharged)) {
      await store.save(state);
      return false;
    }
    return true;
  }

  return { chargeDue };
}
