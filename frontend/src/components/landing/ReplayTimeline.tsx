"use client";

import { motion } from "motion/react";
import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";
import Coin from "@/components/ui/Coin";
import { HELENE, LANDFALL_TEXT, PAYOUT_HOUR, PLAYBOOK_HOUR, REPLAY_START, STORM_SOURCES } from "@/fixtures/helene";
import { hoursText, NO_FIGURE } from "@/lib/ledger";

const BEATS = [
  { when: hoursText(REPLAY_START), unit: "before landfall", title: "First advisory", body: "GDACS posts its first advisory. In the replay, Sentinel scores each one." },
  { when: hoursText(PLAYBOOK_HOUR), unit: "before landfall", title: "Playbook met", body: `Every rule has to pass before donors get notices. Sentinel confidence: ${HELENE.brief.confidence ?? NO_FIGURE}.` },
  { when: hoursText(PAYOUT_HOUR), unit: "before landfall", title: "Tranche 1 lands", body: "Pledges are captured after the skip window, then one Payouts batch reaches two sample partners.", money: true },
  { when: "0h", unit: "26 Sep 2024", title: "Landfall", body: `Helene comes ashore ${LANDFALL_TEXT.replace(", about 11:10 pm EDT on 26 Sep 2024", ", about 11:10 pm EDT")}.`, storm: true },
  { when: "After", unit: "landfall", title: "Proof, then tranche 2", body: "The Verifier flags a reused sample photo. Tranche 2 goes only to the verified partner." },
];

function Node({ money, storm }: { money?: boolean; storm?: boolean }) {
  if (money) return <Coin size={40} />;
  if (storm)
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink">
        <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin-slow" aria-hidden>
          <path d="M12 4 C 19 4 21 10 16 13 M12 20 C 5 20 3 14 8 11" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </svg>
      </span>
    );
  return <span className="h-5 w-5 rounded-full border-4 border-blue bg-white" />;
}

export default function ReplayTimeline() {
  return (
    <section id="replay" className="bg-white px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-end gap-6 md:grid-cols-[1.2fr_1fr]">
          <WordReveal text="A *replay* of Hurricane Helene" className="font-display text-[clamp(36px,4.6vw,64px)]" />
          <Reveal delay={0.2} y={16}>
            <p className="max-w-[46ch] text-[16px] leading-relaxed text-body md:pb-2">
              Hurricane Helene made landfall in Florida&apos;s Big Bend, near Perry, late on 26 September 2024. Replay mode steps
              through the LEVee flow on that past storm to show when money would have moved, using sandbox money and sample
              partners. LEVee did not operate during Hurricane Helene.
            </p>
          </Reveal>
        </div>

        <div className="relative mt-14">
          {/* rail: horizontal on desktop, vertical on phones */}
          <div className="absolute left-[19px] top-0 h-full w-1.5 rounded-full bg-ice lg:left-0 lg:top-[19px] lg:h-1.5 lg:w-full" />
          <motion.div
            className="absolute left-[19px] top-0 hidden h-1.5 rounded-full bg-blue lg:top-[19px] lg:left-0 lg:block"
            initial={{ width: 0 }}
            whileInView={{ width: "70%" }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.6, ease: "easeOut" }}
          />

          <ol className="relative grid gap-8 lg:grid-cols-5 lg:gap-5">
            {BEATS.map((b, i) => (
              <motion.li
                key={b.title}
                className="flex gap-5 lg:flex-col lg:gap-0"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: 0.15 + i * 0.18, type: "spring", stiffness: 110, damping: 18 }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <Node money={b.money} storm={b.storm} />
                </div>
                <div className={`flex-1 rounded-2xl p-5 lg:mt-6 ${b.money ? "bg-blue text-white" : b.storm ? "bg-ink text-white" : "bg-paper"}`}>
                  <p className={`font-display text-[36px] ${b.money || b.storm ? "" : "text-link"}`}>{b.when}</p>
                  <p className={`text-[12px] font-semibold uppercase tracking-wider ${b.money || b.storm ? "" : "text-[#5f6b7a]"}`}>{b.unit}</p>
                  <h3 className={`font-display mt-3 text-[20px] ${b.money || b.storm ? "" : "text-ink"}`}>{b.title}</h3>
                  <p className={`mt-1.5 text-[14px] leading-relaxed ${b.money || b.storm ? "" : "text-body"}`}>{b.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <Reveal delay={0.2} y={16} className="mt-10 flex flex-wrap items-center gap-4">
          <PillButton href="/replay/helene">Open the replay</PillButton>
          <p className="text-[13px] text-[#5f6b7a]">{STORM_SOURCES}</p>
        </Reveal>
      </div>
    </section>
  );
}
