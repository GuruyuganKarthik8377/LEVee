import type { SignUp } from "../../../../server/accounts.ts";
import { bodyOf, cookieValue, DONOR_COOKIE, donorCookie, handle, requireJson, withCookies } from "../../../../server/http.ts";
import { accountsFor, confirmUrl } from "../../../../server/supabaseAuth.ts";

/**
 * Creates a donor or responder account. With email confirmation on (Supabase's default) the answer is { account: null }
 * and the person logs in from the emailed link. A donor keeps this browser's donor id, so a pledge saved on /run carries over.
 */
export const POST = (request: Request) =>
  handle(async () => {
    requireJson(request);
    const body = await bodyOf(request);
    const { accounts, cookies } = accountsFor(request, true);
    const next = body.role === "donor" ? "/run" : "/";
    const { account } = await accounts.signUp({ ...(body as unknown as SignUp), donorId: cookieValue(request, DONOR_COOKIE) }, confirmUrl(request, next));
    return withCookies({ account }, account?.donorId ? [...cookies, donorCookie(account.donorId)] : cookies, 201);
  });
