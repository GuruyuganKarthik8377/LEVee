import { bodyOf, handle, requireJson, withCookies } from "../../../../server/http.ts";
import { accountsFor } from "../../../../server/supabaseAuth.ts";

/** Sets a new password for whoever is logged in: someone who has just opened their reset link. */
export const POST = (request: Request) =>
  handle(async () => {
    requireJson(request);
    const { password } = await bodyOf(request);
    const { accounts, cookies } = accountsFor(request);
    await accounts.setPassword(password);
    return withCookies({ ok: true }, cookies);
  });
