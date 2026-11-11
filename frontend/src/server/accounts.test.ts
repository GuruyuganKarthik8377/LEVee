// Accounts on a fake Supabase Auth and a fake levee_profiles table: no keys, no network. Run: node --test src/server/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAccounts, type Auth, type SignUp } from "./accounts.ts";
import { fakeSupabase } from "./fakeSupabase.ts";

type User = { id: string; email: string; password: string; confirmed: boolean };
const fail = (code: string, status = 400) => ({ data: { user: null, session: null }, error: { code, status, message: code, name: "AuthApiError" } });

/** Supabase Auth as one browser sees it: who's logged in here, and the emails it would have sent. */
function fakeAuth({ confirmEmails = true } = {}) {
  const users = new Map<string, User>();
  const emails: { to: string; link: string; code: string }[] = [];
  let session: User | null = null;
  let limited = false;
  const view = (u: User) => ({ id: u.id, email: u.email, identities: [{ id: u.id }] });
  const send = (u: User, link: string) => emails.push({ to: u.email, link, code: randomUUID() });
  const open = (code: string) => {
    const at = emails.findIndex((e) => e.code === code);
    if (at < 0) return fail("otp_expired", 403);
    const user = users.get(emails.splice(at, 1)[0].to)!;
    user.confirmed = true;
    session = user;
    return { data: { user: view(user), session: {} }, error: null };
  };
  const auth = {
    async signUp({ email, password, options }: { email: string; password: string; options: { emailRedirectTo: string } }) {
      const known = users.get(email);
      if (known && !confirmEmails) return fail("user_already_exists", 422);
      // Supabase's answer for a confirmed email: a made-up user with no identities, and no email sent.
      if (known?.confirmed) return { data: { user: { id: randomUUID(), email, identities: [] }, session: null }, error: null };
      const user = known ?? { id: randomUUID(), email, password, confirmed: !confirmEmails };
      user.password = password;
      users.set(email, user);
      if (!confirmEmails) return (session = user), { data: { user: view(user), session: {} }, error: null };
      send(user, options.emailRedirectTo);
      return { data: { user: view(user), session: null }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      if (limited) return fail("over_request_rate_limit", 429);
      const user = users.get(email);
      if (!user || user.password !== password) return fail("invalid_credentials");
      if (!user.confirmed) return fail("email_not_confirmed");
      session = user;
      return { data: { user: view(user), session: {} }, error: null };
    },
    getUser: async () => (session ? { data: { user: view(session) }, error: null } : { data: { user: null }, error: { name: "AuthSessionMissingError" } }),
    signOut: async () => ((session = null), { error: null }),
    async resetPasswordForEmail(email: string, { redirectTo }: { redirectTo: string }) {
      const user = users.get(email);
      if (user) send(user, redirectTo);
      return { data: {}, error: null };
    },
    async updateUser({ password }: { password: string }) {
      if (!session) return fail("session_not_found", 401);
      if (session.password === password) return fail("same_password", 422);
      session.password = password;
      return { data: { user: view(session) }, error: null };
    },
    exchangeCodeForSession: async (code: string) => open(code),
    verifyOtp: async ({ token_hash }: { token_hash: string }) => open(token_hash),
  };
  return { auth: auth as unknown as Auth, users, emails, rateLimit: () => (limited = true), loggedIn: () => session?.email ?? null };
}

function setup(options?: { confirmEmails?: boolean; failOn?: string }) {
  const db = fakeSupabase(options?.failOn, { levee_profiles: ["user_id", "donor_id"] });
  const browser = fakeAuth(options);
  return { ...browser, db, accounts: createAccounts(browser.auth, db.client, ["lead@levee.org"]) };
}

const CONFIRM = "http://localhost:3000/auth/confirm?next=%2Frun";
const BROWSER = "0b9f3c1e-2d4a-4f6b-8c7d-9e0a1b2c3d4e";
const DONOR: SignUp = { role: "donor", name: "Ana", email: " Ana@Example.com ", password: "correct horse", pledge: { amount: 10, cap: 60, timing: "early" }, donorId: BROWSER };
const RESPONDER: SignUp = {
  role: "responder",
  name: "Gulf Relief",
  email: "ops@gulfrelief.org",
  password: "another secret",
  organisation: { region: "US Gulf Coast", actions: ["Food and water"], households: 1200, payoutEmail: "Payouts@GulfRelief.org" },
};
const failsWith = async (work: Promise<unknown>, status: number, message: RegExp) =>
  assert.rejects(work, (err: { status?: number; message: string }) => err.status === status && message.test(err.message));
const linkCode = (emails: { code: string }[]) => emails.at(-1)!.code;

test("a donor signs up, confirms their email, and keeps this browser's donor id", async () => {
  const { accounts, emails, db } = setup();
  assert.deepEqual(await accounts.signUp(DONOR, CONFIRM), { account: null }, "not logged in until the email is confirmed");
  assert.deepEqual(emails.map((e) => [e.to, e.link]), [["ana@example.com", CONFIRM]]);
  assert.ok(!JSON.stringify(db.tables.levee_profiles).includes("correct horse"), "the password stays with Supabase Auth");
  await failsWith(accounts.logIn({ email: "ana@example.com", password: "correct horse" }), 403, /Confirm your email first/);

  const account = { email: "ana@example.com", name: "Ana", role: "donor", donorId: BROWSER, pledge: { amount: 10, cap: 60, timing: "early" } };
  assert.deepEqual(await accounts.confirm({ code: linkCode(emails) }), account);
  assert.deepEqual(await accounts.whoIs(), account);
  await failsWith(accounts.confirm({ code: "used-already" }), 400, /expired or was already used/);
  await failsWith(accounts.confirm({ tokenHash: "x", type: "not-a-type" }), 400, /expired/);
});

test("a taken email: a 409 when Supabase logs straight in, and the same answer as a new one when it confirms by email", async () => {
  const direct = setup({ confirmEmails: false });
  assert.equal((await direct.accounts.signUp(DONOR, CONFIRM)).account?.donorId, BROWSER, "logged straight in");
  assert.equal((await direct.accounts.whoIs())?.email, "ana@example.com");
  await failsWith(direct.accounts.signUp({ ...DONOR, email: "ANA@example.com" }, CONFIRM), 409, /already exists/);

  const confirming = setup();
  await confirming.accounts.signUp(DONOR, CONFIRM);
  await confirming.accounts.confirm({ tokenHash: linkCode(confirming.emails), type: "email" });
  const before = structuredClone(confirming.db.tables.levee_profiles);
  assert.deepEqual(await confirming.accounts.signUp({ ...RESPONDER, email: "ana@example.com" }, CONFIRM), { account: null });
  assert.deepEqual(confirming.db.tables.levee_profiles, before, "the existing account is untouched");
  assert.equal(confirming.emails.length, 0, "and nothing is sent");
});

test("login: right password, and the same answer for a wrong password or an unknown email", async () => {
  const { accounts, emails, rateLimit } = setup();
  await accounts.signUp(DONOR, CONFIRM);
  await accounts.confirm({ code: linkCode(emails) });
  await accounts.logOut();
  assert.equal(await accounts.whoIs(), null);

  await failsWith(accounts.logIn({ email: "ana@example.com", password: "wrong password" }), 401, /^Email or password is wrong\.$/);
  await failsWith(accounts.logIn({ email: "nobody@example.com", password: "wrong password" }), 401, /^Email or password is wrong\.$/);
  await failsWith(accounts.logIn({ email: "ana@example.com", password: 42 }), 401, /^Email or password is wrong\.$/);
  assert.equal((await accounts.logIn({ email: " ANA@example.com", password: "correct horse" })).donorId, BROWSER);
  assert.equal((await accounts.whoIs())?.name, "Ana");

  rateLimit();
  await failsWith(accounts.logIn({ email: "ana@example.com", password: "correct horse" }), 429, /Too many attempts/);
});

test("a login made outside /signup, with no profile, is logged back out", async () => {
  const { accounts, users, loggedIn } = setup();
  users.set("staff@example.com", { id: randomUUID(), email: "staff@example.com", password: "dashboard pass", confirmed: true });
  await failsWith(accounts.logIn({ email: "staff@example.com", password: "dashboard pass" }), 403, /no LEVee account/);
  assert.equal(loggedIn(), null);
  assert.equal(await accounts.whoIs(), null);
});

test("a responder's organisation is checked and saved for review, with no donor id", async () => {
  const { accounts, emails } = setup();
  await accounts.signUp({ ...RESPONDER, donorId: BROWSER }, CONFIRM);
  assert.deepEqual(await accounts.confirm({ code: linkCode(emails) }), {
    email: "ops@gulfrelief.org",
    name: "Gulf Relief",
    role: "responder",
    organisation: { region: "US Gulf Coast", actions: ["Food and water"], households: 1200, payoutEmail: "payouts@gulfrelief.org", status: "pending_review" },
  });
  assert.equal(await accounts.termsFor(undefined), null, "a responder has no pledge");
});

test("every field is checked before anything is created", async () => {
  const { accounts, emails, db } = setup();
  const rejects = (input: Partial<SignUp>, message: RegExp) => failsWith(accounts.signUp({ ...DONOR, ...input } as SignUp, CONFIRM), 400, message);
  await rejects({ role: "admin" as never }, /donor or responder/);
  await rejects({ name: "  " }, /your name/);
  await rejects({ email: "not an email" }, /valid email/);
  await rejects({ password: "short" }, /at least 8/);
  await rejects({ password: "x".repeat(201) }, /at most 200/);
  await rejects({ pledge: { amount: 1, cap: 60, timing: "early" } }, /per hurricane/);
  await rejects({ pledge: { amount: 10, cap: 5, timing: "early" } }, /yearly cap/);
  await rejects({ pledge: { amount: 10, cap: 60, timing: "whenever" as never } }, /when you want to be charged/);
  await failsWith(accounts.signUp({ ...RESPONDER, organisation: { ...RESPONDER.organisation, region: "Mars" } }, CONFIRM), 400, /region/);
  await failsWith(accounts.signUp({ ...RESPONDER, organisation: { ...RESPONDER.organisation, actions: [] } }, CONFIRM), 400, /early action/);
  await failsWith(accounts.signUp({ ...RESPONDER, organisation: { ...RESPONDER.organisation, households: 0 } }, CONFIRM), 400, /households/);
  await failsWith(accounts.signUp({ ...RESPONDER, organisation: { ...RESPONDER.organisation, payoutEmail: "nope" } }, CONFIRM), 400, /PayPal email/);
  assert.equal(emails.length, 0);
  assert.equal(db.tables.levee_profiles, undefined);
});

test("a browser's donor id belongs to one account only, and a made-up one is ignored", async () => {
  const { accounts, db } = setup();
  await accounts.signUp(DONOR, CONFIRM);
  await accounts.signUp({ ...DONOR, email: "ben@example.com" }, CONFIRM);
  await accounts.signUp({ ...DONOR, email: "cy@example.com", donorId: "../../etc" }, CONFIRM);
  const ids = db.tables.levee_profiles.map((p) => p.donor_id as string);
  assert.equal(ids[0], BROWSER);
  assert.notEqual(ids[1], BROWSER);
  assert.match(ids[2], /^[0-9a-f-]{36}$/);
  assert.equal(new Set(ids).size, 3);
});

test("if the profile can't be saved, the login is removed so the person can sign up again", async () => {
  const { accounts, db, users } = setup({ failOn: "levee_profiles" });
  await assert.rejects(accounts.signUp(DONOR, CONFIRM), /Supabase: connection refused/);
  assert.deepEqual(db.deletedUsers, [users.get("ana@example.com")!.id]);
});

test("forgot password: a link by email, then a new password", async () => {
  const { accounts, emails } = setup({ confirmEmails: false });
  await accounts.signUp(DONOR, CONFIRM);
  await accounts.logOut();
  const RESET = "http://localhost:3000/auth/confirm?next=%2Freset-password";

  await accounts.forgot("nobody@example.com", RESET);
  assert.equal(emails.length, 0, "no email for an unknown address, and the same answer");
  await failsWith(accounts.forgot("nope", RESET), 400, /valid email/);
  await failsWith(accounts.setPassword("a new password"), 401, /expired/);

  await accounts.forgot("Ana@example.com", RESET);
  assert.equal(emails[0].link, RESET);
  await accounts.confirm({ code: emails[0].code });
  await failsWith(accounts.setPassword("short"), 400, /at least 8/);
  await failsWith(accounts.setPassword("correct horse"), 400, /different from your old one/);
  await accounts.setPassword("a new password");
  await accounts.logOut();
  await failsWith(accounts.logIn({ email: "ana@example.com", password: "correct horse" }), 401, /wrong/);
  assert.equal((await accounts.logIn({ email: "ana@example.com", password: "a new password" })).name, "Ana");
});

test("a logged-in donor's pledge terms, and changing them", async () => {
  const { accounts, db } = setup({ confirmEmails: false });
  assert.equal(await accounts.termsFor(undefined), null, "nobody logged in");
  await accounts.signUp(DONOR, CONFIRM);
  const userId = db.tables.levee_profiles[0].user_id as string;

  assert.deepEqual(await accounts.termsFor(undefined), { userId, terms: { amount: 10, cap: 60, timing: "early" }, changed: false });
  const asked = { amount: 25, cap: 100, timing: "confirmed" as const };
  assert.deepEqual(await accounts.termsFor(asked), { userId, terms: asked, changed: true });
  await failsWith(accounts.termsFor({ amount: 25, cap: 10, timing: "early" }), 400, /yearly cap/);

  await accounts.setPledge(userId, asked);
  assert.deepEqual((await accounts.whoIs())?.pledge, asked);
  await failsWith(accounts.setPledge(randomUUID(), asked), 400, /Only a donor/);
});

test("ops: a login listed as ops needs no profile, and nobody else is ops", async () => {
  const { accounts, users } = setup();
  users.set("lead@levee.org", { id: randomUUID(), email: "lead@levee.org", password: "dashboard pass", confirmed: true });
  assert.deepEqual(await accounts.logIn({ email: "Lead@levee.org", password: "dashboard pass" }), { email: "lead@levee.org", name: "lead", role: "ops" });
  assert.equal((await accounts.whoIs())?.role, "ops");
  assert.equal(await accounts.opsEmail(), "lead@levee.org");
  assert.equal(await accounts.partnerId(), null);
  assert.equal(await accounts.termsFor(undefined), null, "ops have no pledge");
  await accounts.logOut();
  assert.equal(await accounts.opsEmail(), null);

  // Signing up can't make anyone ops: a donor is a donor.
  await accounts.signUp({ ...DONOR, email: "ana@example.com" }, CONFIRM);
  assert.equal(await accounts.opsEmail(), null);
});

test("a responder is a partner only once approved, and never sees who reviewed it", async () => {
  const { accounts, db } = setup({ confirmEmails: false });
  await accounts.signUp(RESPONDER, CONFIRM);
  assert.equal(await accounts.partnerId(), null, "still waiting for review");
  const row = db.tables.levee_profiles[0];
  const partner = { area: { name: "Perry, FL", lat: 30.12, lon: -83.58 }, radiusKm: 150, capacityUsd: 2000, utcOffsetMinutes: -240 };
  row.organisation = { ...(row.organisation as object), status: "approved", partner, review: { by: "lead@levee.org", at: "2026-11-08T12:00:00.000Z" } };
  assert.equal(await accounts.partnerId(), row.user_id);
  assert.deepEqual((await accounts.whoIs())?.organisation?.review, { at: "2026-11-08T12:00:00.000Z" });
});
