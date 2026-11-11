"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import StoryCard, { type StoryBeat } from "@/components/ui/StoryCard";
import WordReveal from "@/components/motion/WordReveal";
import PledgeCard, { type Pledge } from "./PledgeCard";
import { hasCardNumber, money } from "./readPledge";
import { conciergeReader } from "./conciergeReader";
import PayPalSaveButton from "./PayPalSaveButton";

type Phase = "describe" | "check" | "save" | "saving" | "done";
type Message = { id: number; from: "concierge" | "you"; body: React.ReactNode };

const EXAMPLES = [
  "$10 per hurricane on the Gulf Coast, max $60, only if confident",
  "$25 per hurricane, cap $150, after landfall",
  "$5 per hurricane in Florida",
];

const STEPS: { id: Phase[]; label: string }[] = [
  { id: ["describe"], label: "Describe" },
  { id: ["check"], label: "Check" },
  { id: ["save", "saving"], label: "Save" },
];

const RULES = ["GDACS Orange or Red alert", "Landfall within 72 hours", "Sentinel confidence 70 or more"];

/** The donor's next three beats, written with their own numbers. */
function nextSteps(p: Pledge | null): StoryBeat[] {
  const what = p ? `${money(p.amount)} per hurricane, cap ${money(p.cap)}` : "Your pledge";
  return [
    { title: "Pledge saved", detail: what, tone: "blue", icon: "check" },
    { title: "Notice before charge", detail: "Sent before any charge · one tap skip", tone: "sky", icon: "bell" },
    { title: "Receipt and story", detail: "Where every dollar went", tone: "gold", icon: "dollar" },
  ];
}

/* ---------------- chat pieces ---------------- */

function Bubble({ from, children }: { from: Message["from"]; children: React.ReactNode }) {
  const you = from === "you";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={`flex ${you ? "justify-end" : "justify-start"} gap-2.5`}
    >
      {!you && <ConciergeAvatar className="mt-1 h-8 w-8" />}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
          you ? "rounded-tr-md bg-blue text-white" : "rounded-tl-md bg-paper text-body ring-1 ring-inset ring-ice"
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
}

function ConciergeAvatar({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-blue text-white ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" aria-hidden>
        <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 11.5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-2.5" aria-live="polite" aria-label="The Concierge is reading your pledge">
      <ConciergeAvatar className="h-8 w-8" />
      <div className="flex gap-1 rounded-2xl rounded-tl-md bg-paper px-4 py-3.5 ring-1 ring-inset ring-ice">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-blue"
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function Reading({ pledge, assumed, heard }: { pledge: Pledge; assumed: string[]; heard: string[] }) {
  const rows: [string, string][] = [
    ["Amount per hurricane", money(pledge.amount)],
    ["Storms", pledge.hazards.join(" and ")],
    ["Where", pledge.regions.join(", ")],
    ["Yearly cap", money(pledge.cap)],
    ["When", pledge.timing === "early" ? "Early tranche, before landfall" : "Only once landfall is confirmed"],
  ];
  return (
    <div>
      <p>Here is how I read that. Check it before anything is saved.</p>
      <dl className="mt-3 divide-y divide-ice rounded-xl bg-white px-3 text-[14px] ring-1 ring-inset ring-ice">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-[#5f6b7a]">{k}</dt>
            <dd className="text-right font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {assumed.length > 0 && (
        <p className="mt-3 text-[14px]">
          <span className="font-semibold text-ink">I assumed </span>
          {assumed.join("; ")}. Tell me if any of that is wrong.
        </p>
      )}
      {heard.map((h) => (
        <p key={h} className="mt-2 text-[14px]">
          {h}
        </p>
      ))}
      <div className="mt-4 lg:hidden">
        <PledgeCard pledge={pledge} />
      </div>
    </div>
  );
}

/* ---------------- live panel ---------------- */

function LivePanel({ pledge, phase }: { pledge: Pledge | null; phase: Phase }) {
  const saved = phase === "done";
  return (
    <aside className="relative hidden overflow-hidden rounded-[28px] bg-blue-section p-8 text-white [--accent-color:#60cdff] lg:sticky lg:top-24 lg:block lg:self-start xl:p-10">
      <span aria-hidden className="pointer-events-none absolute -bottom-40 -right-40 h-[420px] w-[420px] rounded-full border-[52px] border-white/[0.06]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[30px]">
            Your pledge, <span className="accent">live</span>
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${saved ? "bg-[#2fbf71] text-white" : "bg-white/15 text-white"}`}
          >
            {saved ? "Saved with PayPal" : pledge ? "Not saved yet" : "Waiting for you"}
          </span>
        </div>

        <div className="mt-6">
          {pledge ? (
            <PledgeCard pledge={pledge} />
          ) : (
            <div className="flex h-[210px] max-w-[420px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/30 px-8 text-center">
              <p className="font-display text-[22px]">Your card appears here</p>
              <p className="mt-2 text-[14px] text-white/75">Describe your pledge in the chat, or tap one of the examples.</p>
            </div>
          )}
        </div>

        <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">Charged only when all three pass</p>
        <ul className="mt-3 space-y-2">
          {RULES.map((r) => (
            <li key={r} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2.5 text-[14px] font-medium ring-1 ring-inset ring-white/10">
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
                <circle cx="8" cy="8" r="8" fill="#2fbf71" />
                <path d="M4.5 8.2l2.2 2.2 4.6-4.8" stroke="#fff" strokeWidth="1.8" fill="none" />
              </svg>
              {r}
            </li>
          ))}
        </ul>

        <div className="mt-7 rounded-2xl bg-white/10 p-4 ring-1 ring-inset ring-white/10">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">Yearly cap used</span>
            <span className="text-white/75">$0 of {money(pledge?.cap ?? 0)}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/15">
            <div className="h-2 w-[2%] rounded-full bg-gold" />
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/75">
            Before any charge you get a notice with a one tap skip. Nothing is charged today.
          </p>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- flow ---------------- */

export default function PledgeFlow() {
  const [phase, setPhase] = useState<Phase>("describe");
  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      from: "concierge",
      body: (
        <>
          Hi, I&apos;m the Concierge. Tell me what you would like to give per hurricane on the US Gulf Coast, in your own words,
          and a yearly limit if you have one. I&apos;ll turn it into a pledge card you can check before anything is saved.
        </>
      ),
    },
  ]);
  const [reader] = useState(() => conciergeReader());
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const say = (from: Message["from"], body: React.ReactNode) =>
    setMessages((m) => [...m, { id: nextId.current++, from, body }]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || typing) return;
    setDraft("");
    // refused here, so the digits never reach the transcript or an agent
    if (hasCardNumber(clean)) {
      say("you", "Card number removed");
      say("concierge", "Please don't share card details here. I removed that message. PayPal's own window handles payment at the last step, so I never need your card number.");
      return;
    }
    say("you", clean);
    setTyping(true);
    const pause = new Promise((done) => setTimeout(done, 900));
    void Promise.all([reader.read(clean, phase === "check" ? pledge : null), pause]).then(([result]) => {
      setTyping(false);
      if (result.kind === "reply") {
        say("concierge", result.message);
        return;
      }
      setPledge(result.pledge);
      say("concierge", <Reading pledge={result.pledge} assumed={result.assumed} heard={result.heard} />);
      setPhase("check");
    });
  };

  const confirm = () => {
    say("you", "Looks right.");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      say(
        "concierge",
        <>
          Last step: save your PayPal account. In the live app PayPal&apos;s own window opens here, so you can save it with your
          consent. LEVee never sees your payment details, and nothing is charged today.
        </>,
      );
      setPhase("save");
    }, 700);
  };

  const save = () => {
    setPhase("saving");
    setTimeout(() => {
      say(
        "concierge",
        <div>
          <p>
            Done. Your pledge is saved in this sandbox preview. When a hurricane meets the playbook on the US Gulf Coast, this is what
            happens:
          </p>
          <div className="mt-3 space-y-2">
            {nextSteps(pledge).map((beat) => (
              <StoryCard key={beat.title} {...beat} className="shadow-none" />
            ))}
          </div>
        </div>,
      );
      setPhase("done");
    }, 1100);
  };

  const restart = () => {
    reader.reset();
    setPledge(null);
    setPhase("describe");
    say("concierge", "Sure. Describe your new pledge and I will read it again.");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const stepIndex = STEPS.findIndex((s) => s.id.includes(phase));

  return (
    <section className="mx-auto max-w-6xl px-4 md:px-6">
      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-link ring-1 ring-ice">
        <span className="h-1.5 w-1.5 rounded-full bg-blue" />
        Donor app · sandbox preview
      </span>
      <WordReveal
        play
        as="h1"
        text="Set your pledge in plain *words*"
        className="font-display mt-4 text-[clamp(36px,4.4vw,60px)]"
      />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <p className="max-w-[62ch] text-[16px] leading-relaxed text-body">
          Tell the Concierge what you want to give. It turns your words into a pledge card that the Policy Engine follows to the
          letter: a notice before every charge, and a yearly cap you set.
        </p>
        <ol className="flex items-center gap-2" aria-label="Pledge progress">
          {STEPS.map((s, i) => {
            const done = phase === "done" || i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s.label} className="flex items-center gap-2">
                <span
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors ${
                    done ? "bg-blue text-white" : active ? "bg-white text-link ring-2 ring-blue" : "bg-white text-[#8c9bae] ring-1 ring-ice"
                  }`}
                >
                  {done ? "✓" : i + 1} {s.label}
                </span>
                {i < STEPS.length - 1 && <span className={`h-0.5 w-5 rounded-full ${done ? "bg-blue" : "bg-ice"}`} />}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* chat */}
        <div className="flex h-[600px] flex-col overflow-hidden rounded-[28px] bg-white lg:h-[max(520px,calc(100svh-330px))] shadow-[0_20px_60px_rgba(0,28,100,0.08)] ring-1 ring-ice">
          <div className="flex items-center gap-3 border-b border-ice px-6 py-4">
            <ConciergeAvatar />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold text-ink">Pledge Concierge</p>
              <p className="flex items-center gap-1.5 text-[12px] text-[#5f6b7a]">
                <span className="h-2 w-2 rounded-full bg-[#2fbf71]" />
                Tell it your pledge in your own words
              </p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6" aria-live="polite">
            {messages.map((m) => (
              <Bubble key={m.id} from={m.from}>
                {m.body}
              </Bubble>
            ))}
            {typing && <Typing />}
          </div>

          <div className="border-t border-ice bg-white px-5 py-4 sm:px-6">
            <AnimatePresence mode="wait" initial={false}>
              {phase === "check" && (
                <motion.div key="check" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={typing}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:opacity-60"
                  >
                    Looks right, continue
                  </button>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.focus()}
                    className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice"
                  >
                    Change something
                  </button>
                </motion.div>
              )}
              {(phase === "save" || phase === "saving") && (
                <motion.div key="save" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <PayPalSaveButton saving={phase === "saving"} onSaved={save} {...(pledge && { pledge: { amount: pledge.amount, cap: pledge.cap, timing: pledge.timing } })} />
                </motion.div>
              )}
              {phase === "done" && (
                <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
                  <Link
                    href="/run"
                    className="inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087]"
                  >
                    Run this pledge in the live demo
                  </Link>
                  <Link
                    href="/replay/helene"
                    className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice"
                  >
                    Watch the Helene replay
                  </Link>
                  <button
                    type="button"
                    onClick={restart}
                    className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice"
                  >
                    Make another pledge
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {(phase === "describe" || phase === "check") && (
              <>
                {phase === "describe" && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {EXAMPLES.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => send(e)}
                        className="rounded-full bg-ice-soft px-3.5 py-1.5 text-left text-[13px] font-medium text-link ring-1 ring-inset ring-ice transition hover:bg-ice"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(draft);
                  }}
                  className="flex items-end gap-2 rounded-2xl bg-paper p-2 ring-1 ring-inset ring-ice focus-within:ring-2 focus-within:ring-blue"
                >
                  <label htmlFor="pledge-input" className="sr-only">
                    Describe your pledge
                  </label>
                  <textarea
                    id="pledge-input"
                    ref={inputRef}
                    rows={2}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(draft);
                      }
                    }}
                    placeholder={phase === "check" ? "Change anything, like “make it $20” or “cap it at $100”" : "For example: $10 per hurricane in Florida, max $60 a year"}
                    className="max-h-28 min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-ink outline-none placeholder:text-[#8c9bae]"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || typing}
                    aria-label="Send to the Concierge"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue text-white transition hover:bg-[#003087] disabled:bg-ice disabled:text-white"
                  >
                    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                      <path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </form>
                <p className="mt-2 text-[12px] text-[#5f6b7a]">
                  Sandbox: this stand-in reads English and Spanish in your browser. The live Concierge agent runs on the LEVee backend.
                </p>
              </>
            )}
          </div>
        </div>

        <LivePanel pledge={pledge} phase={phase} />
      </div>
    </section>
  );
}
