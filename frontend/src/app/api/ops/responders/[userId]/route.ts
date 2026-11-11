import type { Decision } from "../../../../../server/responders.ts";
import { bodyOf, handle, text, withCookies } from "../../../../../server/http.ts";
import { backendStore } from "../../../../../server/levee.ts";
import { requireOps, responders } from "../../../../../server/supabaseAuth.ts";

/**
 * Ops only: approves a responder, with the service area, radius, capacity and time zone Levee pays it by, or rejects it
 * with a reason. The decision goes on the public audit log.
 */
export const POST = (request: Request, { params }: { params: Promise<{ userId: string }> }) =>
  handle(async () => {
    const ops = await requireOps(request);
    const { userId } = await params;
    const body = await bodyOf(request);
    const decided = await responders(backendStore().audit).decide(userId, body as unknown as Decision, ops.by ?? text(body, "by"));
    return withCookies(decided, ops.cookies);
  });
