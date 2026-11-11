import { randomUUID } from "node:crypto";
import type { AuthError, EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { MAX_ANNUAL_CAP, MAX_PER_EVENT, MIN_PER_EVENT } from "../../../backend/agents/src/concierge/policy.ts";
import { RequestError } from "./http.ts";
import { check } from "./supabaseStore.ts";

/**
 * Donor and responder accounts. Supabase Auth keeps the email and password, sends the confirmation and reset emails, and
 * holds the session; levee_profiles (supabase/migrations/0002_levee_profiles.sql) keeps the rest.
 * It knows nothing about routes or cookies: it's handed this browser's Supabase Auth client (src/server/supabaseAuth.ts)
 * and the server's own database client, so the tests can pass fakes.
 */

export type Role = "donor" | "responder";
export type PledgeTerms = { amount: number; cap: number; timing: "early" | "confirmed" };
/** What Levee needs to pay a responder, which ops fill in when approving it (src/server/responders.ts). */
export type PartnerDetails = { area: { name: string; lat: number; lon: number }; radiusKm: number; capacityUsd: number; utcOffsetMinutes: number };
export type Organisation = {
  region: string;
  actions: string[];
  households: number;
  payoutEmail: string;
  status: "pending_review" | "approved" | "rejected";
  partner?: PartnerDetails;
  review?: { by: string; at: string; reason?: string };
};
/** What the browser may see about an account. Ops are logins listed in LEVEE_OPS_EMAILS, with no profile. */
export type PublicAccount = { email: string; name: string; role: Role | "ops"; donorId?: string; pledge?: PledgeTerms; organisation?: Omit<Organisation, "review"> & { review?: { at: string; reason?: string } } };

export type SignUp = {
  role: Role;
  name: string;
  email: string;
  password: string;
  pledge?: Partial<PledgeTerms>;
  organisation?: Partial<Omit<Organisation, "status">>;
  /** The donor id this browser already has, from /run, so a pledge saved there carries over. */
  donorId?: string;
};

/** The parts of Supabase Auth accounts use. */
export type Auth = Pick<SupabaseClient["auth"], "signUp" | "signInWithPassword" | "getUser" | "signOut" | "resetPasswordForEmail" | "updateUser" | "exchangeCodeForSession" | "verifyOtp">;
type Profile = { user_id: string; role: Role; name: string; donor_id: string | null; pledge: PledgeTerms | null; organisation: Organisation | null };

const REGIONS = ["US Gulf Coast"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LINK_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];
const WRONG = "Email or password is wrong.";
const TAKEN = "An account with this email already exists. Log in instead.";

const bad = (message: string, status = 400) => new RequestError(message, status);

/** Supabase Auth's answers, as messages a person can act on. Anything unexpected stays a server error. */
function authError(error: AuthError): Error {
  // Supabase's built-in email service only sends a few emails an hour, so sign-ups can run into it during a demo.
  if (error.code === "over_email_send_rate_limit") return bad("We've sent too many emails from this site for now. Try again in an hour.", 429);
  if (error.status === 429 || error.code?.startsWith("over_")) return bad("Too many attempts. Try again later.", 429);
  switch (error.code) {
    // Supabase checks an address can really receive mail: "gk@gmail.com" is refused, as Gmail names have 6 characters or more.
    case "email_address_invalid":
      return bad("That email address can't receive mail. Use one you can open.");
    // Without its own email service set up, Supabase only emails the project team's addresses.
    case "email_address_not_authorized":
      return bad("This site can't email that address yet. Use a team member's email, or set up custom email in Supabase.", 403);
    case "signup_disabled":
      return bad("New accounts are turned off right now.", 403);
    case "invalid_credentials":
      return bad(WRONG, 401);
    case "email_not_confirmed":
      return bad("Confirm your email first: open the link we sent you.", 403);
    case "user_already_exists":
    case "email_exists":
      return bad(TAKEN, 409);
    case "weak_password":
      return bad(error.message);
    case "same_password":
      return bad("Choose a password different from your old one.");
    case "session_not_found":
    case "session_expired":
      return bad("Your link has expired. Ask for a new one.", 401);
  }
  return new Error(`Supabase Auth: ${error.message}`);
}

function cleanEmail(value: unknown, field = "email") {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) throw bad(`Enter a valid ${field === "email" ? "email address" : "PayPal email"}.`);
  return email;
}

function checkPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 8) throw bad("Use at least 8 characters for your password.");
  if (value.length > 200) throw bad("Use at most 200 characters for your password.");
  return value;
}

function checkPledge(p: SignUp["pledge"]): PledgeTerms {
  const amount = Number(p?.amount);
  const cap = Number(p?.cap);
  if (!Number.isFinite(amount) || amount < MIN_PER_EVENT || amount > MAX_PER_EVENT) throw bad(`Choose between $${MIN_PER_EVENT} and $${MAX_PER_EVENT} per hurricane.`);
  if (!Number.isFinite(cap) || cap < amount || cap > MAX_ANNUAL_CAP) throw bad(`Choose a yearly cap between your amount and $${MAX_ANNUAL_CAP}.`);
  if (p?.timing !== "early" && p?.timing !== "confirmed") throw bad("Choose when you want to be charged.");
  return { amount, cap, timing: p.timing };
}

function checkOrganisation(o: SignUp["organisation"]): Organisation {
  if (!o || !REGIONS.includes(String(o.region))) throw bad("Pick the region you serve.");
  const actions = Array.isArray(o.actions) ? o.actions.filter((a): a is string => typeof a === "string" && a.length > 0 && a.length <= 100) : [];
  if (!actions.length || actions.length > 10) throw bad("Pick at least one early action you run.");
  const households = Number(o.households);
  if (!Number.isInteger(households) || households < 1 || households > 1_000_000) throw bad("Enter how many households you reach per storm.");
  return { region: String(o.region), actions, households, payoutEmail: cleanEmail(o.payoutEmail, "payoutEmail"), status: "pending_review" };
}

// An allow-list, so a column added to levee_profiles later never reaches the browser by accident. Who reviewed it stays private.
const publicView = (email: string, p: Profile): PublicAccount => {
  const { review, ...organisation } = p.organisation ?? ({} as Organisation);
  return {
    email,
    name: p.name,
    role: p.role,
    ...(p.donor_id && { donorId: p.donor_id }),
    ...(p.pledge && { pledge: p.pledge }),
    ...(p.organisation && { organisation: { ...organisation, ...(review && { review: { at: review.at, ...(review.reason && { reason: review.reason }) } }) } }),
  };
};

const opsView = (email: string): PublicAccount => ({ email, name: email.split("@")[0], role: "ops" });

/** `opsEmails`: the logins that are ops. Made in the Supabase dashboard, never by signing up. */
export function createAccounts(auth: Auth, db: SupabaseClient, opsEmails: string[] = []) {
  const isOps = (email: string | undefined) => Boolean(email && opsEmails.includes(email.toLowerCase()));
  const profiles = () => db.from("levee_profiles");
  const profileOf = async (userId: string) => check(await profiles().select("*").eq("user_id", userId).maybeSingle<Profile>());

  /** The logged-in user and their profile, or null. */
  async function current() {
    const { data } = await auth.getUser();
    if (!data.user) return null;
    const email = data.user.email ?? "";
    if (isOps(email)) return { userId: data.user.id, account: opsView(email) };
    const profile = await profileOf(data.user.id);
    return profile ? { userId: data.user.id, account: publicView(email, profile) } : null;
  }

  return {
    /**
     * Creates the login and its profile. The account comes back only if Supabase logged it straight in; with email
     * confirmation on (Supabase's default) it's null, and the person logs in from the link in their email.
     */
    async signUp(input: SignUp, confirmUrl: string): Promise<{ account: PublicAccount | null }> {
      const role = input.role;
      if (role !== "donor" && role !== "responder") throw bad("Choose donor or responder.");
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name || name.length > 100) throw bad(role === "donor" ? "Tell us your name." : "Enter your organisation's name.");
      const email = cleanEmail(input.email);
      const password = checkPassword(input.password);
      const details = role === "donor" ? { pledge: checkPledge(input.pledge), organisation: null } : { pledge: null, organisation: checkOrganisation(input.organisation) };

      const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: confirmUrl } });
      if (error) throw authError(error);
      // With confirmation on, Supabase hides whether an email is taken: it sends nothing and returns a user with no identities.
      const user = data.user;
      if (!user?.identities?.length) return { account: null };

      // Only a new or still unconfirmed login gets here, so a second sign-up before confirming replaces the first's details.
      const save = (donorId: string | null) => profiles().upsert({ user_id: user.id, role, name, donor_id: donorId, ...details }, { onConflict: "user_id" });
      // The browser's own donor id carries over, unless another account already owns it (donor_id is unique).
      const own = role === "donor" && input.donorId && UUID.test(input.donorId) ? input.donorId : undefined;
      let reply = await save(role === "donor" ? (own ?? randomUUID()) : null);
      if (own && reply.error?.code === "23505") reply = await save(randomUUID());
      try {
        check(reply);
      } catch (err) {
        // A login without a profile couldn't do anything, so it's removed and the person can simply sign up again.
        await db.auth.admin.deleteUser(user.id);
        throw err;
      }
      if (!data.session) return { account: null };
      const profile = await profileOf(user.id);
      return { account: profile && publicView(email, profile) };
    },

    async logIn(input: { email: unknown; password: unknown }): Promise<PublicAccount> {
      const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
      const password = typeof input.password === "string" ? input.password : "";
      if (!email || !password || password.length > 200) throw bad(WRONG, 401);
      const { data, error } = await auth.signInWithPassword({ email, password });
      if (error) throw authError(error);
      if (isOps(data.user.email)) return opsView(data.user.email!);
      const profile = await profileOf(data.user.id);
      if (!profile) {
        // A login made in the Supabase dashboard, not on /signup.
        await auth.signOut({ scope: "local" });
        throw bad("This login has no LEVee account. Sign up first.", 403);
      }
      return publicView(data.user.email ?? email, profile);
    },

    /** The logged-in account, or null. */
    whoIs: async () => (await current())?.account ?? null,

    /** The logged-in ops person's email, or null. */
    opsEmail: async () => {
      const me = await current();
      return me?.account.role === "ops" ? me.account.email : null;
    },

    /** The partner id of a logged-in, approved responder: their user id. Null for anyone else. */
    partnerId: async () => {
      const me = await current();
      return me?.account.role === "responder" && me.account.organisation?.status === "approved" ? me.userId : null;
    },

    /** Emails a link to choose a new password. It answers the same whether or not the email has an account. */
    async forgot(email: unknown, resetUrl: string) {
      const { error } = await auth.resetPasswordForEmail(cleanEmail(email), { redirectTo: resetUrl });
      if (error) throw authError(error);
    },

    /** Sets a new password for the logged-in user: someone who's just opened their reset link. */
    async setPassword(password: unknown) {
      const checked = checkPassword(password);
      const { data } = await auth.getUser();
      if (!data.user) throw bad("Your link has expired. Ask for a new one.", 401);
      const { error } = await auth.updateUser({ password: checked });
      if (error) throw authError(error);
    },

    /** Logs in from an email link: a code (Supabase's default links) or a token hash (custom email templates). */
    async confirm(link: { code?: string | null; tokenHash?: string | null; type?: string | null }) {
      const type = LINK_TYPES.find((t) => t === link.type);
      const reply = link.code ? await auth.exchangeCodeForSession(link.code) : link.tokenHash && type ? await auth.verifyOtp({ token_hash: link.tokenHash, type }) : undefined;
      if (!reply || reply.error) throw bad("This link has expired or was already used. Ask for a new one.");
      return (await current())?.account ?? null;
    },

    /**
     * The terms a PayPal save should use. A logged-in donor's come from their account, unless they've just described new
     * ones (on /pledge), which are checked here. Null for anyone else, who keeps choosing in the page.
     */
    async termsFor(asked: Partial<PledgeTerms> | undefined): Promise<{ userId: string; terms: PledgeTerms; changed: boolean } | null> {
      const me = await current();
      if (me?.account.role !== "donor") return null;
      if (asked?.amount !== undefined) return { userId: me.userId, terms: checkPledge(asked), changed: true };
      return me.account.pledge ? { userId: me.userId, terms: me.account.pledge, changed: false } : null;
    },

    /** Replaces a donor's pledge terms, once PayPal has saved their account with them. */
    async setPledge(userId: string, terms: PledgeTerms) {
      if ((await profileOf(userId))?.role !== "donor") throw bad("Only a donor account has a pledge.");
      check(await profiles().update({ pledge: checkPledge(terms) }).eq("user_id", userId));
    },

    /** Ends this browser's session only, so their other devices stay logged in. */
    async logOut() {
      await auth.signOut({ scope: "local" });
    },
  };
}

export type Accounts = ReturnType<typeof createAccounts>;
