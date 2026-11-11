import { handle, withCookies } from "../../../server/http.ts";
import { levee } from "../../../server/levee.ts";
import { requirePartner } from "../../../server/supabaseAuth.ts";

/** Partners only: the storms this partner was considered for, with only its own share, money, proof and review. */
export const GET = (request: Request) =>
  handle(async () => {
    const { partnerId, cookies } = await requirePartner(request);
    return withCookies(await levee().partnerEvents(partnerId), cookies);
  });

export type PartnerEvents = Awaited<ReturnType<ReturnType<typeof levee>["partnerEvents"]>>;
