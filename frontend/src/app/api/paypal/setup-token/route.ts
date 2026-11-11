import { createSetupToken, paypalRoute } from "@/lib/paypal";
import { handle, withSetCookies } from "@/server/http";
import { requireGiver } from "@/server/supabaseAuth";

/** Starts saving a PayPal account for a pledge, which needs a logged-in donor. */
export const POST = (request: Request) =>
  handle(async () => {
    const { cookies } = await requireGiver(request);
    const response = await paypalRoute(async () => {
      const { id } = await createSetupToken(new URL(request.url).origin);
      return Response.json({ id });
    });
    return withSetCookies(response, cookies);
  });
