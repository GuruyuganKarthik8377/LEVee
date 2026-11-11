"use client";

import { motion } from "motion/react";
import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import Coin from "@/components/ui/Coin";
import Brand from "@/components/ui/Brand";

type Mark = { at: number; label: string; kind?: "money" | "storm" };

const TODAY: Mark[] = [
  { at: 4, label: "Forecast" },
  { at: 48, label: "Landfall", kind: "storm" },
  { at: 68, label: "Appeals" },
  { at: 94, label: "Money arrives", kind: "money" },
];

const LEVEE: Mark[] = [
  { at: 4, label: "Forecast" },
  { at: 20, label: "Trigger met" },
  { at: 34, label: "Money arrives", kind: "money" },
  { at: 52, label: "Landfall", kind: "storm" },
  { at: 82, label: "Proof, tranche 2" },
];

function StormDot({ light }: { light: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <circle cx="12" cy="12" r="11" fill={light ? "#ffffff" : "#001c64"} />
      <path
        d="M12 5 C 18 5 20 10 16 13 M12 19 C 6 19 4 14 8 11"
        stroke={light ? "#0070e0" : "#ffffff"}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Track({ marks, light }: { marks: Mark[]; light: boolean }) {
  const money = marks.find((m) => m.kind === "money")!;
  return (
    <>
      {/* horizontal track from md up */}
      <div className="relative mt-10 hidden h-28 md:block">
        <div className={`absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full ${light ? "bg-white/30" : "bg-ice"}`} />
        <motion.div
          className={`absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full ${light ? "bg-white" : "bg-ink-soft"}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${money.at}%` }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
        {marks.map((m, i) => (
          <div
            key={m.label}
            className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${m.at}%` }}
          >
            <span
              className={`absolute whitespace-nowrap text-[13px] font-semibold ${i % 2 ? "top-9" : "bottom-9"} ${
                light ? "text-white" : "text-ink"
              }`}
            >
              {m.label}
            </span>
            {m.kind === "money" ? (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                whileInView={{ scale: 1, rotate: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1.1, type: "spring", stiffness: 160 }}
              >
                <Coin size={34} />
              </motion.div>
            ) : m.kind === "storm" ? (
              <StormDot light={light} />
            ) : (
              <span className={`h-4 w-4 rounded-full border-[3px] ${light ? "border-white bg-blue-bright" : "border-ink-soft bg-white"}`} />
            )}
          </div>
        ))}
      </div>

      {/* vertical list on phones */}
      <ol className="mt-8 space-y-4 md:hidden">
        {marks.map((m) => (
          <li key={m.label} className="flex items-center gap-3">
            {m.kind === "money" ? (
              <Coin size={28} />
            ) : m.kind === "storm" ? (
              <StormDot light={light} />
            ) : (
              <span className={`mx-1.5 h-4 w-4 rounded-full border-[3px] ${light ? "border-white" : "border-ink-soft"}`} />
            )}
            <span className={`text-[15px] font-semibold ${light ? "text-white" : "text-ink"}`}>{m.label}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

export default function Contrast() {
  return (
    <section className="bg-paper px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <WordReveal text="Same storm. Different *timing.*" className="font-display text-center text-[clamp(36px,4.6vw,64px)]" />
        <Reveal delay={0.2} y={16}>
          <p className="mx-auto mt-4 max-w-[52ch] text-center text-[16px] leading-relaxed text-body">
            Forecasters see a hurricane coming before it lands. Most giving still starts after the news. Here is the same storm,
            funded two ways.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal className="rounded-3xl bg-white p-7 md:p-9">
            <span className="rounded-full bg-[#eaf1f9] px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-[#5f6b7a]">
              Giving today
            </span>
            <h3 className="font-display mt-5 text-[clamp(26px,2.8vw,32px)] text-ink">Weeks after the water</h3>
            <Track marks={TODAY} light={false} />
            <p className="mt-6 text-[15px] leading-relaxed text-body">
              While families wait, they sell assets, cut meals or take on debt. By the time money lands, the damage is done.
            </p>
          </Reveal>

          <Reveal delay={0.12} className="rounded-3xl bg-blue-bright p-7 md:p-9">
            <span className="rounded-full bg-navy/35 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-white">
              Giving with <Brand />
            </span>
            <h3 className="font-display mt-5 text-[clamp(26px,2.8vw,32px)] text-white">Hours before the storm</h3>
            <Track marks={LEVEE} light />
            <p className="mt-6 text-[15px] leading-relaxed text-white">
              Responders move people, stock food and secure assets before landfall. The rest follows once they show proof.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
