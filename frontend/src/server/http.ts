import { randomUUID, timingSafeEqual } from "node:crypto";
import { ConciergeError } from "../../../backend/agents/src/concierge/agent.ts";
import { LeveeError } from "../../../backend/agents/src/levee.ts";

/**
 * What every backend route shares: who is calling, reading the body, and turning errors into answers.
 * ponytail: ops and partners hold tokens from the server's settings until they have accounts. A donor is their browser's
 * donor cookie, which logging in sets to their account's donor id (src/server/supabaseAuth.ts).
 */

/** A bad request: the caller gets the message, with a 4xx status. */
export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const bearer = (request: Request) => /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];

function sameSecret(given: string | undefined, expected: string | undefined) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whether the call carries the secret in that setting. With the setting missing, nobody does. */
export const hasSecret = (request: Request, setting: "LEVEE_OPS_TOKEN" | "LEVEE_TICK_SECRET") => sameSecret(bearer(request), process.env[setting]);

/** Ops scripts carry LEVEE_OPS_TOKEN (people log in instead: requireOps in supabaseAuth.ts), and the hourly job LEVEE_TICK_SECRET. */
export function requireSecret(request: Request, setting: "LEVEE_OPS_TOKEN" | "LEVEE_TICK_SECRET") {
  if (!hasSecret(request, setting)) throw new RequestError("Not allowed", 401);
}

/** LEVEE_PARTNER_TOKENS is "partner-a:token,partner-b:token". The partner the call's token belongs to, if any. */
export function partnerFromToken(request: Request): string | undefined {
  const given = bearer(request);
  for (const pair of (process.env.LEVEE_PARTNER_TOKENS ?? "").split(",")) {
    const at = pair.indexOf(":");
    if (at > 0 && sameSecret(given, pair.slice(at + 1).trim())) return pair.slice(0, at).trim();
  }
}

// The same httpOnly cookie the live demo already gives each browser (src/lib/liveStore.ts), so page scripts can't read or forge it.
// Logging in sets it to the account's donor id, so the donor routes and /run act for the logged-in donor without changing.
export const DONOR_COOKIE = "levee_demo";
const DONOR_MAX_AGE = 60 * 60 * 24 * 30;
const UUID = /^[0-9a-f-]{36}$/;

export const cookieValue = (request: Request, name: string) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("cookie") ?? "")?.[1];

/** An httpOnly cookie. With no maxAge it lasts until the browser closes; 0 removes it. */
export function cookie(name: string, value: string, maxAge?: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}${secure}`;
}

/** The donor cookie for a logged-in donor's own id. */
export const donorCookie = (donorId: string) => cookie(DONOR_COOKIE, donorId, DONOR_MAX_AGE);

/** A JSON reply that also sets cookies. */
export function withCookies(body: unknown, cookies: string[], status = 200) {
  const headers = new Headers({ "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return Response.json(body, { status, headers });
}

/** The same response, also setting these cookies. */
export function withSetCookies(response: Response, cookies: string[]) {
  if (!cookies.length) return response;
  const headers = new Headers(response.headers);
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Login and sign-up only take JSON. A form on another site can't send that without the browser asking this server first,
 * so nobody can log a visitor into someone else's account.
 */
export function requireJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new RequestError("Send JSON", 415);
}

const cookieId = (request: Request) => {
  const value = cookieValue(request, DONOR_COOKIE);
  return value && UUID.test(value) ? value : undefined;
};

/** The donor a route may act for: only the browser's own id. */
export function requireDonor(request: Request, donorId: string) {
  if (cookieId(request) !== donorId) throw new RequestError("Not allowed", 403);
}

/** The browser's donor id, starting one if it has none. Send setCookie back with the response. */
export function donorOf(request: Request): { donorId: string; setCookie?: string } {
  const existing = cookieId(request);
  if (existing) return { donorId: existing };
  const donorId = randomUUID();
  return { donorId, setCookie: donorCookie(donorId) };
}

/** The JSON body, which must be an object. */
export async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => undefined);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("Send a JSON object");
  return body as Record<string, unknown>;
}

export function text(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`${field} is required`);
  return value;
}

/** Runs a route. Levee's own checks and bad requests become 4xx with their message; anything else is logged and becomes a plain 500. */
export async function handle(route: () => Promise<Response>): Promise<Response> {
  try {
    return await route();
  } catch (err) {
    if (err instanceof RequestError) return Response.json({ error: err.message }, { status: err.status });
    // Matched by name too: the shared backend (src/server/levee.ts) may have been built by another route's copy of these classes.
    const levees = err instanceof LeveeError || err instanceof ConciergeError || (err instanceof Error && (err.name === "LeveeError" || err.name === "ConciergeError"));
    if (levees) return Response.json({ error: (err as Error).message }, { status: 400 });
    console.error("[levee route]", err);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
