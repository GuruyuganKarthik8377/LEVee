"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { StoryIcon } from "@/components/ui/StoryCard";
import WordReveal from "@/components/motion/WordReveal";
import PledgeCard, { pledgeSentence } from "@/components/pledge/PledgeCard";
import RoleToggle, { type Role } from "./RoleToggle";
import { CheckboxField, PasswordField, PasswordStrength, SelectField, TextField } from "./Fields";
import { postAuth } from "@/lib/account";
import {
  AsidePanel,
  AuthShell,
  BEATS,
  donorBeats,
  EMAIL,
  FormError,
  SandboxBadge,
  SubmitButton,
  SuccessPanel,
  SwitchLink,
} from "./shared";

/* ---------------- data ---------------- */

const STEPS: Record<Role, string[]> = {
  donor: ["Account", "Your pledge", "Review"],
  responder: ["Account", "Organisation", "Review"],
};

const AMOUNTS = [5, 10, 25, 50];
const RESPONDER_REGIONS = ["US Gulf Coast"];
const ACTIONS = ["Evacuation transport", "Food and water", "Securing homes", "Cash to households"];

type Values = {
  name: string;
  org: string;
  email: string;
  password: string;
  hazards: string[];
  regions: string[];
  amount: number;
  cap: number;
  timing: "early" | "confirmed";
  region: string;
  actions: string[];
  households: number;
  payoutEmail: string;
  consent: boolean;
};

type Errors = Partial<Record<keyof Values, string>>;

const INITIAL: Values = {
  name: "",
  org: "",
  email: "",
  password: "",
  hazards: ["Hurricanes"],
  regions: ["US Gulf Coast"],
  amount: 10,
  cap: 60,
  timing: "early",
  region: "US Gulf Coast",
  actions: ["Evacuation transport", "Food and water"],
  households: 1200,
  payoutEmail: "",
  consent: false,
};

function validateStep(role: Role, step: number, v: Values): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (role === "donor" && !v.name.trim()) e.name = "Tell us your name.";
    if (role === "responder" && !v.org.trim()) e.org = "Enter your organisation's name.";
    if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid email address.";
    if (v.password.length < 8) e.password = "Use at least 8 characters.";
  }
  if (step === 1 && role === "responder") {
    if (!v.region) e.region = "Pick the region you serve.";
    if (!v.actions.length) e.actions = "Pick at least one early action you run.";
    if (!EMAIL.test(v.payoutEmail.trim())) e.payoutEmail = "Enter the PayPal email for payouts.";
  }
  if (step === 2 && !v.consent) e.consent = "Please confirm to continue.";
  return e;
}

/* ---------------- small inputs ---------------- */

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Sign up progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors duration-300 ${
                done ? "bg-blue text-white" : active ? "bg-ice text-link ring-2 ring-blue" : "bg-paper text-[#8c9bae] ring-1 ring-ice"
              }`}
            >
              {done ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M3.5 8.4l2.8 2.8 6-6.4" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`hidden whitespace-nowrap text-[13px] font-semibold sm:block ${active || done ? "text-ink" : "text-[#8c9bae]"}`}>{label}</span>
            {i < steps.length - 1 && (
              <span className="relative h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-ice">
                <motion.span
                  className="absolute inset-y-0 left-0 bg-blue"
                  initial={false}
                  animate={{ width: done ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function GroupLabel({ children, error, id }: { children: React.ReactNode; error?: string; id: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span id={id} className="text-[13px] font-semibold text-ink">
        {children}
      </span>
      {error && <span className="text-[12px] font-medium text-[#d92d20]">{error}</span>}
    </div>
  );
}

function Chips({
  id,
  label,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  error?: string;
}) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div>
      <GroupLabel id={`${id}-label`} error={error}>
        {label}
      </GroupLabel>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              id={i === 0 ? id : undefined}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(o)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold transition-all duration-200 ${
                on ? "bg-blue text-white shadow-[0_6px_16px_rgba(0,112,224,0.3)]" : "bg-paper text-ink ring-1 ring-inset ring-ice hover:bg-ice-soft"
              } ${error ? "ring-2 ring-[#d92d20]" : ""}`}
            >
              {on && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M3.5 8.4l2.8 2.8 6-6.4" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                </svg>
              )}
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <div>
      <GroupLabel id={`seg-${label}`}>{label}</GroupLabel>
      <div role="radiogroup" aria-labelledby={`seg-${label}`} className="grid grid-cols-4 gap-1 rounded-2xl bg-paper p-1 ring-1 ring-inset ring-ice">
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={String(o)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o)}
              className="relative h-10 rounded-xl text-[15px] font-semibold"
            >
              {on && (
                <motion.span
                  layoutId={`seg-pill-${label}`}
                  className="absolute inset-0 rounded-xl bg-white shadow-[0_6px_18px_rgba(0,28,100,0.10)] ring-1 ring-ice"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className={`relative ${on ? "text-link" : "text-ink"}`}>{format(o)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  display,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink">
          {label}
        </label>
        <span className="font-display text-[20px] text-link">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lev-range h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(90deg, #0070e0 ${pct}%, #dcebfa ${pct}%)` }}
      />
    </div>
  );
}

function TimingChoice({ value, onChange }: { value: Values["timing"]; onChange: (v: Values["timing"]) => void }) {
  const options = [
    { id: "early" as const, title: "Early", sub: "Tranche 1 before landfall" },
    { id: "confirmed" as const, title: "Confirmed only", sub: "Only once landfall is confirmed" },
  ];
  return (
    <div>
      <GroupLabel id="timing-label">When can we charge you?</GroupLabel>
      <div role="radiogroup" aria-labelledby="timing-label" className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={`rounded-2xl p-3 text-left transition-all duration-200 ${
                on ? "bg-ice-soft ring-2 ring-blue" : "bg-paper ring-1 ring-inset ring-ice hover:bg-ice-soft"
              }`}
            >
              <span className={`block text-[14px] font-semibold ${on ? "text-link" : "text-ink"}`}>{o.title}</span>
              <span className="mt-0.5 block text-[12px] text-[#5f6b7a]">{o.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- live previews ---------------- */

function ResponderPreview({ v }: { v: Values }) {
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-white text-ink shadow-[6px_6px_0_#001c64] ring-2 ring-outline">
      <div className="flex items-center justify-between bg-sky px-6 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-outline/70">Responder profile</span>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-link">Pending verification</span>
      </div>
      <div className="p-6">
        <p className={`font-display text-[28px] leading-tight ${v.org ? "" : "text-[#8c9bae]"}`}>{v.org || "Your organisation"}</p>
        <p className="mt-1 text-[14px] text-[#5f6b7a]">{v.region || "Region you serve"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(v.actions.length ? v.actions : ["Early actions you run"]).map((a) => (
            <span key={a} className="rounded-full bg-ice-soft px-3 py-1 text-[12px] font-semibold text-link">
              {a}
            </span>
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ice pt-4 text-[13px]">
          <div>
            <dt className="text-[#5f6b7a]">Households per storm</dt>
            <dd className="font-display mt-0.5 text-[22px]">{v.households.toLocaleString("en-US")}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[#5f6b7a]">Payouts to</dt>
            <dd className="mt-1 truncate font-semibold">{v.payoutEmail || "your PayPal account"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function SignupAside({ role, v }: { role: Role; v: Values }) {
  return (
    <AsidePanel title={role === "donor" ? "Set it once. We watch the *storms.*" : "Funds that land *before* the storm."}>
      <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-white/80">
        {role === "donor"
          ? "This card updates as you choose. It is exactly what the Policy Engine will follow, nothing more."
          : "This is what LEVee's Allocator sees when a storm meets the playbook in your region."}
      </p>
      <motion.div layout className="mt-6">
        {role === "donor" ? <PledgeCard pledge={v} /> : <ResponderPreview v={v} />}
      </motion.div>
      <div className="mt-auto pt-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">What happens next</p>
        <ol className="mt-3 grid grid-cols-3 gap-2">
          {(role === "donor" ? donorBeats(v) : BEATS[role]).map((beat, i) => (
            <li key={beat.title} className="rounded-2xl bg-white/10 p-3 ring-1 ring-inset ring-white/15">
              <div className="flex items-center justify-between">
                <StoryIcon tone={beat.tone} icon={beat.icon} className="h-8 w-8" />
                <span className="text-[11px] font-semibold text-white/50">0{i + 1}</span>
              </div>
              <p className="mt-2 text-[13px] font-semibold leading-tight">{beat.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-white/70">{beat.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </AsidePanel>
  );
}

/* ---------------- screen ---------------- */

/** `next`: the page that sent them here, such as /pledge. A new donor carries on there. */
export default function SignupScreen({ initialRole = "donor", next }: { initialRole?: Role; next?: string }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [v, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const steps = STEPS[role];

  const set =
    <K extends keyof Values>(key: K) =>
    (value: Values[K]) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        // the yearly cap can never be lower than a single charge
        if (key === "amount" && next.cap < next.amount) next.cap = next.amount;
        return next;
      });
      if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    };

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(to);
    setErrors({});
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found = validateStep(role, step, v);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    if (step < steps.length - 1) {
      go(step + 1);
      return;
    }
    setStatus("loading");
    const account = { role, email: v.email.trim(), password: v.password };
    const result = await postAuth(
      "signup",
      role === "donor"
        ? { ...account, name: v.name, pledge: { amount: v.amount, cap: v.cap, timing: v.timing } }
        : { ...account, name: v.org, organisation: { region: v.region, actions: v.actions, households: v.households, payoutEmail: v.payoutEmail.trim() } },
    );
    if (result.ok) {
      // No account back means Supabase is waiting for the email to be confirmed.
      if (!result.account) setSentTo(v.email.trim());
      return setStatus("done");
    }
    setStatus("idle");
    // A taken email is fixed on the first step, so take them back to it.
    if (result.status === 409) {
      go(0);
      setErrors({ email: result.error });
      return;
    }
    setFormError(result.error);
  };

  const heading = ["Create your *account*", role === "donor" ? "Shape your *pledge*" : "Tell us about your *work*", "One last *look*"][step];
  const sub = [
    role === "donor"
      ? "Set your pledge once. We only charge when a published playbook says a storm is coming, and we always tell you first."
      : "Get flexible money up to 72 hours before landfall, paid to your PayPal account, with proof uploads in one console.",
    role === "donor"
      ? "Choose how much to give per hurricane, and the most you will give in a year."
      : "This helps the Allocator split funds fairly when two storms overlap.",
    "Check the details. Nothing is charged until a storm meets the playbook.",
  ][step];

  return (
    <AuthShell aside={<SignupAside role={role} v={v} />}>
      <AnimatePresence mode="wait">
        {status === "done" ? (
          <SuccessPanel
            title={sentTo ? "Check your email" : role === "donor" ? "Your pledge is set" : "Application received"}
            next={
              sentTo
                ? { href: next ? `/login?next=${encodeURIComponent(next)}` : "/login", label: "Go to log in" }
                : role === "responder"
                  ? { href: "/responder", label: "Open the responder console" }
                  : next === "/pledge"
                    ? { href: next, label: "Continue to your pledge" }
                    : { href: next ?? "/run", label: "Save your PayPal account" }
            }
          >
            {sentTo && (
              <p className="mx-auto mt-3 max-w-[40ch] text-[15px] leading-relaxed text-body">
                We&rsquo;ve sent a link to <strong className="text-ink">{sentTo}</strong>. Open it in this browser to finish signing up.
              </p>
            )}
            {role === "donor" ? (
              <p className="mx-auto mt-3 max-w-[40ch] rounded-2xl bg-sky px-4 py-3 text-[14px] font-medium text-ink">{pledgeSentence(v)}</p>
            ) : (
              <p className="mx-auto mt-3 max-w-[40ch] rounded-2xl bg-sky px-4 py-3 text-[14px] font-medium text-ink">
                A person checks every organisation before it can receive funds. You can log in while you wait.
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
            <div className="flex items-center justify-between gap-4">
              <SandboxBadge />
              <span className="text-[12px] font-semibold text-[#8c9bae]">
                Step {step + 1} of {steps.length}
              </span>
            </div>
            <div className="mt-5">
              <Stepper steps={steps} current={step} />
            </div>

            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={`${role}-${step}`}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: 28 * d }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: -28 * d }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
              >
                <WordReveal play as="h1" text={heading} className="font-display mt-7 text-[clamp(34px,3.8vw,48px)]" />
                <p className="mt-3 text-[15px] leading-relaxed text-body">{sub}</p>

                {step === 0 && (
                  <>
                    <div className="mt-6">
                      <RoleToggle
                        value={role}
                        onChange={(r) => {
                          setRole(r);
                          setErrors({});
                        }}
                      />
                    </div>
                    <div className="mt-6 space-y-4">
                      {role === "donor" ? (
                        <TextField id="name" label="Full name" value={v.name} onChange={set("name")} error={errors.name} autoComplete="name" placeholder="Asha Rahman" />
                      ) : (
                        <TextField
                          id="org"
                          label="Organisation name"
                          value={v.org}
                          onChange={set("org")}
                          error={errors.org}
                          autoComplete="organization"
                          placeholder="Coastal Relief Collective"
                        />
                      )}
                      <TextField
                        id="email"
                        type="email"
                        label={role === "responder" ? "Work email" : "Email"}
                        value={v.email}
                        onChange={set("email")}
                        error={errors.email}
                        autoComplete="email"
                        placeholder={role === "responder" ? "you@organisation.org" : "you@example.com"}
                      />
                      <PasswordField
                        id="password"
                        label="Password"
                        value={v.password}
                        onChange={set("password")}
                        error={errors.password}
                        autoComplete="new-password"
                        hint={<PasswordStrength value={v.password} />}
                      />
                    </div>
                  </>
                )}

                {step === 1 && role === "donor" && (
                  <div className="mt-6 space-y-5">
                    <p className="rounded-2xl bg-paper px-4 py-3 text-[14px] text-body ring-1 ring-inset ring-ice">
                      <span className="font-semibold text-ink">Covers hurricanes on the US Gulf Coast.</span> That is the one region LEVee offers for now.
                    </p>
                    <Segmented label="Amount per hurricane" options={AMOUNTS} value={v.amount} onChange={set("amount")} format={(a) => `$${a}`} />
                    <Slider
                      id="cap"
                      label="Yearly cap"
                      min={Math.max(20, v.amount)}
                      max={300}
                      step={5}
                      value={v.cap}
                      onChange={set("cap")}
                      display={`$${v.cap}`}
                    />
                    <TimingChoice value={v.timing} onChange={set("timing")} />
                    <div className="lg:hidden">
                      <PledgeCard pledge={v} />
                    </div>
                  </div>
                )}

                {step === 1 && role === "responder" && (
                  <div className="mt-6 space-y-5">
                    <SelectField
                      id="region"
                      label="Region you serve"
                      value={v.region}
                      onChange={set("region")}
                      error={errors.region}
                      options={RESPONDER_REGIONS}
                      placeholder="Choose a region"
                    />
                    <Chips id="actions" label="Early actions you run" options={ACTIONS} value={v.actions} onChange={set("actions")} error={errors.actions} />
                    <Slider
                      id="households"
                      label="Households you reach per storm"
                      min={100}
                      max={5000}
                      step={100}
                      value={v.households}
                      onChange={set("households")}
                      display={v.households.toLocaleString("en-US")}
                    />
                    <TextField
                      id="payoutEmail"
                      type="email"
                      label="PayPal email for payouts"
                      value={v.payoutEmail}
                      onChange={set("payoutEmail")}
                      error={errors.payoutEmail}
                      autoComplete="email"
                      placeholder="payouts@organisation.org"
                      aside={
                        v.email && v.payoutEmail !== v.email ? (
                          <button type="button" onClick={() => set("payoutEmail")(v.email)} className="text-[13px] font-semibold text-link hover:underline">
                            Use my work email
                          </button>
                        ) : undefined
                      }
                    />
                  </div>
                )}

                {step === 2 && (
                  <div className="mt-6 space-y-5">
                    {/* on desktop the live card already sits in the blue panel */}
                    <div className="lg:hidden">{role === "donor" ? <PledgeCard pledge={v} /> : <ResponderPreview v={v} />}</div>
                    <dl className="divide-y divide-ice rounded-2xl bg-paper px-4 text-[14px] ring-1 ring-inset ring-ice">
                      {(role === "donor"
                        ? [
                            ["Name", v.name],
                            ["Email", v.email],
                            ["Storms", v.hazards.join(" and ")],
                            ["Regions", v.regions.join(", ")],
                          ]
                        : [
                            ["Organisation", v.org],
                            ["Work email", v.email],
                            ["Region", v.region],
                            ["Payouts to", v.payoutEmail],
                          ]
                      ).map(([k, val]) => (
                        <div key={k} className="flex items-center justify-between gap-4 py-2.5">
                          <dt className="text-[#5f6b7a]">{k}</dt>
                          <dd className="min-w-0 truncate font-semibold text-ink">{val}</dd>
                        </div>
                      ))}
                    </dl>
                    <CheckboxField id="consent" checked={v.consent} onChange={set("consent")} error={errors.consent}>
                      {role === "donor"
                        ? "Charge me only when my pledge's rules are met, always with a notice first. I agree to the sandbox terms."
                        : "Our organisation runs an early action plan and can share proof of every distribution."}
                    </CheckboxField>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-7 flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-full bg-paper px-6 text-[15px] font-semibold text-ink ring-1 ring-inset ring-ice transition hover:bg-ice-soft"
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                    <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Back
                </button>
              )}
              <SubmitButton loading={status === "loading"} className="flex-1">
                {step < steps.length - 1 ? "Continue" : role === "donor" ? "Create account and save pledge" : "Create responder account"}
              </SubmitButton>
            </div>

            <FormError text={formError} />
            <SwitchLink text="Already have an account?" cta="Log in" href={role === "responder" ? "/login?role=responder" : next ? `/login?next=${encodeURIComponent(next)}` : "/login"} />
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}
