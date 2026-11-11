import type { PledgePolicy } from "../../../../../../backend/agents/src/concierge/policy.ts";
import { bodyOf, donorOf, handle, RequestError, text, withCookies } from "../../../../server/http.ts";
import { levee } from "../../../../server/levee.ts";
import { requireGiver } from "../../../../server/supabaseAuth.ts";

/** A logged-in donor confirmed their pledge card. Returns PayPal's approval link, and a second one for a monthly Reserve gift. */
export const POST = (request: Request) =>
  handle(async () => {
    const { cookies } = await requireGiver(request);
    const body = await bodyOf(request);
    if (!body.policy || typeof body.policy !== "object") throw new RequestError("policy is required");
    const language = typeof body.language === "string" ? body.language : undefined;
    // The card's hash is checked against the policy inside, so a changed policy is refused.
    // Logging in set the donor cookie to the account's donor id, so the pledge is the account's.
    const { donorId, setCookie } = donorOf(request);
    const vault = await levee().confirmPledge({ donorId, policy: body.policy as PledgePolicy, confirmedHash: text(body, "confirmedHash"), ...(language && { language }) });
    return withCookies(vault, setCookie ? [...cookies, setCookie] : cookies);
  });
