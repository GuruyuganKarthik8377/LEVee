import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { returnTo } from "./lib/returnTo";

/**
 * Pledging and the live PayPal demo need a logged-in donor or ops person. Anyone else is sent to log in, and comes back
 * here afterwards. A responder is sent to their console. Without accounts set up (no Supabase), the pages stay open.
 * The API routes behind these pages check the same thing (requireGiver in src/server/supabaseAuth.ts).
 */
export async function middleware(request: NextRequest) {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !anon || !service) return NextResponse.next();

  // Supabase may refresh the login here. The new cookies go to the page's request and back to the browser,
  // httpOnly as everywhere else, and lasting only for the browser session when "Keep me logged in" was off.
  const short = request.cookies.get("levee_short")?.value === "1";
  let refreshed: { name: string; value: string; maxAge?: number }[] = [];
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        refreshed = list.map(({ name, value, options }) => ({ name, value, maxAge: options.maxAge === 0 || !short ? options.maxAge : undefined }));
        for (const c of refreshed) request.cookies.set(c.name, c.value);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const role = data.user ? await roleOf(data.user.id, data.user.email ?? "", url, service) : null;

  const here = request.nextUrl.pathname + request.nextUrl.search;
  const response =
    role === "donor" || role === "ops"
      ? NextResponse.next({ request })
      : NextResponse.redirect(new URL(role === "responder" ? "/responder" : `/login?next=${encodeURIComponent(returnTo(here) ?? "/")}`, request.url));
  for (const c of refreshed) {
    response.cookies.set(c.name, c.value, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", ...(c.maxAge !== undefined && { maxAge: c.maxAge }) });
  }
  return response;
}

/** Ops by LEVEE_OPS_EMAILS, as in src/server/supabaseAuth.ts; everyone else by their profile. Null for a login with no profile. */
async function roleOf(userId: string, email: string, url: string, service: string): Promise<string | null> {
  const ops = (process.env.LEVEE_OPS_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  if (email && ops.includes(email.toLowerCase())) return "ops";
  const res = await fetch(`${url}/rest/v1/levee_profiles?select=role&user_id=eq.${encodeURIComponent(userId)}`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const [profile] = (await res.json()) as { role?: string }[];
  return profile?.role ?? null;
}

export const config = { matcher: ["/pledge", "/run"], runtime: "nodejs" };
