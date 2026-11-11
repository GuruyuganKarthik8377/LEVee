import { handle } from "@/server/http";
import { backendStore } from "@/server/levee";
import { recentBriefs } from "@/server/liveBrief";

export const dynamic = "force-dynamic";

/** The latest live Threat Brief for each storm someone asked Sentinel about, newest first, for the public audit log. */
export const GET = () => handle(async () => Response.json(await recentBriefs(backendStore().kv)));
