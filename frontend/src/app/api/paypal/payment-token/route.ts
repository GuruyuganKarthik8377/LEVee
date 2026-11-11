import { log, newRun, sessionFor, withStore } from "@/lib/liveStore";
import { createPaymentToken, paypalRoute } from "@/lib/paypal";
import { dollars } from "@/lib/rules";
import type { PledgeTerms } from "@/server/accounts";
import { handle, RequestError, withCookies } from "@/server/http";
import { requireGiver } from "@/server/supabaseAuth";

const whole = (value: unknown, fallback: number, max: number) => {
  const n = Math.round(Number(value) * 100);
  return Number.isFinite(n) && n >= 500 && n <= max ? n : fallback;
};

export const POST = (request: Request) =>
  handle(async () => {
    // A logged-in donor or ops person only. Checked before PayPal is asked, so nobody else can save an account here.
    const { signedIn } = await requireGiver(request);
    return paypalRoute(() => save(request, signedIn));
  });

/** Saves the account PayPal approved, with the pledge it is for. */
async function save(request: Request, signedIn: Awaited<ReturnType<typeof requireGiver>>["signedIn"]) {
  const { vaultSetupToken, amount, cap, timing } = (await request.json()) as { vaultSetupToken?: string; amount?: number; cap?: number; timing?: PledgeTerms["timing"] };
  if (!vaultSetupToken) return Response.json({ error: "missing_setup_token" }, { status: 400 });
  // A logged-in donor's terms come from their account, or from a pledge they've just described, which is checked first.
  // Without accounts set up, everyone chooses in the page, as before. Supabase may refresh the login, so its cookies go back.
  const cookies = signedIn?.cookies ?? [];
  const account = signedIn
    ? await signedIn.accounts.termsFor(amount === undefined ? undefined : { amount, cap, timing }).catch((err: unknown) => {
        if (err instanceof RequestError) return err;
        throw err;
      })
    : null;
  if (account instanceof RequestError) return withCookies({ error: account.message }, cookies, account.status);
  const { id } = await createPaymentToken(vaultSetupToken);
  if (account?.changed) await signedIn!.accounts.setPledge(account.userId, account.terms);
  // The saved account's token stays on the server, tied to this browser. A production build keeps it in the pledges table.
  return withStore(async (store) => {
    const session = await sessionFor(store);
    const amountCents = account ? Math.round(account.terms.amount * 100) : whole(amount, 1000, 100_000);
    const capCents = account ? Math.round(account.terms.cap * 100) : Math.max(whole(cap, 6000, 500_000), amountCents);
    const confirmed = (account?.terms.timing ?? timing) === "confirmed";
    session.pledge = { amountCents, capCents, paymentToken: id, chargedCents: 0, timing: confirmed ? "confirmed" : "early" };
    session.run = newRun();
    log(session, { tone: "paypal", title: "PayPal saved your account", detail: `Pledge: ${dollars(amountCents)} per hurricane, up to ${dollars(capCents)} a year${confirmed ? ", only once landfall is confirmed" : ""}. Nothing was charged`, ref: id.slice(0, 6) + "…" });
    return withCookies({ status: "SUCCESS" }, cookies);
  });
}
