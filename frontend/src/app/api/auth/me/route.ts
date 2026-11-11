import { handle, withCookies } from "../../../../server/http.ts";
import { accountsConfigured, accountsFor } from "../../../../server/supabaseAuth.ts";

/** The logged-in account, or null. Every page asks, so it's null rather than an error when accounts aren't set up. */
export const GET = (request: Request) =>
  handle(async () => {
    if (!accountsConfigured()) return withCookies({ account: null }, []);
    const { accounts, cookies } = accountsFor(request);
    return withCookies({ account: await accounts.whoIs() }, cookies);
  });
