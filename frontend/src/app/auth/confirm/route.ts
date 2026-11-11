import { donorCookie, RequestError } from "../../../server/http.ts";
import { accountsFor } from "../../../server/supabaseAuth.ts";

/**
 * Where Supabase's emails link to: confirming a new account, or resetting a password. It logs the person in and opens
 * `next`, which must be a page on this site. A link that has expired goes to /login, which says so.
 */
export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const page = /^\/(?![/\\])/.test(next) ? next : "/";
  const go = (to: string, cookies: string[]) => {
    const headers = new Headers({ location: new URL(to, url.origin).toString(), "cache-control": "no-store" });
    for (const c of cookies) headers.append("set-cookie", c);
    return new Response(null, { status: 303, headers });
  };
  try {
    const { accounts, cookies } = accountsFor(request);
    const account = await accounts.confirm({ code: url.searchParams.get("code"), tokenHash: url.searchParams.get("token_hash"), type: url.searchParams.get("type") });
    return go(page, account?.donorId ? [...cookies, donorCookie(account.donorId)] : cookies);
  } catch (err) {
    if (!(err instanceof RequestError)) console.error("[levee auth]", err);
    return go("/login?link=expired", []);
  }
};
