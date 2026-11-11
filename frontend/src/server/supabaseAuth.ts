import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createAccounts } from "./accounts.ts";
import { cookie, cookieValue, hasSecret, partnerFromToken, RequestError, requireJson } from "./http.ts";
import { createResponders } from "./responders.ts";
import { serverSupabase } from "./supabaseStore.ts";

/**
 * Accounts for one request: Supabase Auth bound to this browser's cookies, plus the server's database client for profiles.
 * Built from the Request rather than next/headers, so the routes still run in plain Node tests.
 */

/** Accounts need SUPABASE_ANON_KEY for logins, and the service-role key for profiles. */
export const accountsConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Set when "Keep me logged in" was off, so a refreshed session stays a browser-session cookie too.
export const SHORT_COOKIE = "levee_short";

/**
 * Supabase's login cookies are httpOnly here: only this server reads them. Send `cookies` back with the response once
 * the accounts call has finished, since logging in, out, or a refreshed session changes them. `remember` is only
 * given when logging in: false makes them last until the browser closes.
 */
export function accountsFor(request: Request, remember?: boolean) {
  if (!accountsConfigured()) throw new RequestError("Accounts aren't set up on this server yet.", 503);
  const short = remember === undefined ? cookieValue(request, SHORT_COOKIE) === "1" : !remember;
  const cookies = remember === undefined ? [] : [remember ? cookie(SHORT_COOKIE, "", 0) : cookie(SHORT_COOKIE, "1")];
  const { auth } = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get("cookie") ?? "").map(({ name, value }) => ({ name, value: value ?? "" })),
      setAll: (list) => {
        for (const { name, value, options } of list) cookies.push(cookie(name, value, options.maxAge === 0 || !short ? options.maxAge : undefined));
      },
    },
  });
  return { accounts: createAccounts(auth, serverSupabase(), opsEmails()), cookies };
}

/** LEVEE_OPS_EMAILS: the logins, made in the Supabase dashboard, that may use the ops screens. */
const opsEmails = () => (process.env.LEVEE_OPS_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Ops only: a script with LEVEE_OPS_TOKEN, or a logged-in ops person, whose email is then `by`. Send `cookies` back.
 * A logged-in browser's changes must be JSON, as for logging in, so a form on another site can't make them.
 */
export async function requireOps(request: Request): Promise<{ by?: string; cookies: string[] }> {
  if (hasSecret(request, "LEVEE_OPS_TOKEN")) return { cookies: [] };
  if (!accountsConfigured()) throw new RequestError("Not allowed", 401);
  const { accounts, cookies } = accountsFor(request);
  const by = await accounts.opsEmail();
  if (!by) throw new RequestError("Not allowed", 401);
  if (request.method !== "GET") requireJson(request);
  return { by, cookies };
}

/** Partners only: a token from LEVEE_PARTNER_TOKENS, or a logged-in approved responder. Send `cookies` back. */
export async function requirePartner(request: Request): Promise<{ partnerId: string; cookies: string[] }> {
  const fromToken = partnerFromToken(request);
  if (fromToken) return { partnerId: fromToken, cookies: [] };
  if (!accountsConfigured()) throw new RequestError("Not allowed", 401);
  const { accounts, cookies } = accountsFor(request);
  const partnerId = await accounts.partnerId();
  if (!partnerId) throw new RequestError("Not allowed", 401);
  if (request.method !== "GET") requireJson(request);
  return { partnerId, cookies };
}

/**
 * Pledging and the live PayPal demo: a logged-in donor, or ops running a demo. Without accounts set up, anyone, as before.
 * Send `cookies` back. The pages themselves are guarded the same way in src/middleware.ts.
 */
export async function requireGiver(request: Request) {
  if (!accountsConfigured()) return { signedIn: undefined, cookies: [] as string[] };
  const signedIn = accountsFor(request);
  const account = await signedIn.accounts.whoIs();
  if (!account) throw new RequestError("Log in to pledge. New here? Signing up takes a minute.", 401);
  if (account.role !== "donor" && account.role !== "ops") throw new RequestError("Pledges are made from a donor account. Log in as a donor to pledge.", 403);
  return { signedIn, cookies: signedIn.cookies };
}

export const RESPONDERS_DONT_GIVE = "You're logged in as a responder, and responders receive funds rather than give them. To give personally, log out first.";

/**
 * One-time gifts are open to everyone, logged in or not, except a responder's account: money it gave would go into the
 * Reserve that pays it. Someone at a responder who wants to give personally logs out first. Send `cookies` back.
 */
export async function refuseResponder(request: Request): Promise<{ cookies: string[] }> {
  if (!accountsConfigured()) return { cookies: [] };
  const { accounts, cookies } = accountsFor(request);
  if ((await accounts.whoIs())?.role === "responder") throw new RequestError(RESPONDERS_DONT_GIVE, 403);
  return { cookies };
}

/** Responders as ops review them. Needs Supabase, where they're kept. */
export function responders(audit: (entry: unknown) => Promise<void>) {
  if (!accountsConfigured()) throw new RequestError("Accounts aren't set up on this server yet.", 503);
  return createResponders(serverSupabase(), audit);
}

/** Where an email link lands (src/app/auth/confirm), and the page it then opens. Add it to Supabase's redirect URLs. */
export const confirmUrl = (request: Request, next: string) => `${new URL(request.url).origin}/auth/confirm?next=${encodeURIComponent(next)}`;
