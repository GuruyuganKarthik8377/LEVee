import { handle } from "../../../../../server/http.ts";
import { levee } from "../../../../../server/levee.ts";

/** The one-tap skip link in a notice. False once the skip window has closed. */
export const GET = (_request: Request, { params }: { params: Promise<{ trancheKey: string; pledgeId: string }> }) =>
  handle(async () => {
    const { trancheKey, pledgeId } = await params;
    return Response.json({ skipped: await levee().skip(trancheKey, pledgeId) });
  });
