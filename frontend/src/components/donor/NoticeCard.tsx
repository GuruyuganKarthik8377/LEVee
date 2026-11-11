"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { dollars } from "@/lib/rules";

/** The Narrator's notice ends with "To skip…, tap before then: <link>". The card has a real button for that, so the line goes. */
const withoutSkipLink = (text: string) => text.replace(/\s*[^.]*:\s*\S+\s*$/, "").trim();

/**
 * The notice a donor gets before LEVee charges them, as it lands on their phone: what's happening, how much, when, and a
 * one-tap skip. The words are the Narrator's, in the donor's language when they gave one.
 */
export default function NoticeCard({
  text,
  storm = "Hurricane Helene",
  amountCents,
  onSkip,
  skipping = false,
}: {
  text?: string;
  storm?: string;
  amountCents: number;
  onSkip: () => void;
  skipping?: boolean;
}) {
  const [kept, setKept] = useState(false);
  const body = text ? withoutSkipLink(text) : `${storm} has met LEVee's published rules. Under your pledge, ${dollars(amountCents)} will be charged and sent to local responders before the storm lands.`;
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(120%_90%_at_10%_0%,#0a46b8_0%,#003087_50%,#001c64_100%)] px-4 pb-5 pt-4 sm:px-6">
      {/* a phone's lock screen, quietly */}
      <div className="flex items-center justify-between text-[12px] font-semibold text-white/80">
        <span>9:41</span>
        <span className="flex items-center gap-1" aria-hidden>
          <span className="h-2 w-3 rounded-[2px] bg-white/80" />
          <span className="h-2.5 w-5 rounded-[3px] ring-1 ring-white/80" />
        </span>
      </div>
      <p className="mt-3 text-center font-display text-[40px] leading-none text-white/90">9:41</p>

      <motion.div
        initial={{ opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.15 }}
        className="mt-4 rounded-[20px] bg-white/95 p-4 text-ink shadow-[0_18px_40px_rgba(0,8,40,0.35)] backdrop-blur"
        role="status"
      >
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-[9px] bg-blue text-[15px] font-bold text-white">
            L
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#5f6b7a]">LEVee</span>
          <span className="ml-auto text-[12px] text-[#5f6b7a]">now</span>
        </div>
        <p className="mt-2.5 text-[16px] font-semibold leading-snug">
          {storm}: {dollars(amountCents)} in 60 minutes
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-body">{body}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={skipping}
            className="h-10 rounded-full bg-ice-soft text-[14px] font-semibold text-link ring-1 ring-inset ring-ice transition hover:bg-ice disabled:opacity-60"
          >
            {skipping ? "Skipping…" : "Skip this storm"}
          </button>
          <button
            type="button"
            onClick={() => setKept(true)}
            disabled={skipping}
            aria-pressed={kept}
            className="h-10 rounded-full bg-blue text-[14px] font-semibold text-white transition hover:bg-[#003087] disabled:opacity-60"
          >
            {kept ? "Kept \u2713" : "Keep my pledge"}
          </button>
        </div>
      </motion.div>
      <p className="mt-3 text-center text-[12px] text-white/70">Doing nothing keeps your pledge. Skipping charges nothing, and your pledge stays on for the next storm.</p>
    </div>
  );
}
