import { handle, RequestError } from "../../../../server/http.ts";
import { levee } from "../../../../server/levee.ts";

/** PayPal sends the donor here after they approve. The pledge's terms come from what they confirmed, not from this link. */
export const GET = (request: Request) =>
  handle(async () => {
    const params = new URL(request.url).searchParams;
    const setupTokenId = params.get("approval_token_id") ?? params.get("token");
    if (!setupTokenId) throw new RequestError("PayPal's approval token is missing");
    await levee().completePledge(setupTokenId);
    return Response.redirect(new URL("/donor", request.url), 303);
  });
