"use client";

import WordReveal from "@/components/motion/WordReveal";
import CountUp from "@/components/motion/CountUp";

const STATS = [
  { value: 5, label: "PayPal capabilities", note: "Vault, Orders, Payouts, Webhooks, Invoicing" },
  { value: 5, label: "AI agents", note: "Concierge, Sentinel, Allocator, Verifier, Narrator" },
  { value: 1, label: "Rulebook moves money", note: "A deterministic Policy Engine with published playbooks" },
  { value: 0, label: "Crypto needed", note: "Works for anyone with PayPal, in about 200 markets" },
];

export default function Stats() {
  return (
    <section className="bg-blue-section px-4 py-20 text-white [--accent-color:#60cdff] md:py-24">
      <div className="mx-auto max-w-6xl">
        <WordReveal
          text="Built on rails donors *already* use"
          from="rgba(255,255,255,0.35)"
          to="#ffffff"
          className="font-display max-w-[20ch] text-[clamp(36px,4.6vw,64px)]"
        />
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="border-t-2 border-white/25 pt-5">
              <p className="font-display text-[clamp(64px,7vw,96px)] leading-[0.95] text-gold">
                <CountUp to={s.value} />
              </p>
              <p className="font-display mt-2 text-[20px]">{s.label}</p>
              <p className="mt-2 max-w-[28ch] text-[14px] leading-relaxed text-white/80">{s.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
