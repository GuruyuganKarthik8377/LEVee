import { getStorms } from "@/lib/gdacs";
import { handle, RequestError } from "@/server/http";
import { backendStore } from "@/server/levee";
import { briefFor, savedBrief } from "@/server/liveBrief";

export const dynamic = "force-dynamic";

/** Only storms GDACS lists as current, so nobody can spend Claude calls on made-up or long-gone storms. */
async function currentStorm(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new RequestError("Unknown storm", 404);
  const storms = await getStorms();
  if (!storms) throw new RequestError("GDACS can't be reached just now. Try again in a minute.", 502);
  if (!storms.some((s) => s.id === id && s.current)) throw new RequestError("Sentinel only reads storms GDACS lists as current", 404);
  return id;
}

/** The storm's latest Threat Brief, if one has been written. Never calls Claude. */
export const GET = (_request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const id = Number((await params).id);
    return Response.json({ brief: Number.isInteger(id) ? ((await savedBrief(id, backendStore().kv)) ?? null) : null });
  });

/** Sentinel reads the storm's live GDACS data and writes a Threat Brief, or returns the one already written for its latest advisory. */
export const POST = (_request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const id = await currentStorm(params);
    const store = backendStore();
    return Response.json({ brief: await briefFor(id, { kv: store.kv, audit: store.audit }) });
  });
