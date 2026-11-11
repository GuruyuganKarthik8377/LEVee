import { bodyOf, handle, RequestError, withCookies } from "../../../../server/http.ts";
import { levee } from "../../../../server/levee.ts";
import { requireGiver } from "../../../../server/supabaseAuth.ts";

const MAX_TURNS = 40;
const MAX_CHARS = 2_000;

/** One Concierge turn, for a logged-in donor: each one costs a Claude call. The browser keeps the turns and sends them all each time. */
export const POST = (request: Request) =>
  handle(async () => {
    const { cookies } = await requireGiver(request);
    const { turns } = await bodyOf(request);
    const valid = Array.isArray(turns) && turns.length > 0 && turns.length <= MAX_TURNS && turns.every((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string" && t.content.length <= MAX_CHARS);
    if (!valid) throw new RequestError(`turns must be 1 to ${MAX_TURNS} messages of { role, content }, each up to ${MAX_CHARS} characters`);
    return withCookies(await levee().pledgeChat(turns), cookies);
  });
