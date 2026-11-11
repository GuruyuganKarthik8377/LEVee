import { bodyOf, handle, RequestError, text, withCookies } from "../../../../../../server/http.ts";
import { levee } from "../../../../../../server/levee.ts";
import { requireOps } from "../../../../../../server/supabaseAuth.ts";

/** Ops only. Final once made, and tranche 2 moves on at once. A logged-in person is recorded as who decided. */
export const POST = (request: Request, { params }: { params: Promise<{ eventKey: string; partnerId: string }> }) =>
  handle(async () => {
    const ops = await requireOps(request);
    const { eventKey, partnerId } = await params;
    const body = await bodyOf(request);
    if (body.decision !== "approve" && body.decision !== "reject") throw new RequestError("decision must be approve or reject");
    const note = typeof body.note === "string" ? body.note : undefined;
    return withCookies(await levee().decideReview(eventKey, partnerId, { decision: body.decision, by: ops.by ?? text(body, "by"), ...(note && { note }) }), ops.cookies);
  });
