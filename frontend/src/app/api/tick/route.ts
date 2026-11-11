import { handle, RequestError, requireSecret } from "../../../server/http.ts";
import { levee } from "../../../server/levee.ts";

// ponytail: a lock in this process, which is enough on one server. Use a database lock when there are several.
let running = false;

/** The hourly job: a scheduler calls this with LEVEE_TICK_SECRET. One at a time, as overlapping ticks waste AI calls. */
export const POST = (request: Request) =>
  handle(async () => {
    requireSecret(request, "LEVEE_TICK_SECRET");
    if (running) throw new RequestError("A tick is already running", 409);
    running = true;
    try {
      return Response.json(await levee().tick());
    } finally {
      running = false;
    }
  });
