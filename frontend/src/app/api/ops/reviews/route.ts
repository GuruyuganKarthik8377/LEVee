import { handle, withCookies } from "../../../../server/http.ts";
import { levee } from "../../../../server/levee.ts";
import { requireOps } from "../../../../server/supabaseAuth.ts";

/** Ops only: partners waiting on a person's decision. */
export const GET = (request: Request) =>
  handle(async () => {
    const { cookies } = await requireOps(request);
    return withCookies(await levee().listOpenReviews(), cookies);
  });
