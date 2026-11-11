"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import StoryCard from "@/components/ui/StoryCard";
import WordReveal from "@/components/motion/WordReveal";
import RoleToggle, { type Role } from "./RoleToggle";
import { CheckboxField, PasswordField, TextField } from "./Fields";
import { postAuth, type Account } from "@/lib/account";
import {
  AsidePanel,
  AsideStats,
  AuthShell,
  BEATS,
  Divider,
  EMAIL,
  FormError,
  Note,
  PayPalButton,
  SandboxBadge,
  SubmitButton,
  SuccessPanel,
  SwitchLink,
} from "./shared";

const SUB: Record<Role, string> = {
  donor: "Log in to see your pledges, the notices before each charge, and where every dollar went.",
  responder: "Log in to your responder console: allocations, proof uploads and payout status.",
};

const ASIDE_SUB: Record<Role, string> = {
  donor: "Sentinel reads GDACS alerts and GloFAS forecasts every hour. When a playbook is met, you hear from us before any charge.",
  responder: "When a storm meets the playbook, tranche 1 lands in your PayPal account before landfall. Tranche 2 follows your proof.",
};

function LoginAside({ role }: { role: Role }) {
  return (
    <AsidePanel title="While you were away, *Sentinel* kept watch.">
      <AnimatePresence mode="wait">
        <motion.div
          key={role}
          className="mt-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
        >
          <p className="max-w-[44ch] text-[15px] leading-relaxed text-white/80">{ASIDE_SUB[role]}</p>
          <div className="mt-8 flex flex-col gap-3">
            {BEATS[role].map((beat, i) => (
              <motion.div
                key={beat.title}
                className="w-[300px] max-w-full"
                style={{ marginLeft: ["0px", "56px", "24px"][i] }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 140, damping: 18 }}
              >
                <StoryCard {...beat} />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
      <AsideStats />
    </AsidePanel>
  );
}

/** `next`: the page that sent them here to log in, such as /pledge. A donor goes straight back to it. */
export default function LoginScreen({ initialRole = "donor", linkExpired = false, next }: { initialRole?: Role; linkExpired?: boolean; next?: string }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);
  // An email link that had expired, or was used already, comes back here (src/app/auth/confirm).
  const [formError, setFormError] = useState<string | null>(linkExpired ? "That link has expired or was already used. Log in, or ask for a new link." : null);
  const [account, setAccount] = useState<Account | null>(null);

  const onForgot = async () => {
    if (!EMAIL.test(email.trim())) {
      setErrors({ email: "Enter your email, then press Forgot password again." });
      document.getElementById("email")?.focus();
      return;
    }
    setFormError(null);
    setNote("Sending\u2026");
    const result = await postAuth("forgot", { email: email.trim() });
    if (!result.ok) {
      setNote(null);
      setFormError(result.error);
      return;
    }
    // The same words whether or not the email has an account, so nobody can use this to find out.
    setNote(`If ${email.trim()} has a LEVee account, we\u2019ve emailed it a link to choose a new password.`);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!EMAIL.test(email.trim())) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setStatus("loading");
    setFormError(null);
    const result = await postAuth("login", { email: email.trim(), password, remember });
    if (!result.ok) {
      setStatus("idle");
      setFormError(result.error);
      return;
    }
    // Back to the page that asked them to log in. Responders don't pledge, so they see their own next step instead.
    if (next && (result.account?.role === "donor" || result.account?.role === "ops")) {
      window.location.assign(next);
      return;
    }
    setAccount(result.account);
    setStatus("done");
  };

  return (
    <AuthShell aside={<LoginAside role={role} />}>
      <AnimatePresence mode="wait">
        {status === "done" ? (
          // The account's own role decides where to go next, whichever way the toggle was set.
          <SuccessPanel
            title={account ? `You're logged in, ${account.name}` : "You're logged in"}
            next={
              account?.role === "ops"
                ? { href: "/ops", label: "Open the ops screen" }
                : account?.role === "responder"
                  ? { href: "/responder", label: "Open the responder console" }
                  : { href: "/donor", label: "Open your notices" }
            }
          >
            {account?.organisation && (
              <p className="mx-auto mt-3 max-w-[40ch] rounded-2xl bg-sky px-4 py-3 text-[14px] font-medium text-ink">
                {account.organisation.status === "approved"
                  ? "Your organisation is approved. When a storm meets the playbook, LEVee can pay you before landfall."
                  : account.organisation.status === "rejected"
                    ? `Your organisation wasn\u2019t approved${account.organisation.review?.reason ? `: ${account.organisation.review.reason}` : "."}`
                    : "Your organisation is waiting for review. A person checks every organisation before it can receive funds."}
              </p>
            )}
          </SuccessPanel>
        ) : (
          <motion.form
            key="form"
            noValidate
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ type: "spring", stiffness: 140, damping: 18 }}
          >
            <SandboxBadge />
            <WordReveal play as="h1" text="Welcome *back*" className="font-display mt-4 text-[clamp(36px,4vw,52px)]" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={role}
                className="mt-3 text-[15px] leading-relaxed text-body"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {SUB[role]}
              </motion.p>
            </AnimatePresence>

            {next && (
              <p className="mt-4 rounded-2xl bg-ice-soft px-4 py-3 text-[14px] leading-relaxed text-ink">
                Log in to {next.startsWith("/run") ? "run the live PayPal demo" : "pledge"}. Just want to give once?{" "}
                <Link href="/give" className="font-semibold text-link hover:underline">
                  Give now, no account needed
                </Link>
              </p>
            )}

            <div className="mt-6">
              <RoleToggle value={role} onChange={setRole} />
            </div>

            <div className="mt-6 space-y-4">
              <TextField
                id="email"
                type="email"
                label={role === "responder" ? "Work email" : "Email"}
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setErrors((e) => ({ ...e, email: undefined }));
                }}
                error={errors.email}
                autoComplete="email"
                placeholder={role === "responder" ? "you@organisation.org" : "you@example.com"}
              />
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  setErrors((e) => ({ ...e, password: undefined }));
                }}
                error={errors.password}
                autoComplete="current-password"
                aside={
                  <button
                    type="button"
                    onClick={() => void onForgot()}
                    className="text-[13px] font-semibold text-link hover:underline"
                  >
                    Forgot password?
                  </button>
                }
              />
              <CheckboxField id="remember" checked={remember} onChange={setRemember}>
                Keep me logged in on this device
              </CheckboxField>
            </div>

            <SubmitButton loading={status === "loading"} className="mt-6">
              Log in
            </SubmitButton>
            <FormError text={formError} />
            <div className="mt-5">
              <Divider />
            </div>
            <div className="mt-5">
              <PayPalButton onClick={() => setNote("Continue with PayPal switches on once the payments module is connected.")} />
            </div>
            <Note text={note} />
            <SwitchLink
              text="New to LEVee?"
              cta="Create an account"
              href={role === "responder" ? "/signup?role=responder" : next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            />
            {/* Ops accounts come from LEVEE_OPS_EMAILS, not a choice on this form, so there's no ops option: the account decides. */}
            <p className="mt-2 text-center text-[13px] text-[#5f6b7a]">LEVee team? Log in with your ops email.</p>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}
