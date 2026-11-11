"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { LiveView } from "@/app/api/live/route";
import type { NarratorReply } from "@/server/liveRun";

const SUGGESTIONS = ["Where did my money go?", "Why was I charged before landfall?", "How much did PayPal take in fees?"];

type Line = { id: number; from: "you" | "narrator"; text: string; reply?: NarratorReply; failed?: "login" | "error" };

/** Why the answer can be trusted: every figure is checked against the donor's own records, and PayPal's where it read them. */
function Source({ reply }: { reply: NarratorReply }) {
  const records = reply.recordsRead.length;
  return (
    <p className="mt-2 text-[11px] font-semibold text-[#5f6b7a]">
      {reply.fromClaude ? "Every figure checked against your records" : "A plain summary of your records"}
      {records > 0 && ` · read ${records === 1 ? "PayPal's record of your charge" : `${records} of PayPal's records`}`}
    </p>
  );
}

/**
 * The Narrator agent, live: a donor asks about their own sandbox charges in plain words. It can't move money; asking for
 * a refund goes to the Policy Engine, which decides by its rules. Needs a logged-in donor, like the rest of /run.
 */
export default function AskNarrator({ onUpdate }: { onUpdate: (view: LiveView) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const nextId = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [lines, thinking]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    setLines((l) => [...l, { id: nextId.current++, from: "you", text: question }]);
    setDraft("");
    setThinking(true);
    let line: Line;
    try {
      const res = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ask", question }) });
      const data = (await res.json().catch(() => ({}))) as Partial<LiveView> & { answer?: NarratorReply; error?: string };
      if (res.ok && data.answer) {
        line = { id: nextId.current++, from: "narrator", text: data.answer.text, reply: data.answer };
        onUpdate(data as LiveView);
      } else if (res.status === 401) {
        line = { id: nextId.current++, from: "narrator", text: "Log in as a donor to ask about your money.", failed: "login" };
      } else {
        line = { id: nextId.current++, from: "narrator", text: data.error && res.status < 500 ? data.error : "I couldn't answer that just now. Please try again.", failed: "error" };
      }
    } catch {
      line = { id: nextId.current++, from: "narrator", text: "Couldn't reach LEVee. Check your connection and try again.", failed: "error" };
    }
    setLines((l) => [...l, line]);
    setThinking(false);
  };

  return (
    <div className={`flex flex-col overflow-hidden ${lines.length ? "h-[460px]" : ""} rounded-[24px] bg-white shadow-[0_20px_60px_rgba(0,28,100,0.08)] ring-1 ring-ice`}>
      <div className="flex items-start justify-between gap-3 border-b border-ice px-5 py-3.5">
        <div>
          <p className="text-[16px] font-semibold text-ink">Ask about your money</p>
          <p className="text-[12px] text-[#5f6b7a]">Answers come from your own charges and PayPal&apos;s records. It can never move money.</p>
        </div>
      </div>

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
        {!lines.length && (
          <p className="text-[14px] leading-relaxed text-[#5f6b7a]">
            Ask anything about where your money went, in your own words.
          </p>
        )}
        {lines.map((l) => (
          <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${l.from === "you" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                l.from === "you" ? "rounded-tr-md bg-blue text-white" : l.failed ? "rounded-tl-md bg-[#fff4f2] text-[#a8261b] ring-1 ring-inset ring-[#ffd9d4]" : "rounded-tl-md bg-paper text-body ring-1 ring-inset ring-ice"
              }`}
            >
              <p className="whitespace-pre-line">{l.text}</p>
              {l.failed === "login" && (
                <Link href="/login?next=%2Frun" className="mt-1 inline-block font-semibold text-link hover:underline">
                  Log in
                </Link>
              )}
              {l.reply && <Source reply={l.reply} />}
              {l.reply?.refund && (
                <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[13px] text-ink ring-1 ring-inset ring-ice">
                  <span className="font-semibold">Policy Engine: {l.reply.refund.refunded ? "refunded" : "no refund"}.</span> {l.reply.refund.reason}
                </p>
              )}
            </div>
          </motion.div>
        ))}
        {thinking && (
          <p className="flex items-center gap-2 text-[13px] font-medium text-link">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ice border-t-blue" aria-hidden />
            The Narrator is reading your records
          </p>
        )}
      </div>

      <div className="border-t border-ice p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={thinking}
              onClick={() => void ask(s)}
              className="shrink-0 rounded-full bg-ice-soft px-3 py-1.5 text-left text-[13px] font-medium text-link ring-1 ring-inset ring-ice transition hover:bg-ice disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="flex gap-2"
        >
          <label htmlFor="ask-narrator" className="sr-only">
            Ask about your money
          </label>
          <input
            id="ask-narrator"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your money"
            className="h-11 min-w-0 flex-1 rounded-full bg-paper px-4 text-[15px] text-ink outline-none ring-1 ring-inset ring-ice placeholder:text-[#8c9bae] focus:ring-2 focus:ring-blue"
          />
          <button type="submit" disabled={!draft.trim() || thinking} className="h-11 rounded-full bg-blue px-5 text-[14px] font-semibold text-white transition hover:bg-[#003087] disabled:bg-ice">
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
