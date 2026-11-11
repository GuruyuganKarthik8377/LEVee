import { bodyOf, handle, RequestError, requireDonor, text } from "../../../../../server/http.ts";
import { levee } from "../../../../../server/levee.ts";

const MAX_CHARS = 1_000;

/** "Where did my money go?" The answer may include a refund decision from the Policy Engine. */
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await params;
    requireDonor(request, id);
    const question = text(await bodyOf(request), "question");
    if (question.length > MAX_CHARS) throw new RequestError(`Questions can be up to ${MAX_CHARS} characters`);
    return Response.json(await levee().askNarrator(id, question));
  });
