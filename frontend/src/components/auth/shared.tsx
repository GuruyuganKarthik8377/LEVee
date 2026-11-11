"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import Logo from "@/components/ui/Logo";
import PillButton from "@/components/ui/PillButton";
import { type StoryBeat } from "@/components/ui/StoryCard";
import WordReveal from "@/components/motion/WordReveal";
import Countdown from "@/components/landing/Countdown";
import { trancheOneTotal, usd } from "@/lib/ledger";
import { giftCharges } from "@/lib/rules";
import { type Role } from "./RoleToggle";

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const whole = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/** What happens next for this pledge: early donors pay 40% before landfall and the rest after proof, confirmed-only donors all after. */
export function donorBeats(pledge: { amount: number; cap: number; timing: "early" | "confirmed" }): StoryBeat[] {
  const first = giftCharges(Math.round(pledge.amount * 100))[0].chargedCents / 100;
  const early = pledge.timing === "early";
  return [
    { title: "Pledge saved", detail: `${whole(pledge.amount)} per hurricane, cap ${whole(pledge.cap)}`, tone: "blue", icon: "check" },
    { title: "Notice before charge", detail: early ? `${whole(first)} before landfall · Skip` : "Only after landfall · Skip", tone: "sky", icon: "bell" },
    {
      title: "Receipt ready",
      detail: early ? `${whole(first)} reaches partners before landfall` : `${whole(pledge.amount)} goes to partners whose proof passed`,
      tone: "gold",
      icon: "dollar",
    },
  ];
}

/** The three beats each kind of account will see, used on both login and sign up. */
export const BEATS: Record<Role, StoryBeat[]> = {
  donor: donorBeats({ amount: 10, cap: 60, timing: "early" }),
  responder: [
    { title: "Allocation ready", detail: `${usd(trancheOneTotal)} in the Helene replay, tranche 1`, tone: "blue", icon: "split" },
    { title: "Proof verified", detail: "Lists, photos and receipts pass", tone: "green", icon: "check" },
    { title: "Payout sent", detail: "To your PayPal, before landfall", tone: "gold", icon: "dollar" },
  ],
};

/** Page frame shared by login and sign up: slim top bar, white form card on the left, blue panel on the right. */
export function AuthShell({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-5 md:px-6">
        <Logo />
        <Link
          href="/"
          className="group inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-ink ring-1 ring-ice transition hover:bg-ice-soft"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden>
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to home
        </Link>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-6 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[1fr_1.05fr]">
        <section className="flex flex-col justify-center rounded-[28px] bg-white px-6 py-10 shadow-[0_20px_60px_rgba(0,28,100,0.08)] ring-1 ring-ice sm:px-10 lg:py-8 xl:px-14">
          <div className="mx-auto w-full max-w-[440px]">{children}</div>
        </section>
        {aside}
      </div>
    </main>
  );
}

/** The blue story panel: countdown, a headline, then whatever the page puts inside. */
export function AsidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="relative hidden flex-col overflow-hidden rounded-[28px] bg-blue-section p-10 text-white [--accent-color:#60cdff] lg:flex xl:p-12">
      {/* quiet background rings, anchored to the panel corner */}
      <span aria-hidden className="pointer-events-none absolute -bottom-40 -right-40 h-[460px] w-[460px] rounded-full border-[56px] border-white/[0.06]" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-white/[0.06]" />

      <div className="relative">
        <Countdown />
      </div>
      <WordReveal
        key={title}
        play
        as="h2"
        text={title}
        from="rgba(255,255,255,0.35)"
        to="#ffffff"
        className="font-display relative mt-6 max-w-[15ch] text-[clamp(34px,3.4vw,48px)]"
      />
      <div className="relative flex flex-1 flex-col">{children}</div>
    </aside>
  );
}

const STATS = [
  { value: "Up to 72h", label: "before landfall" },
  { value: "3 of 3", label: "rules before money moves" },
  { value: "0", label: "surprise charges" },
];

export function AsideStats() {
  return (
    <dl className="mt-auto grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
      {STATS.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd>
            <span className="font-display block text-[26px] leading-none">{s.value}</span>
            <span className="mt-1.5 block text-[12px] leading-snug text-white/70">{s.label}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SandboxBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-ice-soft px-3 py-1 text-[12px] font-semibold text-link">
      <span className="h-1.5 w-1.5 rounded-full bg-blue" />
      Sandbox preview
    </span>
  );
}

export function SubmitButton({ loading, children, className = "" }: { loading: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue text-[15px] font-semibold text-white transition-colors hover:bg-[#003087] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-70 ${className}`}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
      {loading ? "One moment" : children}
    </button>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8c9bae]">
      <span className="h-px flex-1 bg-ice" />
      or
      <span className="h-px flex-1 bg-ice" />
    </div>
  );
}

export function PayPalButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-white text-[15px] font-semibold text-ink ring-1 ring-inset ring-ice-line transition hover:bg-ice-soft"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-link" aria-hidden>
        <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
        <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
      </svg>
      Continue with PayPal
    </button>
  );
}

/** Small inline explainer for features that switch on once the backend exists. */
/** What the server refused, read out to screen readers as soon as it appears. */
export function FormError({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="mt-3 text-center text-[14px] font-medium text-[#a8261b]">
      {text}
    </p>
  ) : null;
}

export function Note({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.p
          role="status"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <span className="mt-4 block rounded-2xl bg-ice-soft px-4 py-3 text-[13px] leading-relaxed text-ink">{text}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function SwitchLink({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <p className="mt-6 text-center text-[14px] text-body">
      {text}{" "}
      <Link href={href} className="font-semibold text-link hover:underline">
        {cta}
      </Link>
    </p>
  );
}

export function SuccessPanel({
  title,
  next = { href: "/", label: "Back to the homepage" },
  children,
}: {
  title: string;
  next?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 140, damping: 18 }}
      className="text-center"
    >
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ice">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-link" aria-hidden>
          <path d="M5.5 12.5l4.2 4.2 8.8-9.4" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h1 className="font-display mt-6 text-[clamp(32px,3.4vw,44px)] text-ink">{title}</h1>
      {children}
      <p className="mx-auto mt-3 max-w-[38ch] text-[15px] leading-relaxed text-body">
        Your account is saved in this LEVee sandbox, where no real money ever moves.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <PillButton href={next.href}>{next.label}</PillButton>
        <PillButton href="/#how" variant="light">
          See how it works
        </PillButton>
      </div>
    </motion.div>
  );
}
