import { bodyOf, donorCookie, handle, requireJson, withCookies } from "../../../../server/http.ts";
import { accountsFor } from "../../../../server/supabaseAuth.ts";

/** Email and password. Wrong details always get the same answer, so it never says which emails have accounts. */
export const POST = (request: Request) =>
  handle(async () => {
    requireJson(request);
    const { email, password, remember } = await bodyOf(request);
    const { accounts, cookies } = accountsFor(request, remember !== false);
    const account = await accounts.logIn({ email, password });
    return withCookies({ account }, account.donorId ? [...cookies, donorCookie(account.donorId)] : cookies);
  });
