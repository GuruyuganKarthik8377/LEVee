import { handle, RequestError } from "../../../../server/http.ts";
import { levee } from "../../../../server/levee.ts";

/** One storm, as the storm map, responder console and ops screens read it. */
export const GET = (_request: Request, { params }: { params: Promise<{ eventKey: string }> }) =>
  handle(async () => {
    const { eventKey } = await params;
    const event = await levee().getEvent(eventKey);
    if (!event) throw new RequestError(`No event ${eventKey}`, 404);
    return Response.json(event);
  });
