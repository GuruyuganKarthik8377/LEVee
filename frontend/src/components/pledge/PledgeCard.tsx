"use client";

import { AnimatePresence, motion } from "motion/react";
import { money } from "./readPledge";

/** What a donor commits to. The Policy Engine follows exactly this, nothing more. */
export type Pledge = {
  hazards: string[];
  regions: string[];
  amount: number;
  cap: number;
  timing: "early" | "confirmed";
};

/** "$10 per hurricane on the US Gulf Coast, max $60 a year, early tranche on." */
export function pledgeSentence(p: Pledge) {
  const timing = p.timing === "early" ? "early tranche on" : "only once landfall is confirmed";
  return `${money(p.amount)} per hurricane on the US Gulf Coast, max ${money(p.cap)} a year, ${timing}.`;
}

/** The sky pledge card, same look as the one on the hero phone. */
export default function PledgeCard({ pledge: p, label = "Your pledge", className = "max-w-[420px]" }: { pledge: Pledge; label?: string; className?: string }) {
  const storms = Math.floor(p.cap / p.amount);
  return (
    <div className={`relative w-full ${className} overflow-hidden rounded-2xl bg-sky-strong p-6 text-outline shadow-[6px_6px_0_#001c64] ring-2 ring-outline [--accent-color:#0070e0]`}>
      {/* the same soft wave as the hero's pledge card */}
      <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-40" aria-hidden>
        <path d="M0 50 C 100 20 200 90 400 40 L400 120 L0 120Z" fill="#cfeaff" />
      </svg>
      <div className="relative flex items-start justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-outline/70">{label}</span>
        <span className="h-7 w-10 rounded-md bg-gold ring-1 ring-[#c28a0e]" aria-hidden />
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={p.amount}
          className="font-display relative mt-3 text-[44px] leading-none"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          {money(p.amount)} <span className="accent">per</span> hurricane
        </motion.p>
      </AnimatePresence>
      <p className="relative mt-3 text-[14px] leading-relaxed">{pledgeSentence(p)}</p>
      <div className="relative mt-4 flex flex-wrap gap-2">
        {[`Cap ${money(p.cap)} a year`, `Covers up to ${storms} ${storms === 1 ? "hurricane" : "hurricanes"}`, p.timing === "early" ? "Early tranche on" : "Confirmed only"].map(
          (chip) => (
            <span key={chip} className="rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold">
              {chip}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
