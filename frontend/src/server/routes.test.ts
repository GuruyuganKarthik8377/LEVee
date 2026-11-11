// The backend routes on mock PayPal, with no keys and no Claude calls. Run: node --test src/server/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardHash, policyFrom } from "../../../backend/agents/src/concierge/policy.ts";

const store = join(mkdtempSync(join(tmpdir(), "levee-routes-")), "store.json");
Object.assign(process.env, { LEVEE_STORE: store, LEVEE_OPS_TOKEN: "ops-secret", LEVEE_PARTNER_TOKENS: "partner-a:a-secret,partner-b:b-secret", LEVEE_TICK_SECRET: "tick-secret" });
delete process.env.LEVEE_PAYMENTS;
delete process.env.PAYPAL_WEBHOOK_ID;

const route = (path: string) => import(`../app/api/${path}/route.ts`);
const call = (url: string, init: RequestInit & { token?: string; cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${url}`, { ...init, headers });
};
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

test("ops routes need the ops token, and fail closed when it's wrong", async () => {
  const { GET } = await route("ops/reviews");
  assert.equal((await GET(call("/api/ops/reviews"))).status, 401);
  assert.equal((await GET(call("/api/ops/reviews", { token: "a-secret" }))).status, 401);
  const ok = await GET(call("/api/ops/reviews", { token: "ops-secret" }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), []);

  const landfall = await route("events/[eventKey]/landfall");
  const body = JSON.stringify({ confirmedAt: "2024-09-27T03:10:00Z", source: "NHC" });
  assert.equal((await landfall.POST(call("/api/events/x/landfall", { method: "POST", body }), params({ eventKey: "x" }))).status, 401);
  const missing = await landfall.POST(call("/api/events/x/landfall", { method: "POST", body, token: "ops-secret" }), params({ eventKey: "x" }));
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /No event x/);
});

test("a partner is who their token says, and the upload can't choose another", async () => {
  const { POST } = await route("proofs");
  const upload = (partnerId: string) => JSON.stringify({ eventKey: "storm-1", partnerId, photos: [], receipts: [], distribution: [] });
  assert.equal((await POST(call("/api/proofs", { method: "POST", body: upload("partner-a") }))).status, 401);
  // Partner B's token naming Partner A is still Partner B, and the storm doesn't exist, so Levee refuses it.
  const res = await POST(call("/api/proofs", { method: "POST", body: upload("partner-a"), token: "b-secret" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /No event storm-1/);
});

test("proof images must be base64 bytes, never a path or anything else, and within limits", async () => {
  const { POST } = await route("proofs");
  const send = async (fields: object) => {
    const res = await POST(call("/api/proofs", { method: "POST", body: JSON.stringify({ eventKey: "storm-1", photos: [], receipts: [], distribution: [], ...fields }), token: "a-secret" }));
    return [res.status, (await res.json()).error];
  };
  const photo = (bytes: unknown) => ({ photos: [{ id: "p1", caption: "Shelter", bytes }] });
  // A string sharp would open as a file on this server, and Node's own Buffer JSON, are both refused.
  assert.deepEqual(await send(photo("/etc/hosts")), [400, "Photo 1: bytes must be the file as base64"]);
  assert.deepEqual(await send(photo({ type: "Buffer", data: [1, 2] })), [400, "Photo 1: bytes must be the file as base64"]);
  assert.deepEqual(await send(photo("A".repeat(21 * 1024 * 1024))), [400, "Photo 1: files must be 15 MB or less"]);
  assert.deepEqual(await send({ photos: Array(31).fill({}) }), [400, "Send at most 30 photos"]);
  assert.deepEqual(await send({ receipts: [{ id: "r1", number: "1", vendor: "Shop", date: "2024-09-27", item: "Water", quantity: -1, total: 5, currency: "USD", image: "AAAA" }] }), [400, "Receipt 1: quantity must be a number, 0 or more"]);
  assert.deepEqual(await send({ distribution: [{ beneficiaryId: "H-1", item: "Water", quantity: 2, date: "2024-09-27" }] }), [400, "Distribution row 1: location is required, in up to 200 characters"]);
  // A well-formed upload gets past the checks to Levee, which knows no such storm.
  const [status, error] = await send({ ...photo("AAAA"), sample: true });
  assert.equal(status, 400);
  assert.match(error, /No event storm-1/);
});

test("a partner reads only its own storms", async () => {
  const { GET } = await route("responder");
  assert.equal((await GET(call("/api/responder"))).status, 401);
  const res = await GET(call("/api/responder", { token: "a-secret" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test("the hourly job needs its secret, and the webhook waits for PayPal settings", async () => {
  assert.equal((await (await route("tick")).POST(call("/api/tick", { method: "POST" }))).status, 401);
  assert.equal((await (await route("webhooks/paypal")).POST(call("/api/webhooks/paypal", { method: "POST", body: "{}" }))).status, 503);
});

test("public reads: the Reserve, and an unknown storm", async () => {
  const reserve = await (await route("reserve")).GET();
  assert.deepEqual(await reserve.json(), { currency_code: "USD", value: "0.00" });
  const event = await (await route("events/[eventKey]")).GET(call("/api/events/nope"), params({ eventKey: "nope" }));
  assert.equal(event.status, 404);
});

test("a pledge: confirm, PayPal approval, then only that browser sees its activity", async () => {
  const policy = policyFrom({ amountPerEvent: 25, annualCap: 100, currency: "USD", hazardsAsked: ["cyclone"], coveredRegionAsked: true, otherPlacesAsked: [], preference: null, reserveMonthly: null, ambiguous: false });
  const confirm = (await route("pledges/confirm")).POST;

  const tampered = await confirm(call("/api/pledges/confirm", { method: "POST", body: JSON.stringify({ policy: { ...policy, amountPerEvent: { currency_code: "USD", value: "999.00" } }, confirmedHash: cardHash(policy) }) }));
  assert.equal(tampered.status, 400);
  assert.equal((await confirm(call("/api/pledges/confirm", { method: "POST", body: "not json" }))).status, 400);

  const confirmed = await confirm(call("/api/pledges/confirm", { method: "POST", body: JSON.stringify({ policy, confirmedHash: cardHash(policy) }) }));
  assert.equal(confirmed.status, 200);
  const cookie = confirmed.headers.get("set-cookie")!.split(";")[0];
  const donorId = cookie.split("=")[1];
  assert.match(cookie, /^levee_demo=[0-9a-f-]{36}$/);
  assert.match(confirmed.headers.get("set-cookie")!, /HttpOnly/);
  const { setupTokenId, approveUrl } = await confirmed.json();
  assert.ok(approveUrl.includes(setupTokenId));

  const approved = await (await route("pledges/approved")).GET(call(`/api/pledges/approved?approval_token_id=${setupTokenId}`));
  assert.equal(approved.status, 303);
  assert.equal(approved.headers.get("location"), "http://localhost:3000/donor");
  const saved = JSON.parse(readFileSync(store, "utf8"));
  const pledge = Object.entries(saved.kv).find(([key]) => key.startsWith("pledge:"))?.[1] as { donorId: string; amountPerEvent: { value: string } };
  assert.equal(pledge.donorId, donorId);
  assert.equal(pledge.amountPerEvent.value, "25.00");
  assert.ok(saved.ledger.some((r: { kind: string }) => r.kind === "vault_saved"));

  const activity = (await route("donors/[id]/activity")).GET;
  const mine = await activity(call(`/api/donors/${donorId}/activity`, { cookie }), params({ id: donorId }));
  assert.equal(mine.status, 200);
  assert.deepEqual(await mine.json(), []);
  const other = "00000000-0000-0000-0000-000000000000";
  assert.equal((await activity(call(`/api/donors/${other}/activity`, { cookie }), params({ id: other }))).status, 403);
  assert.equal((await activity(call(`/api/donors/${donorId}/activity`), params({ id: donorId }))).status, 403);
});

test("accounts: only JSON is accepted, and without Supabase they say so instead of failing", async () => {
  const names = ["signup", "login", "logout", "forgot", "password"];
  const routes = await Promise.all(names.map((n) => route(`auth/${n}`)));
  for (const [i, { POST }] of routes.entries()) {
    // A form posted from another site can't send JSON, so it can't log anyone in or out.
    const form = new Request(`http://localhost:3000/api/auth/${names[i]}`, { method: "POST", body: "email=a&password=b", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal((await POST(form)).status, 415, names[i]);
    const off = await POST(call(`/api/auth/${names[i]}`, { method: "POST", body: "{}" }));
    assert.deepEqual([off.status, await off.json()], [503, { error: "Accounts aren't set up on this server yet." }], names[i]);
  }
  const me = await (await route("auth/me")).GET(call("/api/auth/me"));
  assert.deepEqual([me.status, await me.json()], [200, { account: null }], "every page asks, so it's not an error");

  const { GET } = await import("../app/auth/confirm/route.ts");
  const link = await GET(call("/auth/confirm?code=abc&next=/run"));
  assert.deepEqual([link.status, link.headers.get("location"), link.headers.getSetCookie()], [303, "http://localhost:3000/login?link=expired", []]);
});

test("reviewing responders: ops only, and it needs Supabase, where responders are kept", async () => {
  const list = await route("ops/responders");
  const decide = await route("ops/responders/[userId]");
  const id = "1a2b3c4d-0000-4000-8000-00000000000a";
  const body = JSON.stringify({ decision: "reject", reason: "test", by: "lead" });
  assert.equal((await list.GET(call("/api/ops/responders"))).status, 401);
  assert.equal((await list.GET(call("/api/ops/responders", { token: "a-secret" }))).status, 401, "a partner token isn't ops");
  assert.equal((await decide.POST(call(`/api/ops/responders/${id}`, { method: "POST", body }), params({ userId: id }))).status, 401);
  const off = await list.GET(call("/api/ops/responders", { token: "ops-secret" }));
  assert.deepEqual([off.status, await off.json()], [503, { error: "Accounts aren't set up on this server yet." }]);
});

test("accounts: Supabase's login cookies are httpOnly, and last until the browser closes unless remembered", async (t) => {
  const userId = "5f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
  const browserId = "0b9f3c1e-2d4a-4f6b-8c7d-9e0a1b2c3d4e";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "ana@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-08T12:00:00Z" };
  const jwt = [{ alg: "HS256", typ: "JWT" }, { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }, "sig"].map((p) => Buffer.from(typeof p === "string" ? p : JSON.stringify(p)).toString("base64url")).join(".");
  const profile = { user_id: userId, role: "donor", name: "Ana", donor_id: browserId, pledge: { amount: 10, cap: 60, timing: "early" }, organisation: null };
  const asked: string[] = [];
  // Supabase's HTTP API, faked: no keys and no network.
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    asked.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/auth/v1/token") return Response.json({ access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "refresh-1", user });
    if (url.pathname === "/auth/v1/user") return Response.json(user);
    if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (url.pathname === "/rest/v1/levee_profiles") return Response.json(new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object") ? profile : [profile]);
    return new Response("unexpected", { status: 500 });
  });
  Object.assign(process.env, { SUPABASE_URL: "http://supabase.test", SUPABASE_ANON_KEY: "anon-test", SUPABASE_SERVICE_ROLE_KEY: "service-test" });
  t.after(() => {
    for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
    delete (globalThis as { __leveeSupabase?: unknown }).__leveeSupabase;
  });
  const [login, me, logout] = await Promise.all(["auth/login", "auth/me", "auth/logout"].map(route));
  const body = (remember: boolean) => JSON.stringify({ email: "Ana@example.com", password: "correct horse", remember });

  const short = await login.POST(call("/api/auth/login", { method: "POST", body: body(false) }));
  assert.equal(short.status, 200);
  assert.equal((await short.json()).account.donorId, browserId);
  const set = short.headers.getSetCookie();
  assert.deepEqual(set.map((c: string) => c.replace(/=[^;]+;/, "=…;")), [
    "levee_short=…; Path=/; HttpOnly; SameSite=Lax",
    "sb-supabase-auth-token=…; Path=/; HttpOnly; SameSite=Lax",
    "levee_demo=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
  ]);
  assert.ok(set[2].startsWith(`levee_demo=${browserId};`), "the donor id is the account's");
  const jar = set.map((c: string) => c.split(";")[0]).join("; ");

  const who = await me.GET(call("/api/auth/me", { cookie: jar }));
  assert.equal((await who.json()).account.email, "ana@example.com");

  const out = await logout.POST(call("/api/auth/logout", { method: "POST", body: "{}", cookie: jar }));
  assert.deepEqual(out.headers.getSetCookie().map((c: string) => c.replace(/=[^;]*;/, "=;")), [
    "sb-supabase-auth-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    "levee_demo=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    "levee_short=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  ]);

  const remembered = (await login.POST(call("/api/auth/login", { method: "POST", body: body(true) }))).headers.getSetCookie();
  assert.equal(remembered[0], "levee_short=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  assert.match(remembered[1], /^sb-supabase-auth-token=base64-[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=34560000$/);
  assert.ok(asked.includes("POST /auth/v1/logout?scope=local"), "logging out ends only this browser's session");
});

test("pledging needs a logged-in donor once accounts are set up; ops may too, responders may not, nor give once", async (t) => {
  const userId = "7a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "ana@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-10T12:00:00Z" };
  const jwt = [{ alg: "HS256", typ: "JWT" }, { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }, "sig"].map((p) => Buffer.from(typeof p === "string" ? p : JSON.stringify(p)).toString("base64url")).join(".");
  let profile: Record<string, unknown> = { user_id: userId, role: "donor", name: "Ana", donor_id: null, pledge: { amount: 10, cap: 60, timing: "early" }, organisation: null };
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/auth/v1/token") return Response.json({ access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "refresh-1", user });
    if (url.pathname === "/auth/v1/user") return Response.json(user);
    if (url.pathname === "/rest/v1/levee_profiles") return Response.json(new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object") ? profile : [profile]);
    return new Response("unexpected", { status: 500 });
  });
  Object.assign(process.env, { SUPABASE_URL: "http://supabase.test", SUPABASE_ANON_KEY: "anon-test", SUPABASE_SERVICE_ROLE_KEY: "service-test" });
  t.after(() => {
    for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "LEVEE_OPS_EMAILS"]) delete process.env[k];
    delete (globalThis as { __leveeSupabase?: unknown }).__leveeSupabase;
  });
  const [chat, confirm, login] = await Promise.all(["pledges/chat", "pledges/confirm", "auth/login"].map(route));
  // An empty conversation is refused after the login check, so a 400 here means the check let them through, with no Claude call.
  const ask = (cookie?: string) => chat.POST(call("/api/pledges/chat", { method: "POST", body: JSON.stringify({ turns: [] }), ...(cookie && { cookie }) }));

  const out = await ask();
  assert.deepEqual([out.status, (await out.json()).error], [401, "Log in to pledge. New here? Signing up takes a minute."]);
  assert.equal((await confirm.POST(call("/api/pledges/confirm", { method: "POST", body: "{}" }))).status, 401);

  const logIn = async () => {
    const res = await login.POST(call("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "ana@example.com", password: "correct horse", remember: true }) }));
    return res.headers.getSetCookie().map((c: string) => c.split(";")[0]).join("; ");
  };
  const donor = await logIn();
  assert.equal((await ask(donor)).status, 400, "a donor gets past the login check");

  // Giving once: open to anyone logged out and to donors, never to a responder's account.
  const { refuseResponder, RESPONDERS_DONT_GIVE } = await import("./supabaseAuth.ts");
  const give = (cookie?: string) => refuseResponder(call("/api/give", { method: "POST", body: "{}", ...(cookie && { cookie }) }));
  await give();
  await give(donor);

  profile = { ...profile, role: "responder", pledge: null, organisation: { region: "FL", actions: [], households: 10, payoutEmail: "a@example.com", status: "approved" } };
  const asResponder = await logIn();
  const responder = await ask(asResponder);
  assert.deepEqual([responder.status, (await responder.json()).error], [403, "Pledges are made from a donor account. Log in as a donor to pledge."]);
  await assert.rejects(give(asResponder), (err: { message: string; status: number }) => err.status === 403 && err.message === RESPONDERS_DONT_GIVE);

  process.env.LEVEE_OPS_EMAILS = "ana@example.com";
  assert.equal((await ask(await logIn())).status, 400, "ops may run demos");
});
