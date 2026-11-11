import { bodyOf, handle, text, withCookies } from "../../../../../../server/http.ts";
import { levee } from "../../../../../../server/levee.ts";
import { requireOps } from "../../../../../../server/supabaseAuth.ts";

/** Ops only: approves a tranche over the playbook's limit. A logged-in person is recorded as who approved. */
export const POST = (request: Request, { params }: { params: Promise<{ trancheKey: string }> }) =>
  handle(async () => {
    const ops = await requireOps(request);
    const { trancheKey } = await params;
    return withCookies(await levee().approveTranche(trancheKey, ops.by ?? text(await bodyOf(request), "by")), ops.cookies);
  });
