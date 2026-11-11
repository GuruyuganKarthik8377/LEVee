import { bodyOf, handle, RequestError, text, withCookies } from "../../../../../server/http.ts";
import { levee } from "../../../../../server/levee.ts";
import { requireOps } from "../../../../../server/supabaseAuth.ts";

/** Ops only: a person confirms landfall from an official bulletin. */
export const POST = (request: Request, { params }: { params: Promise<{ eventKey: string }> }) =>
  handle(async () => {
    const { cookies } = await requireOps(request);
    const { eventKey } = await params;
    const body = await bodyOf(request);
    const confirmedAt = text(body, "confirmedAt");
    if (Number.isNaN(Date.parse(confirmedAt))) throw new RequestError("confirmedAt must be a date and time");
    await levee().confirmLandfall(eventKey, { confirmedAt: new Date(confirmedAt).toISOString(), source: text(body, "source") });
    return withCookies({ ok: true }, cookies);
  });
