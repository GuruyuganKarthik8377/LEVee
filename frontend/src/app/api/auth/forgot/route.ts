import { bodyOf, handle, requireJson, withCookies } from "../../../../server/http.ts";
import { accountsFor, confirmUrl } from "../../../../server/supabaseAuth.ts";

/** Emails a link to /reset-password. The answer is the same whether or not the email has an account. */
export const POST = (request: Request) =>
  handle(async () => {
    requireJson(request);
    const { email } = await bodyOf(request);
    const { accounts, cookies } = accountsFor(request);
    await accounts.forgot(email, confirmUrl(request, "/reset-password"));
    return withCookies({ ok: true }, cookies);
  });
