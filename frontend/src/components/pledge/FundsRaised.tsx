"use client";

import { motion } from "motion/react";
import CountUp from "@/components/motion/CountUp";
import Reveal from "@/components/motion/Reveal";
import { FIGURES_PENDING, REPLAY_NOTE, type StormEvent } from "@/fixtures/helene";
import { NO_FIGURE, usd } from "@/lib/ledger";

const TRANCHE_STYLE: Record<string, { bar: string; dot: string; badge: string }> = {
  t1: { bar: "bg-blue", dot: "bg-blue", badge: "bg-ice text-link" },
  t2a: { bar: "bg-[#2fbf71]", dot: "bg-[#2fbf71]", badge: "bg-[#dff5e8] text-[#1b7a48]" },
  t2b: { bar: "bg-gold", dot: "bg-gold", badge: "bg-[#fff4c2] text-[#8a6a00]" },
};

/** Counts up to a real figure, or shows a dash until the replay supplies it. */
function Figure({ value, prefix = "", duration }: { value: number | null; prefix?: string; duration?: number }) {
  return value === null ? <>{NO_FIGURE}</> : <CountUp to={value} prefix={prefix} duration={duration} />;
}

/** "Raised so far" for one storm: the headline total, progress toward partners' plans, and where every dollar went. */
export default function FundsRaised({ event }: { event: StormEvent }) {
  const { raised, tranches } = event;
  const progress = raised.total !== null && raised.goal ? Math.min(raised.total / raised.goal, 1) : 0;
  const average = raised.pledged !== null && raised.donors ? Math.round(raised.pledged / raised.donors) : null;

  return (
    <section className="mx-auto mt-16 max-w-6xl px-4 md:px-6" aria-labelledby="raised-title">
      <Reveal className="grid overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_rgba(0,28,100,0.08)] ring-1 ring-ice lg:grid-cols-[1.15fr_1fr]">
        {/* total */}
        <div className="p-7 md:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-ice-soft px-3 py-1 text-[12px] font-semibold text-link">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue" />
              </span>
              {event.name}
              {event.replay ? " · replay" : ""}
            </span>
            {event.replay && (
              <span className="rounded-full bg-paper px-3 py-1 text-[12px] font-semibold text-[#5f6b7a] ring-1 ring-inset ring-ice">
                Sandbox data
              </span>
            )}
          </div>

          <h2 id="raised-title" className="mt-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#5f6b7a]">
            Raised so far
          </h2>
          <p className="font-display mt-2 text-[clamp(56px,7vw,92px)] leading-none text-ink">
            <Figure value={raised.total} prefix="$" duration={1.6} />
          </p>
          <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-body">
            {raised.total === null
              ? "These figures appear once the Helene replay has been run."
              : `From ${raised.donors ?? NO_FIGURE} sample donors and one corporate match, toward the ${usd(raised.goal)} that sample partners' early action plans asked for.`}
          </p>

          <div className="mt-6">
            <div className="flex items-baseline justify-between text-[13px] font-semibold">
              <span className="text-link">{raised.total === null ? NO_FIGURE : `${Math.round(progress * 100)}%`} funded</span>
              <span className="text-[#5f6b7a]">Goal {usd(raised.goal)}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-ice">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-blue via-sky-strong to-gold"
                initial={{ width: 0 }}
                whileInView={{ width: `${progress * 100}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1.4, ease: "easeOut" }}
              />
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-ice pt-6">
            {[
              { label: "Sample donors", value: raised.donors, prefix: "" },
              { label: "Average pledge", value: average, prefix: "$" },
              { label: "Corporate match", value: raised.match, prefix: "$" },
            ].map((s) => (
              <div key={s.label}>
                <dt className="text-[12px] font-semibold text-[#5f6b7a]">{s.label}</dt>
                <dd className="font-display mt-1 text-[clamp(24px,2.4vw,32px)] text-ink">
                  <Figure value={s.value} prefix={s.prefix} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* where it went */}
        <div className="bg-paper p-7 md:p-10">
          <h3 className="font-display text-[26px] text-ink">
            Where it <span className="accent">went</span>
          </h3>

          <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-ice" role="img" aria-label="Split of funds raised by tranche">
            {tranches.map((t, i) => (
              <motion.div
                key={t.id}
                className={`h-full ${TRANCHE_STYLE[t.id]?.bar ?? "bg-blue"} ${i > 0 ? "border-l-2 border-white" : ""}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${t.amount !== null && raised.total ? (t.amount / raised.total) * 100 : 0}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 1, delay: 0.2 + i * 0.2, ease: "easeOut" }}
              />
            ))}
          </div>

          <ul className="mt-6 space-y-3">
            {tranches.map((t) => {
              const style = TRANCHE_STYLE[t.id] ?? TRANCHE_STYLE.t1;
              return (
                <li key={t.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-inset ring-ice">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-ink">{t.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>
                        {t.amount === null ? "Waiting for the replay" : t.status === "sent" ? "Paid out" : "Waiting on proof"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-[#5f6b7a]">{t.note}</p>
                  </div>
                  <span className="font-display text-[22px] text-ink">{usd(t.amount)}</span>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 text-[12px] leading-relaxed text-[#5f6b7a]">
            {event.replay
              ? `${REPLAY_NOTE}${FIGURES_PENDING ? "" : " Totals come straight from the ledger once the backend is connected."}`
              : "Live totals from the LEVee ledger, updated with every PayPal capture and payout."}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
