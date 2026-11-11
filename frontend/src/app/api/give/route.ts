import { randomUUID } from "node:crypto";
import { reserveBalanceCents } from "../../../../../backend/policy/src/rules.ts";
import { log, sessionFor, withStore } from "@/lib/liveStore";
import { captureGiftOrder, createGiftOrder, PayPalRefused, paypalRoute, refundCapture } from "@/lib/paypal";
import { dollars, RULES } from "@/lib/rules";
import { handle, withSetCookies } from "@/server/http";
import { backendStore } from "@/server/levee";
import { refuseResponder } from "@/server/supabaseAuth";

const MIN_CENTS = 500;
const MAX_CENTS = 100_000;
const MAX_GIFTS_PER_BROWSER = 30;

type Body = { action?: "order" | "capture" | "refund"; amount?: number; orderId?: string; giftId?: string };

const usd = (cents: number) => ({ currency_code: "USD", value: (cents / 100).toFixed(2) });

// Gifts join the Reserve through the backend's ledger, which is where the Policy Engine reads its balance from.
const ledger = () => backendStore().ledger;
const reserveCents = async () => reserveBalanceCents(await backendStore().readLedger());

/**
 * Starts, captures or refunds a one-time gift. Amounts come from what this server created and what PayPal reports, never
 * from the browser after the first step. A responder's account can't give (refuseResponder), but can still take back
 * a gift made before it logged in.
 */
export const POST = (request: Request) =>
  handle(async () => {
    const body = (await request.json().catch(() => ({}))) as Body;
    const { cookies } = body.action === "refund" ? { cookies: [] } : await refuseResponder(request);
    return withSetCookies(await gift(body), cookies);
  });

const gift = (body: Body) =>
  paypalRoute(async () => {
    return withStore(async (store) => {
      const session = await sessionFor(store);

      if (body.action === "order") {
        const cents = Math.round(Number(body.amount) * 100);
        if (!Number.isFinite(cents) || cents < MIN_CENTS || cents > MAX_CENTS) return Response.json({ error: `A gift can be ${dollars(MIN_CENTS)} to ${dollars(MAX_CENTS)}` }, { status: 400 });
        if (session.gifts.length >= MAX_GIFTS_PER_BROWSER) return Response.json({ error: "This demo has reached its gift limit for this browser" }, { status: 429 });
        const id = randomUUID();
        const orderId = await createGiftOrder(cents, id);
        session.gifts.unshift({ id, orderId, cents, status: "created", at: new Date().toISOString() });
        return Response.json({ orderId });
      }

      if (body.action === "capture") {
        const gift = session.gifts.find((g) => g.orderId === body.orderId);
        if (!gift) return Response.json({ error: "This gift wasn't started here" }, { status: 404 });
        if (gift.status === "created") {
          try {
            const capture = await captureGiftOrder(gift.orderId);
            if (capture.status !== "COMPLETED") return Response.json({ error: `PayPal says this payment is ${capture.status}, so it hasn't joined the Reserve yet` }, { status: 409 });
            Object.assign(gift, { status: "captured", captureId: capture.captureId, feeCents: capture.feeCents, netCents: capture.netCents, cents: capture.grossCents });
            await ledger().record({ kind: "reserve_credit", ref: `gift:${gift.id}`, paypalId: capture.captureId, status: "CREDITED", amount: usd(capture.grossCents), net: usd(capture.netCents), at: new Date().toISOString() });
            log(session, { tone: "paypal", title: `PayPal took your ${dollars(capture.grossCents)} gift`, detail: `PayPal's fee ${dollars(capture.feeCents)}, so ${dollars(capture.netCents)} joined the Reserve`, ref: capture.captureId });
          } catch (err) {
            if (err instanceof PayPalRefused) return Response.json({ error: `PayPal didn't take this payment (${err.issue}). You weren't charged.` }, { status: 409 });
            throw err;
          }
        }
        return Response.json({ gift, reserveCents: await reserveCents() });
      }

      if (body.action === "refund") {
        const gift = session.gifts.find((g) => g.id === body.giftId);
        if (!gift || gift.status !== "captured" || !gift.captureId) return Response.json({ error: "This gift can't be refunded" }, { status: 400 });
        if ((Date.now() - Date.parse(gift.at)) / 3_600_000 > RULES.refundWindowHours) return Response.json({ error: `Refunds are open for ${RULES.refundWindowHours} hours` }, { status: 409 });
        // Money that has already gone to responders can't come back.
        if ((await reserveCents()) < (gift.netCents ?? 0)) return Response.json({ error: "This gift has already gone out to responders" }, { status: 409 });
        const refund = await refundCapture(gift.captureId);
        Object.assign(gift, { status: "refunded", refundId: refund.refundId });
        await ledger().record({ kind: "reserve_draw", ref: `gift:${gift.id}`, paypalId: refund.refundId, status: "REFUNDED", amount: usd(gift.netCents ?? 0), at: new Date().toISOString() });
        log(session, { tone: "paypal", title: `PayPal refunded your ${dollars(gift.cents)} gift`, detail: `Status ${refund.status}. It has left the Reserve`, ref: refund.refundId });
        return Response.json({ gift, reserveCents: await reserveCents() });
      }

      return Response.json({ error: "unknown_action" }, { status: 400 });
    });
  });
