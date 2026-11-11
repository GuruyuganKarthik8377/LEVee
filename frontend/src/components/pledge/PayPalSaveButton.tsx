"use client";

import { createElement, useEffect, useRef, useState } from "react";

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

type SaveSession = { start: (options: { presentationMode: "auto" }, setupToken: Promise<{ vaultSetupToken: string }>) => Promise<void> };
type SaveOptions = { onApprove: (data: { vaultSetupToken: string }) => void; onCancel: () => void; onError: (error: unknown) => void };
type PaySession = { start: (options: { presentationMode: "auto" }, order: Promise<{ orderId: string }>) => Promise<void> };
type PayOptions = { onApprove: (data: { orderId: string }) => void; onCancel: () => void; onError: (error: unknown) => void };
type PayPalInstance = {
  findEligibleMethods: (options: { currencyCode: string; paymentFlow?: string }) => Promise<{ isEligible: (method: string) => boolean }>;
  createPayPalSavePaymentSession: (options: SaveOptions) => SaveSession;
  createPayPalOneTimePaymentSession: (options: PayOptions) => PaySession;
};

declare global {
  interface Window {
    paypal?: { createInstance: (options: { clientToken: string; components: string[]; pageType: string }) => Promise<PayPalInstance> };
  }
}

export function loadPayPalSdk() {
  return new Promise<void>((resolve, reject) => {
    if (window.paypal) return resolve();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(script);
  });
}

async function createSetupToken() {
  const res = await fetch("/api/paypal/setup-token", { method: "POST" });
  if (!res.ok) throw new Error("Could not start PayPal");
  const { id } = (await res.json()) as { id: string };
  // PayPal's SDK is loaded fresh from PayPal, and from v6.72 it reads this as vaultSetupToken: with the old name it fails with
  // "no setup token provided" and PayPal's window closes at once. onApprove already hands back vaultSetupToken.
  return { vaultSetupToken: id };
}

type Props = {
  saving: boolean;
  onSaved: () => void;
  /** The terms the donor just agreed to, kept on the server with their saved account. */
  pledge?: { amount: number; cap: number; timing?: "early" | "confirmed" };
  /** Hides the preview button, for a page that only makes sense with real PayPal. */
  requireLive?: boolean;
};

/**
 * Real PayPal approval through JS SDK v6 when the sandbox keys are set. Without them the routes answer 503 and this
 * stays a clearly labelled preview, so the demo still runs for anyone who clones the repo.
 */
export default function PayPalSaveButton({ saving, onSaved, pledge, requireLive = false }: Props) {
  const [mode, setMode] = useState<"checking" | "live" | "preview">("checking");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const button = useRef<HTMLElement>(null);
  const saved = useRef(onSaved);
  const terms = useRef(pledge);

  useEffect(() => {
    saved.current = onSaved;
    terms.current = pledge;
  }, [onSaved, pledge]);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;

    async function connect() {
      const res = await fetch("/api/paypal/client-token");
      if (!res.ok) throw new Error("not available");
      const { clientToken } = (await res.json()) as { clientToken: string };
      await loadPayPalSdk();
      const sdk = await window.paypal!.createInstance({ clientToken, components: ["paypal-payments"], pageType: "checkout" });
      const methods = await sdk.findEligibleMethods({ currencyCode: "USD", paymentFlow: "VAULT_WITHOUT_PAYMENT" });
      if (!methods.isEligible("paypal")) throw new Error("not eligible");
      const session = sdk.createPayPalSavePaymentSession({
        onApprove: async ({ vaultSetupToken }) => {
          const saveRes = await fetch("/api/paypal/payment-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vaultSetupToken, ...terms.current }),
          });
          setStarting(false);
          if (saveRes.ok) saved.current();
          else setError("PayPal approved this, but we could not save it. Try again.");
        },
        onCancel: () => setStarting(false),
        onError: () => {
          setStarting(false);
          setError("PayPal could not finish that. Try again.");
        },
      });
      if (cancelled) return;
      setMode("live");
      const onClick = () => {
        setError(null);
        setStarting(true);
        // not awaited: the popup has to open inside this click
        session.start({ presentationMode: "auto" }, createSetupToken()).catch(() => {
          setStarting(false);
          setError("PayPal could not open. Try again.");
        });
      };
      const element = button.current;
      element?.addEventListener("click", onClick);
      remove = () => element?.removeEventListener("click", onClick);
    }

    connect().catch(() => {
      if (!cancelled) setMode("preview");
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  return (
    <div>
      <div className={mode === "live" ? "flex justify-center" : "hidden"} aria-busy={starting}>
        {createElement("paypal-button", { ref: button, id: "paypal-button" })}
      </div>
      {mode !== "live" && !requireLive && (
        <button
          type="button"
          onClick={onSaved}
          disabled={saving || mode === "checking"}
          className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-blue text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:cursor-wait disabled:opacity-70"
        >
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-[13px] font-bold text-outline">$</span>
          )}
          {saving ? "Saving" : "Save your PayPal account"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-center text-[13px] font-medium text-[#a8261b]">
          {error}
        </p>
      )}
      <p className="mt-2 text-center text-[12px] text-[#5f6b7a]">
        {mode === "live" ? "PayPal's own window opens. Nothing is charged today." : mode === "checking" ? "Connecting to PayPal…" : "Sandbox preview: add the PayPal sandbox keys to turn on real approval."}
      </p>
    </div>
  );
}
