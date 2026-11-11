import { browserClientToken, paypalRoute } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export const GET = () => paypalRoute(async () => Response.json({ clientToken: await browserClientToken() }));
