"use client";

import { createElement, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Card, Label, Pill } from "@/components/app/ui";
import { loadPayPalSdk } from "@/components/pledge/PayPalSaveButton";
import { logOut, useAccount } from "@/lib/account";
import { dollars, RULES } from "@/lib/rules";

const QUICK = [10, 25, 50, 100];
const MIN = 5;
const MAX = 1000;

type Gift = { id: string; cents: number; status: string; captureId?: string; feeCents?: number; netCents?: number; at: string };

export default function GiveNow() {
  const [amount, setAmount] = useState("25");
  const [mode, setMode] = useState<"checking" | "live" | "off">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [reserveCents, setReserveCents] = useState<number | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // A responder's account doesn't give: its money would go into the Reserve that pays it. The server refuses it too.
  const responder = useAccount()?.role === "responder";
  const button = useRef<HTMLElement>(null);
  const latest = useRef(amount);
  latest.current = amount;

  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= MIN && value <= MAX;

  const refresh = async () => {
    const res = await fetch("/api/live");
    if (!res.ok) return;
    const data = (await res.json()) as { reserveCents: number; gifts: Gift[] };
    setReserveCents(data.reserveCents);
    setGifts(data.gifts);
  };

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    void refresh();

    async function connect() {
      const res = await fetch("/api/paypal/client-token");
      if (!res.ok) throw new Error("not available");
      const { clientToken } = (await res.json()) as { clientToken: string };
      await loadPayPalSdk();
      const sdk = await window.paypal!.createInstance({ clientToken, components: ["paypal-payments"], pageType: "checkout" });
      const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
      if (!methods.isEligible("paypal")) throw new Error("not eligible");
      const session = sdk.createPayPalOneTimePaymentSession({
        onApprove: async ({ orderId }) => {
          const paid = await fetch("/api/give", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "capture", orderId }) });
          const data = (await paid.json()) as { error?: string };
          setBusy(false);
          if (!paid.ok) setError(data.error ?? "PayPal approved this, but we couldn't finish it. You can try again.");
          void refresh();
        },
        onCancel: () => setBusy(false),
        onError: () => {
          setBusy(false);
          setError("PayPal couldn't finish that. You weren't charged.");
        },
      });
      if (cancelled) return;
      setMode("live");

      const createOrder = async () => {
        const res = await fetch("/api/give", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "order", amount: Number(latest.current) }) });
        const data = (await res.json()) as { orderId?: string; error?: string };
        if (!res.ok || !data.orderId) throw new Error(data.error ?? "Could not start PayPal");
        return { orderId: data.orderId };
      };
      const onClick = () => {
        const chosen = Number(latest.current);
        if (!(chosen >= MIN && chosen <= MAX)) {
          setError(`Choose an amount from $${MIN} to $${MAX}.`);
          return;
        }
        setError(null);
        setBusy(true);
        // not awaited: the window has to open inside this click
        session.start({ presentationMode: "auto" }, createOrder()).catch((err: Error) => {
          setBusy(false);
          setError(err?.message && !/popup|window/i.test(err.message) ? err.message : "PayPal couldn't open. Please try again.");
        });
      };
      const element = button.current;
      element?.addEventListener("click", onClick);
      remove = () => element?.removeEventListener("click", onClick);
    }

    connect().catch(() => {
      if (!cancelled) setMode("off");
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  const refund = async (giftId: string) => {
    setRefunding(giftId);
    setError(null);
    const res = await fetch("/api/give", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refund", giftId }) });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) setError(data.error ?? "That refund didn't go through.");
    setRefunding(null);
    void refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      {responder ? (
        <Card>
          <Pill tone="sky">Responder account</Pill>
          <h2 className="font-display mt-3 text-[28px] text-ink">
            Responders <span className="accent">receive</span>, donors give
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-body">
            You&apos;re logged in as a responder. Money you gave would go into the Reserve that pays responders, so LEVee keeps the two apart. To give personally, log out first: giving once doesn&apos;t need an account.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                void logOut("/give");
              }}
              className="inline-flex h-11 items-center rounded-full bg-blue px-6 text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:cursor-wait disabled:opacity-70"
            >
              {leaving ? "Logging out" : "Log out and give"}
            </button>
            <Link href="/responder" className="inline-flex h-11 items-center rounded-full bg-ice-soft px-6 text-[15px] font-semibold text-link transition hover:bg-ice">
              Open your console
            </Link>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-[14px] font-medium text-[#a8261b]">
              {error}
            </p>
          )}
        </Card>
      ) : (
        <Card>
          <h2 className="font-display text-[28px] text-ink">
            Give <span className="accent">once</span>
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-body">Choose an amount and pay with PayPal. You&apos;re charged straight away, and PayPal sends the receipt.</p>

          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Choose an amount">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={value === q}
                onClick={() => setAmount(String(q))}
                className={`h-11 min-w-16 rounded-full px-4 text-[15px] font-semibold transition ${value === q ? "bg-blue text-white" : "bg-ice-soft text-link hover:bg-ice"}`}
              >
                ${q}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-[14px] font-semibold text-ink" htmlFor="gift-amount">
            Or enter your own, in US dollars
          </label>
          <div className="mt-1.5 flex h-12 items-center rounded-2xl bg-white px-4 ring-1 ring-inset ring-ice-line focus-within:ring-2 focus-within:ring-blue">
            <span className="text-[18px] font-semibold text-[#5f6b7a]">$</span>
            <input
              id="gift-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              aria-invalid={!valid}
              aria-describedby="gift-limits"
              className="ml-1 w-full bg-transparent text-[18px] font-semibold text-ink outline-none"
            />
          </div>
          <p id="gift-limits" className={`mt-1.5 text-[13px] ${valid || amount === "" ? "text-[#5f6b7a]" : "font-semibold text-[#a8261b]"}`}>
            From ${MIN} to ${MAX.toLocaleString("en-US")}.
          </p>

          <div className="mt-4 rounded-2xl bg-ice-soft p-4 text-[14px] leading-relaxed text-body">
            <p className="font-semibold text-ink">Where your gift goes</p>
            <p className="mt-0.5">It joins LEVee&apos;s Reserve and goes out with the next storm that meets our published rules, so it may wait until then. You can ask for it back within {RULES.refundWindowHours} hours, unless it has already gone to responders.</p>
          </div>

          <div className="mt-5" aria-busy={busy}>
            <div className={mode === "live" ? "flex justify-center" : "hidden"}>{createElement("paypal-button", { ref: button, id: "paypal-give-button", type: "pay" })}</div>
            {mode === "checking" && <p className="text-center text-[14px] text-[#5f6b7a]">Connecting to PayPal…</p>}
            {mode === "off" && (
              <p role="status" className="rounded-2xl bg-[#ffedb8] p-3 text-[14px] text-[#5c4300]">
                PayPal isn&apos;t connected on this copy of the site. Add the sandbox keys to <code className="font-mono">.env.local</code> to take real sandbox payments.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-center text-[14px] font-medium text-[#a8261b]">
                {error}
              </p>
            )}
            <p className="mt-2 text-center text-[12px] text-[#5f6b7a]">PayPal sandbox: this uses test money, and no real payment is made.</p>
          </div>
        </Card>
      )}

      <div className="space-y-5">
        <Card>
          <Label>The Reserve now holds</Label>
          <motion.p key={reserveCents ?? "x"} initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }} className="font-display mt-1 text-[44px] leading-none text-ink">
            {reserveCents === null ? "—" : dollars(reserveCents)}
          </motion.p>
          <p className="mt-2 text-[14px] leading-relaxed text-body">Gifts so far, after PayPal&apos;s fees. Tranche 1 of the next storm takes half of it, up to $500.</p>
          <Link href="/run" className="mt-3 inline-block text-[15px] font-semibold text-link hover:underline">
            Send it to responders in the live demo
          </Link>
        </Card>

        <AnimatePresence initial={false}>
          {gifts.map((gift) => (
            <motion.div key={gift.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-[22px] text-ink">Thank you for your {dollars(gift.cents)}</h2>
                  <Pill tone={gift.status === "refunded" ? "grey" : "green"}>{gift.status === "refunded" ? "Refunded" : "Paid"}</Pill>
                </div>
                <dl className="mt-3 divide-y divide-ice text-[14px]">
                  {[
                    ["PayPal's fee", dollars(gift.feeCents ?? 0)],
                    ["Joined the Reserve", gift.status === "refunded" ? "Refunded" : dollars(gift.netCents ?? 0)],
                    ["PayPal reference", gift.captureId ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 py-2">
                      <dt className="text-[#5f6b7a]">{k}</dt>
                      <dd className="break-all text-right font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
                {gift.status === "captured" && (
                  <button type="button" disabled={refunding === gift.id} onClick={() => refund(gift.id)} className="mt-3 text-[14px] font-semibold text-link hover:underline disabled:opacity-60">
                    {refunding === gift.id ? "Refunding…" : "Ask for it back"}
                  </button>
                )}
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
