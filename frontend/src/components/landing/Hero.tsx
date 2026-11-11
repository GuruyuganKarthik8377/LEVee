"use client";

import { motion } from "motion/react";
import WordReveal from "@/components/motion/WordReveal";
import { useIntroDone } from "@/components/IntroLoader";
import { FloorScene, HeroPhone, PHONE_LEFT, PHONE_RIGHT } from "@/components/illustrations/Scene";
import PillButton from "@/components/ui/PillButton";
import StoryCard, { type StoryBeat } from "@/components/ui/StoryCard";
import Countdown from "./Countdown";
import { PLAYBOOK_HOUR } from "@/fixtures/helene";
import { hoursText, trancheOneTotal, usd } from "@/lib/ledger";

const POINTS = ["Yearly cap you set", "Notice before every charge", "Saved with your PayPal account"];

/* The product's story as app notifications, in two columns mirrored around the phone. */
const LEFT_BEATS: StoryBeat[] = [
  { title: "Pledge saved", detail: "$10 per hurricane, cap $60", tone: "blue", icon: "check" },
  { title: "Playbook met", detail: PLAYBOOK_HOUR === null ? "3 of 3 rules" : `3 of 3 rules · ${hoursText(PLAYBOOK_HOUR)} out`, tone: "green", icon: "dots" },
  { title: "Notice sent", detail: "Skip any charge in one tap", tone: "sky", icon: "bell" },
];
const PAYOUT: StoryBeat = { title: "Payout sent", detail: `${usd(trancheOneTotal)} to 2 sample partners`, tone: "gold", icon: "dollar" };

// Both columns are the same width, the same distance from the phone, and the same height:
// three 62px cards with two 16px gaps on the left, one 140px card plus one 62px card with a 16px gap on the right.
const CARD_GAP = "28px";
const LEFT_GAP = `calc(${(1 - PHONE_LEFT) * 100}% + ${CARD_GAP})`;
const RIGHT_GAP = `calc(${PHONE_RIGHT * 100}% + ${CARD_GAP})`;
const COLUMN = "absolute top-[38%] hidden w-[236px] -translate-y-1/2 flex-col gap-4 lg:flex";

function PledgeMini() {
  return (
    <div className="relative h-[140px] overflow-hidden rounded-2xl bg-sky-strong p-4 text-outline shadow-[0_14px_34px_rgba(0,28,100,0.12)] ring-1 ring-sky-strong [--accent-color:#0070e0]">
      <svg viewBox="0 0 236 80" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full opacity-40" aria-hidden>
        <path d="M0 34 C 60 12 120 60 236 26 L236 80 L0 80Z" fill="#cfeaff" />
      </svg>
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-outline/70">Your pledge</span>
        <span className="h-6 w-8 rounded-md bg-gold ring-1 ring-[#c28a0e]" aria-hidden />
      </div>
      <p className="font-display relative mt-3 text-[26px] leading-none">
        $10 <span className="accent">per</span> hurricane
      </p>
      <p className="relative mt-2 text-[12px] font-medium">Yearly cap $60 · early tranche on</p>
    </div>
  );
}

export default function Hero() {
  const ready = useIntroDone();
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: ready ? { opacity: 1, y: 0 } : {},
    transition: { delay, type: "spring" as const, stiffness: 110, damping: 18 },
  });

  return (
    // The hero fills one screen: copy at the top, and the scene takes whatever height is left.
    <section className="relative flex min-h-[min(100svh,1100px)] flex-col overflow-hidden bg-paper pt-[clamp(100px,11.5svh,112px)]">
      <motion.div className="flex justify-center px-4" {...rise(0)}>
        <Countdown />
      </motion.div>

      <WordReveal
        as="h1"
        play={ready}
        delay={0.1}
        text="Help that arrives *before* the storm, not after"
        className="font-display mx-auto mt-4 max-w-[1200px] px-4 text-center text-[clamp(40px,min(5.2vw,8svh),84px)] leading-[1.02] tracking-[-0.04em] text-balance"
      />

      <motion.p
        className="mx-auto mt-4 max-w-[72ch] px-4 text-center text-[16px] leading-relaxed text-body md:text-[17px]"
        {...rise(0.7)}
      >
        We can see storms coming. Pledge once on PayPal, and LEVee moves your gift to vetted local responders up to 72 hours
        before landfall, not weeks after.
      </motion.p>

      <motion.div className="mt-6 flex flex-wrap justify-center gap-3 px-4" {...rise(0.85)}>
        <PillButton href="/pledge">Pledge now</PillButton>
        <PillButton href="#replay" variant="light">
          Watch the Helene replay
        </PillButton>
      </motion.div>

      <motion.ul
        className="mx-auto mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 px-4 text-[13px] font-medium text-[#4f5d70] [@media(max-height:780px)]:hidden"
        {...rise(1)}
      >
        {POINTS.map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="h-4 w-4 text-link" aria-hidden>
              <path d="M3.5 8.4 l2.8 2.8 l6 -6.4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
            {p}
          </li>
        ))}
      </motion.ul>

      {/* scene: takes whatever height is left on the first screen */}
      <div className="relative mt-4 min-h-[420px] flex-1 md:min-h-[300px]">
        <FloorScene className="absolute inset-0" />

        <motion.div
          className="absolute bottom-[1%] left-1/2 h-[97%] -translate-x-1/2"
          initial={{ opacity: 0, y: 120 }}
          animate={ready ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, type: "spring", stiffness: 70, damping: 16 }}
        >
          <HeroPhone className="h-full w-auto" />

          {/* card columns hang off the phone's own box, so they stay aligned to it at every size */}
          <div className={COLUMN} style={{ right: LEFT_GAP }}>
            {LEFT_BEATS.map((beat, i) => (
              <motion.div
                key={beat.title}
                initial={{ opacity: 0, x: -24 }}
                animate={ready ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 1.1 + i * 0.18, type: "spring", stiffness: 120, damping: 18 }}
              >
                <StoryCard {...beat} className="h-[62px] py-0" />
              </motion.div>
            ))}
          </div>

          <div className={COLUMN} style={{ left: RIGHT_GAP }}>
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={ready ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 1.2, type: "spring", stiffness: 120, damping: 18 }}
            >
              <PledgeMini />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={ready ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 1.38, type: "spring", stiffness: 120, damping: 18 }}
            >
              <StoryCard {...PAYOUT} className="h-[62px] py-0" />
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
