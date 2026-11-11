"use client";

import { useState } from "react";
import { postAuth } from "@/lib/account";
import { PasswordField } from "./Fields";
import { AsidePanel, AsideStats, AuthShell, FormError, SubmitButton, SuccessPanel } from "./shared";

/** Opened from a reset email: the link has already logged the person in (src/app/auth/confirm), so only the new password is asked. */
export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      document.getElementById("password")?.focus();
      return;
    }
    setStatus("loading");
    setFormError(null);
    const result = await postAuth("password", { password });
    if (!result.ok) {
      setStatus("idle");
      setFormError(result.error);
      return;
    }
    setStatus("done");
  };

  return (
    <AuthShell
      aside={
        <AsidePanel title="A new password, and you're back.">
          <AsideStats />
        </AsidePanel>
      }
    >
      {status === "done" ? (
        <SuccessPanel title="Your new password is saved" next={{ href: "/", label: "Back to the homepage" }} />
      ) : (
        <form noValidate onSubmit={onSubmit}>
          <h1 className="font-display text-[clamp(36px,4vw,52px)] text-ink">Choose a new password</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-body">You&rsquo;ll use it the next time you log in.</p>
          <div className="mt-6">
            <PasswordField
              id="password"
              label="New password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError(undefined);
              }}
              error={error}
              hint="At least 8 characters."
              autoComplete="new-password"
            />
          </div>
          <SubmitButton loading={status === "loading"} className="mt-6">
            Save password
          </SubmitButton>
          <FormError text={formError} />
        </form>
      )}
    </AuthShell>
  );
}
