"use client";

import { useEffect, useState } from "react";

/** What the browser knows about the logged-in account (GET /api/auth/me). */
export type Account = {
  email: string;
  name: string;
  role: "donor" | "responder" | "ops";
  pledge?: { amount: number; cap: number; timing: "early" | "confirmed" };
  organisation?: { status: "pending_review" | "approved" | "rejected"; review?: { at: string; reason?: string } };
};

type Result = { ok: true; account: Account | null } | { ok: false; status: number; error: string };

const TRY_AGAIN = "Something went wrong. Try again.";

/** POSTs to one of the account routes, and turns every failure into a message the page can show. */
export async function postAuth(path: "signup" | "login" | "logout" | "forgot" | "password", body: unknown): Promise<Result> {
  try {
    const res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, account: data.account ?? null };
    // 503 says accounts aren't set up on this server, which is worth showing as it is.
    const shown = res.status < 500 || res.status === 503;
    return { ok: false, status: res.status, error: shown && typeof data.error === "string" ? data.error : TRY_AGAIN };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach LEVee. Check your connection and try again." };
  }
}

/** The logged-in account, or null while loading and when logged out. */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => live && setAccount(data?.account ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return account;
}

/** Logs out, then opens `to`: the homepage unless a page wants to stay where it is. */
export async function logOut(to = "/") {
  await postAuth("logout", {});
  window.location.assign(to);
}
