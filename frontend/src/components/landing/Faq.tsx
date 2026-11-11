"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";

const FAQS = [
  {
    q: "Isn't the trigger just an if statement?",
    a: "Yes, on purpose. The trigger is fixed so donors can trust it. AI does the judgment around it: whether sources agree, how to split money between storms, and whether proof is real.",
  },
  {
    q: "What if the storm misses?",
    a: "Tranche 1 is small and pays for early actions that help anyway, like evacuation transport, food and securing assets. Tranche 2 is charged only after landfall is confirmed, and you can choose to give only then.",
  },
  {
    q: "Will I be surprised by charges?",
    a: "No. You set a yearly cap, get a notice before every charge with a one tap skip, and see every charge on a receipt.",
  },
  {
    q: "How does money reach a family before the storm?",
    a: "LEVee funds vetted local organisations that already run early action plans and beneficiary lists. It solves the money bottleneck, not the last mile.",
  },
  {
    q: "Why PayPal?",
    a: "Donors already have PayPal, and PayPal operates in about 200 markets. Vault, Payouts, Invoicing and the Agent Toolkit cover the whole flow in one integration.",
  },
  {
    q: "Is this real money today?",
    a: "Not yet. This hackathon build runs on the PayPal sandbox only. A production version would collect through a registered charitable intermediary, with PayPal approval for charging saved accounts.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="bg-paper px-4 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <WordReveal text="Fair questions. *Straight* answers." className="font-display text-[clamp(36px,4.6vw,64px)]" />
          <Reveal delay={0.2} y={16}>
            <p className="mt-5 max-w-[38ch] text-[16px] leading-relaxed text-body">
              The things judges, donors and responders ask us first.
            </p>
          </Reveal>
          <Reveal delay={0.3} y={20} className="mt-8 max-w-[420px] rounded-2xl bg-blue p-6 text-white">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-white">Try saying</p>
            <p className="mt-3 text-[17px] font-medium leading-snug">
              “$10 per hurricane on the US Gulf Coast, max $60 a year, only if forecasts are confident.”
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-white">
              The Concierge turns that into a pledge card you confirm before anything is saved.
            </p>
            <PillButton href="/pledge" variant="sky" className="mt-5">
              Try the Concierge
            </PillButton>
          </Reveal>
        </div>

        <ul className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <li key={f.q} className={`rounded-2xl transition-colors ${isOpen ? "bg-white" : "bg-white/60 hover:bg-white"}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span className="text-[17px] font-semibold text-ink">{f.q}</span>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                      isOpen ? "rotate-45 bg-blue text-white" : "bg-ice text-ink"
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                      <path d="M8 2 v12 M2 8 h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-6 text-[15px] leading-relaxed text-body">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
