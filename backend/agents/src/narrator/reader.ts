// Read-only PayPal lookups through the Agent Toolkit. Only whitelisted fields come back: raw records hold account ids and payer details.
import { paypalToolsFor } from "../../../payments/src/agent-tools.ts";

export type ChargeRecord = { source: "paypal_transactions" | "paypal_order"; id: string; status: string; amount?: unknown; fee?: unknown; net?: unknown; at?: string };
export type RefundRecord = { id: string; status: string; amount?: unknown; at?: string };
export type PaypalReader = {
  charge(captureId: string, orderId?: string): Promise<ChargeRecord | null>;
  refund(refundId: string): Promise<RefundRecord | null>;
};

export function toolkitReader(credentials: { clientId: string; clientSecret: string }): PaypalReader {
  const tools = paypalToolsFor("narrator", credentials);
  return readerFrom(async (name, args) => {
    const result = await tools[name].execute!(args, { toolCallId: name, messages: [] });
    return typeof result === "string" ? JSON.parse(result) : result;
  });
}

export function readerFrom(call: (name: string, args: object) => Promise<any>): PaypalReader {
  return {
    async charge(captureId, orderId) {
      const search = await call("list_transactions", { transaction_id: captureId });
      const info = search.transaction_details?.[0]?.transaction_info;
      if (info) return { source: "paypal_transactions", id: info.transaction_id, status: info.transaction_status === "S" ? "COMPLETED" : info.transaction_status, amount: info.transaction_amount, fee: info.fee_amount, at: info.transaction_initiation_date };
      // PayPal's transaction search lags by hours (seen live: a capture from that morning "not found"), and that doesn't mean the money is missing.
      if (!orderId) return null;
      const order = await call("get_order", { id: orderId });
      const capture = order.purchase_units?.[0]?.payments?.captures?.find((c: any) => c.id === captureId);
      if (!capture) return null;
      const breakdown = capture.seller_receivable_breakdown;
      return { source: "paypal_order", id: capture.id, status: capture.status, amount: capture.amount, fee: breakdown?.paypal_fee, net: breakdown?.net_amount, at: capture.create_time };
    },
    async refund(refundId) {
      const r = await call("get_refund", { refund_id: refundId });
      return r?.id ? { id: r.id, status: r.status, amount: r.amount, at: r.create_time } : null;
    },
  };
}
