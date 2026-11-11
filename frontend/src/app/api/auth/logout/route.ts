import { cookie, DONOR_COOKIE, handle, requireJson, withCookies } from "../../../../server/http.ts";
import { accountsFor, SHORT_COOKIE } from "../../../../server/supabaseAuth.ts";

/** Ends this browser's session, and clears the donor id too, so the next person on this device isn't treated as this donor. */
export const POST = (request: Request) =>
  handle(async () => {
    requireJson(request);
    const { accounts, cookies } = accountsFor(request);
    await accounts.logOut();
    return withCookies({ ok: true }, [...cookies, cookie(DONOR_COOKIE, "", 0), cookie(SHORT_COOKIE, "", 0)]);
  });
