import { handle } from "../../../server/http.ts";
import { levee } from "../../../server/levee.ts";

export const dynamic = "force-dynamic";

/** The Reserve's balance, from the ledger. */
export const GET = () => handle(async () => Response.json(await levee().reserveBalance()));
