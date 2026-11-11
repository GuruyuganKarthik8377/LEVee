import { handle, withCookies } from "../../../../server/http.ts";
import { backendStore } from "../../../../server/levee.ts";
import { requireOps, responders } from "../../../../server/supabaseAuth.ts";

/** Ops only: every responder that signed up, oldest first, with its review status. */
export const GET = (request: Request) =>
  handle(async () => {
    const { cookies } = await requireOps(request);
    return withCookies(await responders(backendStore().audit).list(), cookies);
  });
