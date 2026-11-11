"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { approveAllocation, resetDemo, setClock, useDemo } from "@/lib/demoStore";
import { auditLog, allocations, brief, clockText, dateText, funds, hoursText, needsApproval, NO_FIGURE, overOpsLimit, playbook, reached, stageIndex, trancheOneTotal, usd, whenText } from "@/lib/ledger";
import { CAPTURE_HOUR, CHARGES, OPS_LIMIT, PLAYBOOK_HOUR, PROOF_HOUR, REPLAY_END, REPLAY_START, STAGES, STORM_SOURCES, type PartnerId } from "@/fixtures/helene";
import { Card, Label, Pill } from "@/components/app/ui";
import StormMap from "./StormMap";

const SPEEDS = [1, 3];
/** Hours of storm per second of screen time at 1x, so the full replay runs in about a minute. */
const HOURS_PER_SECOND = 1.7;

function Check({ met }: { met: boolean | null }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-[#5f6b7a] transition-colors duration-500 ${met ? "bg-[#2fbf71]" : "bg-ice"}`}>
      {met && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
          <path d="M3.5 8.2l3 3 6-6.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {met === null && NO_FIGURE}
    </span>
  );
}

function Confidence({ value }: { value: number | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[44px] leading-none text-ink">{value ?? NO_FIGURE}</span>
        <span className="text-[13px] font-semibold text-[#5f6b7a]">Needs 70</span>
      </div>
      <div className="relative mt-3 h-3 rounded-full bg-ice">
        <motion.div className="h-full rounded-full bg-blue" animate={{ width: `${value ?? 0}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        <span className="absolute -top-1 bottom-[-4px] left-[70%] w-0.5 bg-ink" aria-hidden />
      </div>
    </div>
  );
}

export default function ReplayScreen() {
  const demo = useDemo();
  const { clock } = demo;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const latest = useRef(demo);
  const strip = useRef<HTMLOListElement>(null);
  const stage = stageIndex(clock);

  useEffect(() => {
    latest.current = demo;
  }, [demo]);

  // keeps the current beat in view on phones, where the strip scrolls sideways
  useEffect(() => {
    const el = strip.current;
    const item = el?.children[stage] as HTMLElement | undefined;
    if (el && item) el.scrollTo({ left: item.offsetLeft - el.offsetLeft - 8, behavior: "smooth" });
  }, [stage]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const { clock: now, approved } = latest.current;
      const next = Math.min(now + (HOURS_PER_SECOND * speed) / 10, REPLAY_END);
      const gated = !approved && reached(next, PLAYBOOK_HOUR);
      setClock(gated ? PLAYBOOK_HOUR! : next);
      if (gated || next >= REPLAY_END) setPlaying(false);
    }, 100);
    return () => clearInterval(id);
  }, [playing, speed]);

  const b = brief(clock);
  const rules = playbook(clock);
  const money = funds(demo);
  const log = auditLog(demo).slice(0, 5);
  const waiting = needsApproval(demo);
  const inNoticeWindow = demo.approved && reached(clock, PLAYBOOK_HOUR) && !reached(clock, CAPTURE_HOUR);
  const paid: Partial<Record<PartnerId, number | null>> = {};
  for (const row of allocations(demo)) if (row.payout === "Sent") paid[row.partner] = row.amount === null ? null : (paid[row.partner] ?? 0) + row.amount;
  const rulesKnown = rules.every((r) => r.met !== null);

  const restart = () => {
    setPlaying(false);
    resetDemo();
  };

  // Approving is the one step the replay waits for, so it carries on by itself afterwards.
  const approve = () => {
    approveAllocation();
    setPlaying(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="overflow-hidden rounded-[28px] bg-navy text-white shadow-[0_20px_60px_rgba(0,28,100,0.18)]">
          <div className="relative">
            <div className="px-4 pb-1 pt-4 sm:pointer-events-none sm:absolute sm:left-3 sm:top-1 sm:z-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-strong">{clock < 0 ? "Landfall in" : "Since landfall"}</p>
              <p className="font-display text-[clamp(26px,3.6vw,44px)] leading-none tabular-nums" aria-live="off">
                {clockText(clock)}
              </p>
              <p className="mt-1 text-[12px] text-white/75">{dateText(clock)} EDT</p>
            </div>
            <StormMap clock={clock} paid={paid} />
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((v) => !v)}
                disabled={waiting || clock >= REPLAY_END}
                aria-label={playing ? "Pause the replay" : "Play the replay"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-outline transition hover:brightness-105 disabled:opacity-40"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                  {playing ? <path d="M5 3h3.5v14H5zM11.5 3H15v14h-3.5z" fill="currentColor" /> : <path d="M5 2.5v15L17 10z" fill="currentColor" />}
                </svg>
              </button>
              <input
                type="range"
                className="lev-range h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
                aria-label="Replay position"
                aria-valuetext={whenText(clock)}
                min={REPLAY_START}
                max={REPLAY_END}
                step="any"
                value={clock}
                onChange={(e) => setClock(Number(e.target.value))}
                style={{ background: `linear-gradient(to right, #0070e0 ${((clock - REPLAY_START) / (REPLAY_END - REPLAY_START)) * 100}%, rgba(255,255,255,0.2) 0)` }}
              />
              <div className="flex shrink-0 rounded-full bg-white/10 p-1" role="group" aria-label="Replay speed">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                    className={`h-8 w-9 rounded-full text-[13px] font-semibold transition ${speed === s ? "bg-white text-ink" : "text-white/75 hover:text-white"}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {waiting && (
                // In the player itself, so the reason for the pause is next to the play button. On phones the card beside the map is hidden: it sat below the fold, and the replay looked stuck.
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                  role="status"
                >
                  <div className="flex flex-col items-start gap-3 rounded-2xl bg-white/10 p-3 pl-4 sm:flex-row sm:items-center sm:gap-4">
                    <p className="min-w-0 text-[14px] leading-snug sm:flex-1">
                      <span className="font-semibold">Paused for ops approval.</span>{" "}
                      <span className="text-white/75">
                        {overOpsLimit ? `${usd(CHARGES.t1)} of charges is over the ${usd(OPS_LIMIT)} limit, so a person signs off first.` : "A person signs off before money moves."}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={approve}
                      className="inline-flex h-10 shrink-0 items-center rounded-full bg-gold px-5 text-[14px] font-semibold text-outline transition hover:brightness-105"
                    >
                      Approve {usd(trancheOneTotal)} and continue
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <ol ref={strip} className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {STAGES.map((s, i) => {
                const { at } = s;
                const tone = i === stage ? "bg-white text-ink" : i < stage ? "bg-blue text-white" : "bg-white/10 text-white/75 hover:bg-white/15";
                return (
                  <li key={s.title} className="min-w-[80px] flex-1">
                    <button
                      type="button"
                      aria-current={i === stage ? "step" : undefined}
                      disabled={at === null}
                      onClick={() => at !== null && setClock(at)}
                      className={`h-full w-full rounded-xl px-2 py-2 text-left transition disabled:cursor-default ${tone}`}
                    >
                      <span className="block text-[11px] font-semibold tabular-nums opacity-80">{at === null ? NO_FIGURE : at < 0 ? `${hoursText(at)} out` : at === 0 ? "0h" : `+${hoursText(at)}`}</span>
                      <span className="block text-[12px] font-semibold leading-tight">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {waiting && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="hidden rounded-[24px] bg-blue p-5 text-white shadow-[0_16px_40px_rgba(0,112,224,0.3)] lg:block">
                <p className="font-display text-[22px]">Waiting on one click</p>
                <p className="mt-1.5 text-[14px] leading-relaxed">
                  The Allocator proposed {usd(trancheOneTotal)}
                  {overOpsLimit ? `, from ${usd(CHARGES.t1)} of charges, which is over the ${usd(OPS_LIMIT)} limit` : ""}. The replay holds here until ops approves.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={approve} className="inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-ink transition hover:bg-ice">
                    Approve {usd(trancheOneTotal)}
                  </button>
                  <Link href="/ops" className="inline-flex h-10 items-center rounded-full bg-white/15 px-5 text-[14px] font-semibold transition hover:bg-white/25">
                    Open ops
                  </Link>
                </div>
              </motion.div>
            )}
            {inNoticeWindow && !playing && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-[24px] bg-sky p-5 text-ink">
                <p className="font-display text-[22px]">Notices are out</p>
                <p className="mt-1.5 text-[14px] leading-relaxed">Donors have until the charge to skip. Press play when you are ready to continue.</p>
                <Link href="/donor" className="mt-3 inline-flex h-10 items-center rounded-full bg-navy px-5 text-[14px] font-semibold text-white transition hover:bg-blue-section">
                  See the donor notice
                </Link>
              </motion.div>
            )}
            {clock >= (PROOF_HOUR ?? 0) && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-[24px] bg-sky p-5 text-ink">
                <p className="font-display text-[22px]">Proof window open</p>
                <p className="mt-1.5 text-[14px] leading-relaxed">Tranche 2 stays locked until each partner&apos;s proof clears the Verifier.</p>
                <Link href="/responder/proof" className="mt-3 inline-flex h-10 items-center rounded-full bg-navy px-5 text-[14px] font-semibold text-white transition hover:bg-blue-section">
                  Upload proof
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          <Card pad="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[22px] text-ink">
                Policy <span className="accent">Engine</span>
              </h2>
              <Pill tone={rules.every((r) => r.met) ? "green" : "grey"}>{rulesKnown ? rules.filter((r) => r.met).length : NO_FIGURE} of 3 met</Pill>
            </div>
            <ul className="mt-3 divide-y divide-ice">
              {rules.map((r) => (
                <li key={r.label} className="flex items-center gap-3 py-2.5">
                  <Check met={r.met} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{r.label}</p>
                    <p className="text-[13px] text-[#5f6b7a]">{r.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card pad="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[22px] text-ink">
                Threat <span className="accent">Brief</span>
              </h2>
              <Pill tone="sky">Sentinel</Pill>
            </div>
            <div className="mt-3">
              <Confidence value={b.confidence} />
            </div>
            <p className="mt-4 text-[15px] font-semibold text-ink">{b.headline}</p>
            <ul className="mt-2 space-y-1.5">
              {b.reasons.map((r) => (
                <li key={r} className="flex gap-2 text-[13px] leading-snug text-body">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.55fr]">
        <Card>
          <Label>Money so far</Label>
          <p className="font-display mt-2 text-[52px] leading-none text-ink">{usd(money.paid)}</p>
          <p className="mt-1 text-[14px] text-body">paid to partners</p>
          <dl className="mt-5 space-y-2 border-t border-ice pt-4 text-[14px]">
            {[
              ["Captured from donors", usd(money.captured)],
              ["Corporate match", usd(money.match)],
              ["Held until proof", usd(money.held)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-[#5f6b7a]">{k}</dt>
                <dd className="font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/donor" className="inline-flex h-9 items-center rounded-full bg-ice-soft px-4 text-[13px] font-semibold text-link transition hover:bg-ice">
              Donor view
            </Link>
            <Link href="/responder" className="inline-flex h-9 items-center rounded-full bg-ice-soft px-4 text-[13px] font-semibold text-link transition hover:bg-ice">
              Responder view
            </Link>
            <button type="button" onClick={restart} className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-[#5f6b7a] transition hover:text-ink">
              Restart replay
            </button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <Label>Latest decisions</Label>
            <Link href="/audit" className="text-[13px] font-semibold text-link hover:underline">
              Full audit log
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-ice">
            {log.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2.5">
                <Pill tone={e.actor === "Policy Engine" ? "navy" : e.actor === "Ops" ? "gold" : "sky"} className="mt-0.5 w-[104px] justify-center">
                  {e.actor}
                </Pill>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{e.title}</p>
                  <p className="text-[13px] text-[#5f6b7a]">{e.output}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="text-[12px] text-[#5f6b7a]">
        {STORM_SOURCES} Sentinel&apos;s scores, money and partner figures come from the LEVee replay.
      </p>
    </div>
  );
}
