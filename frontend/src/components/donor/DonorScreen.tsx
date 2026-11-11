"use client";

import { AnimatePresence, motion } from "motion/react";
import PillButton from "@/components/ui/PillButton";
import PledgeCard from "@/components/pledge/PledgeCard";
import { Card, Label, Pill } from "@/components/app/ui";
import { skipCharge, undoSkip, useDemo } from "@/lib/demoStore";
import { brief, clockText, dateText, donorShare, NO_FIGURE, reached, trancheTwoCharged, usd } from "@/lib/ledger";
import { giftCharges } from "@/lib/rules";
import { CAPTURE_HOUR, DEMO_DONOR, PLAYBOOK_HOUR } from "@/fixtures/helene";
import Narrator from "./Narrator";

const { pledge } = DEMO_DONOR;
const [first, second] = giftCharges(pledge.amount * 100);

const motionProps = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };

function Receipt({ clock }: { clock: number }) {
  const demo = useDemo();
  const rows = donorShare(demo);
  const known = rows.every((r) => r.share !== null);
  const sent = rows.filter((r) => r.payout === "Sent").reduce((s, r) => s + (r.share ?? 0), 0);
  const pending = rows.reduce((s, r) => s + (r.share ?? 0), 0) - sent;
  const dollars = (n: number) => (known ? `$${n.toFixed(2)}` : NO_FIGURE);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[26px] text-ink">
          Your <span className="accent">receipt</span>
        </h2>
        <Pill tone="green">Paid</Pill>
      </div>
      <dl className="mt-3 divide-y divide-ice text-[14px]">
        {[
          ["For", "Hurricane Helene replay, early tranche"],
          ["Charged", `${usd(first.chargedCents / 100)} on ${CAPTURE_HOUR === null ? NO_FIGURE : dateText(CAPTURE_HOUR)}, then ${usd(second.chargedCents / 100)} once proof clears`],
          ["PayPal's fees", `${usd(first.feeCents / 100)} and ${usd(second.feeCents / 100)}`],
          ["Paid with", "Your saved PayPal method"],
          ["PayPal references", `${DEMO_DONOR.captureRef}, ${DEMO_DONOR.captureRefT2}`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-[#5f6b7a]">{k}</dt>
            <dd className="text-right font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <Label className="mt-5">Where it is now</Label>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-ice" role="img" aria-label={`${dollars(sent)} of $${pledge.amount} has reached partners`}>
        <motion.div className="h-full bg-blue" initial={false} animate={{ width: `${(sent / pledge.amount) * 100}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[13px] font-semibold">
        <span className="text-link">{dollars(sent)} with sample partners</span>
        <span className="text-[#5f6b7a]">{dollars(pending)} waiting on proof</span>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 text-[14px] ring-1 ring-inset ring-ice">
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                {r.partnerLabel}, tranche {r.tranche}
              </span>
              <span className="block truncate text-[12px] text-[#5f6b7a]">{r.org}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-semibold text-ink">{r.share === null ? NO_FIGURE : `$${r.share.toFixed(2)}`}</span>
              <Pill tone={r.payout === "Sent" ? "green" : r.payout === "Held" ? "red" : "grey"}>{r.payout}</Pill>
            </span>
          </li>
        ))}
      </ul>
      {clock < 0 && <p className="mt-3 text-[13px] text-[#5f6b7a]">Tranche 2 opens after landfall, once proof clears.</p>}
    </Card>
  );
}

export default function DonorScreen() {
  const demo = useDemo();
  const { clock, skippedAt } = demo;
  const skipped = skippedAt !== null;
  const noticeOut = reached(clock, PLAYBOOK_HOUR) && demo.approved;
  const charged = reached(clock, CAPTURE_HOUR) && !skipped;
  const windowOpen = noticeOut && !reached(clock, CAPTURE_HOUR);
  const capUsed = skipped ? 0 : (charged ? first.chargedCents / 100 : 0) + (trancheTwoCharged(demo) ? second.chargedCents / 100 : 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <PledgeCard pledge={pledge} className="" />
        <Card pad="p-5">
          <div className="flex items-baseline justify-between text-[14px]">
            <span className="font-semibold text-ink">Yearly cap used</span>
            <span className="text-[#5f6b7a]">
              {usd(capUsed)} of {usd(pledge.cap)}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-ice">
            <motion.div className="h-2 rounded-full bg-blue" initial={false} animate={{ width: `${Math.max((capUsed / pledge.cap) * 100, 2)}%` }} />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#5f6b7a]">We stop at your cap, always.</p>
        </Card>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="wait" initial={false}>
          {!noticeOut && (
            <motion.div key="quiet" {...motionProps}>
              <Card>
                <Label>Right now</Label>
                <h2 className="font-display mt-2 text-[28px] text-ink">No charges in this replay yet</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-body">
                  Sentinel&apos;s confidence at this point in the replay: {brief(clock).confidence ?? NO_FIGURE}. If the playbook is met, you get a notice before anything is charged.
                </p>
                <PillButton href="/replay/helene" variant="light" className="mt-4">
                  Open the replay
                </PillButton>
              </Card>
            </motion.div>
          )}

          {windowOpen && !skipped && (
            <motion.div key="notice" {...motionProps} className="rounded-[24px] bg-blue-section p-6 text-white [--accent-color:#60cdff]">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-sky-strong">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-strong opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-strong" />
                </span>
                Notice before charge
              </div>
              <h2 className="font-display mt-3 text-[clamp(28px,3vw,36px)]">
                Replay notice: {usd(first.chargedCents / 100)} of your {usd(pledge.amount)} goes <span className="accent">early</span>
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-white/85">
                All three rules passed at confidence {brief(clock).confidence ?? NO_FIGURE}. We charge your saved method in{" "}
                <span className="font-mono font-semibold tabular-nums text-white">{CAPTURE_HOUR === null ? NO_FIGURE : clockText(CAPTURE_HOUR - clock)}</span>, and two sample partners get sandbox money before landfall.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={skipCharge} className="inline-flex h-12 items-center rounded-full bg-white px-6 text-[15px] font-semibold text-ink transition hover:bg-ice">
                  Skip this storm
                </button>
                <p className="text-[13px] text-white/80">One tap. Your pledge stays on for the next storm.</p>
              </div>
            </motion.div>
          )}

          {skipped && (
            <motion.div key="skipped" {...motionProps}>
              <Card>
                <Pill tone="sky">Skipped</Pill>
                <h2 className="font-display mt-3 text-[28px] text-ink">You skipped this storm</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-body">Nothing was charged, and your cap is untouched. Your pledge stays on for the next storm.</p>
                {windowOpen && (
                  <button type="button" onClick={undoSkip} className="mt-4 inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice">
                    Undo, include me again
                  </button>
                )}
              </Card>
            </motion.div>
          )}

          {charged && (
            <motion.div key="receipt" {...motionProps}>
              <Receipt clock={clock} />
            </motion.div>
          )}
        </AnimatePresence>

        <Narrator state={demo} />
      </div>
    </div>
  );
}
