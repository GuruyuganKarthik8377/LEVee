// Refunds: the only way money goes back to a donor.
import type { RefundResult } from "../../../payments/src/types.ts";
import type { EngineContext } from "./context.ts";

export function createRefunds({ payments, store, playbook, now, record }: EngineContext) {
  return {
    // A donor's refund request, which the Narrator can only propose. Fixed rules decide, and only this moves the money back.
    async refundCharge(trancheKey: string, pledgeId: string, donorId: string): Promise<{ refunded: boolean; reason: string; result?: RefundResult }> {
      const state = await store.get(trancheKey);
      const item = state?.items.find((i) => i.pledgeId === pledgeId);
      const refuse = async (reason: string) => {
        await record(trancheKey, "refund_refused", { detail: { pledgeId, reason } });
        return { refunded: false, reason };
      };
      if (!state || !item) return refuse("no such charge");
      if (item.donorId !== donorId) return refuse("this charge belongs to another donor");
      if (item.refund?.status === "COMPLETED" || item.refund?.status === "PENDING") return { refunded: true, reason: "already refunded", result: item.refund };
      if (item.result?.status !== "COMPLETED" || !item.result.captureId) return refuse("nothing was charged");
      const hours = (now().getTime() - new Date(item.firstAttemptAt!).getTime()) / 3_600_000;
      if (hours > playbook.refundWindowHours) return refuse(`outside the ${playbook.refundWindowHours} hour review window`);
      // Whole-charge refund: a retry returns the same refund, and PayPal refuses a second one.
      const result = await payments.refund(item.result.captureId);
      item.refund = result;
      await store.save(state);
      await record(trancheKey, "refund_result", { detail: { pledgeId, ...result } });
      return { refunded: result.status !== "FAILED", reason: result.reason ?? "within the review window", result };
    },
  };
}
