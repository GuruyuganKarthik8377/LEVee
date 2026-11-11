"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { DEMO_DONOR, CAPTURE_HOUR, PARTNERS, PAYOUT_HOUR } from "@/fixtures/helene";
import { donorShare, hoursText, NO_FIGURE, reached, usd } from "@/lib/ledger";
import type { DemoState } from "@/lib/demoStore";

const SUGGESTIONS = ["Where did my $10 go?", "Did it arrive before landfall?", "Why is some of it waiting?"];
const AMOUNT = DEMO_DONOR.pledge.amount;
const cents = (n: number | null) => (n === null ? NO_FIGURE : `$${n.toFixed(2)}`);
const total = (rows: { share: number | null }[]) => (rows.some((r) => r.share === null) ? null : rows.reduce((sum, r) => sum + (r.share ?? 0), 0));

/** Browser stand-in for the Narrator agent: it only reads the ledger, the same limit the live agent has. */
function answer(question: string, state: DemoState): React.ReactNode {
  if (state.skippedAt !== null) return "You skipped this storm in the replay, so nothing was charged and none of your sandbox money moved. Your pledge is still active for the next storm.";
  if (!reached(state.clock, CAPTURE_HOUR)) return "Nothing has been charged in this replay yet. You would get a notice with a one tap skip before anything is.";

  const rows = donorShare(state);
  const sent = rows.filter((r) => r.payout === "Sent");
  const waiting = rows.filter((r) => r.payout !== "Sent");
  const q = question.toLowerCase();

  if (/before|landfall|time|early|arrive/.test(q)) {
    const first = rows.filter((r) => r.tranche === 1 && r.payout === "Sent");
    if (!first.length) return "Your sandbox charge has gone through, and tranche 1 is about to go out.";
    return `Yes. In this replay, ${cents(total(first))} of your ${usd(AMOUNT)} reached sample partners ${hoursText(PAYOUT_HOUR)} before landfall, after PayPal's fee on your first charge.`;
  }
  if (/wait|held|hold|why|locked/.test(q)) {
    if (!waiting.length) return "None of it is waiting. Every cent of your sandbox gift has reached a sample partner.";
    return `${cents(total(waiting))} is waiting because tranche 2 only goes out after a partner's proof clears. ${waiting.map((r) => `${r.partnerLabel}: ${r.payout.toLowerCase()}`).join(". ")}.`;
  }
  if (/where|go|went|money|\$|spent/.test(q)) {
    return (
      <div>
        <p>Here is the sandbox record for your {usd(AMOUNT)}, after PayPal&apos;s fees, with first charge reference {DEMO_DONOR.captureRef}:</p>
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-4">
              <span>
                {r.partnerLabel}, tranche {r.tranche}
              </span>
              <span className="font-semibold text-ink">
                {cents(r.share)} {r.payout === "Sent" ? "sent" : r.payout.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
        {sent.length > 0 && (
          <p className="mt-2">
            In this replay, your gift went to sample partners. {PARTNERS.a.label}&apos;s plan: {PARTNERS.a.plan.charAt(0).toLowerCase() + PARTNERS.a.plan.slice(1)}.
          </p>
        )}
      </div>
    );
  }
  return "I can only answer from your ledger record. Try asking where your money went, or why some of it is waiting.";
}

type Line = { id: number; from: "you" | "narrator"; body: React.ReactNode };

export default function Narrator({ state }: { state: DemoState }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [lines, typing]);

  const ask = (text: string) => {
    const clean = text.trim();
    if (!clean || typing) return;
    setLines((l) => [...l, { id: nextId.current++, from: "you", body: clean }]);
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setLines((l) => [...l, { id: nextId.current++, from: "narrator", body: answer(clean, state) }]);
    }, 700);
  };

  return (
    <div className={`flex flex-col overflow-hidden ${lines.length ? "h-[440px]" : ""} rounded-[24px] bg-white shadow-[0_20px_60px_rgba(0,28,100,0.08)] ring-1 ring-ice`}>
      <div className="border-b border-ice px-5 py-3.5">
        <p className="text-[16px] font-semibold text-ink">Ask the Narrator</p>
        <p className="text-[12px] text-[#5f6b7a]">
          Sample answers for this replay.{" "}
          <Link href="/login?next=%2Fdonor" className="font-semibold text-link hover:underline">
            Log in to ask about your own money
          </Link>
        </p>
      </div>
      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
        {!lines.length && <p className="text-[14px] leading-relaxed text-[#5f6b7a]">Ask anything about your gift. Answers come from the transaction record, not from a script.</p>}
        {lines.map((l) => (
          <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${l.from === "you" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${l.from === "you" ? "rounded-tr-md bg-blue text-white" : "rounded-tl-md bg-paper text-body ring-1 ring-inset ring-ice"}`}>{l.body}</div>
          </motion.div>
        ))}
        {typing && <p className="text-[13px] font-medium text-link">The Narrator is reading your record</p>}
      </div>
      <div className="border-t border-ice p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="shrink-0 rounded-full bg-ice-soft px-3 py-1.5 text-left text-[13px] font-medium text-link ring-1 ring-inset ring-ice transition hover:bg-ice">
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex gap-2"
        >
          <label htmlFor="narrator-input" className="sr-only">
            Ask about your gift
          </label>
          <input
            id="narrator-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your gift"
            className="h-11 min-w-0 flex-1 rounded-full bg-paper px-4 text-[15px] text-ink outline-none ring-1 ring-inset ring-ice placeholder:text-[#8c9bae] focus:ring-2 focus:ring-blue"
          />
          <button type="submit" disabled={!draft.trim() || typing} className="h-11 rounded-full bg-blue px-5 text-[14px] font-semibold text-white transition hover:bg-[#003087] disabled:bg-ice">
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
