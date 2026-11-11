import { handle, requireDonor } from "../../../../../../server/http.ts";
import { levee } from "../../../../../../server/levee.ts";

/** Stops this donor's future monthly Reserve gifts. False if none were running. */
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params;
    requireDonor(request, id);
    return Response.json({ cancelled: await levee().cancelReserve(id) });
  });
