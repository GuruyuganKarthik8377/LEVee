import { handle, requireDonor } from "../../../../../server/http.ts";
import { levee } from "../../../../../server/levee.ts";

/** Only this donor's own charges. */
export const GET = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params;
    requireDonor(request, id);
    return Response.json(await levee().donorActivity(id));
  });
