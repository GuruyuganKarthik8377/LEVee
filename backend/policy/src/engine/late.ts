// Late captures: money that arrived after its tranche had already paid out.
import type { TrancheState } from "../engine.ts";
import type { EngineContext } from "./context.ts";

export function createLateCharges({ ledger, store, readLedger, at, money, record }: EngineContext) {
  // A capture PayPal was still deciding on when the payout went out. Its money can't catch that payout, so it joins the Reserve.
  async function settleLateCharges(state: TrancheState) {
    const waiting = state.items.filter((i) => i.result?.status === "PENDING" && i.result.captureId);
    if (waiting.length === 0) return;
    const rows = await readLedger();
    for (const item of waiting) {
      const latest = rows.filter((r) => r.kind === "charge" && r.paypalId === item.result!.captureId && (r.status === "COMPLETED" || r.status === "DECLINED")).at(-1);
      if (!latest) continue;
      if (latest.status === "DECLINED") {
        item.result = { ...item.result!, status: "DECLINED", ...(latest.reason && { reason: latest.reason }) };
      } else {
        const net = latest.net ?? latest.amount ?? money(item.cents);
        item.result = { ...item.result!, status: "COMPLETED", net };
        item.joinedReserve = true;
        await ledger.record({ kind: "reserve_credit", ref: state.key, paypalId: item.result.captureId!, status: "CREDITED", amount: net, at: at() });
      }
      if (state.payout) state.payout.pendingCents -= item.cents;
      await store.save(state);
      await record(state.key, latest.status === "DECLINED" ? "late_charge_declined" : "late_charge_joined_reserve", { detail: { pledgeId: item.pledgeId, captureId: item.result!.captureId } });
    }
  }

  return { settleLateCharges };
}
