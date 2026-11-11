import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";
import { CapSafe } from "@/components/illustrations/Spots";

const PROMISES = [
  "A yearly cap you set and control",
  "A notice before every single charge",
  "Skip any storm with one tap",
  "Choose to give only once landfall is confirmed",
];

export default function NoSurprises() {
  return (
    <section className="bg-white px-4 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <Reveal scale={0.9} className="order-2 mx-auto w-full max-w-[440px] md:order-1">
          <CapSafe className="w-full" />
        </Reveal>
        <div className="order-1 md:order-2">
          <WordReveal text="No surprise charges. *Ever.*" className="font-display text-[clamp(36px,4.6vw,64px)]" />
          <Reveal delay={0.3} y={20}>
            <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-body">
              Surprise charges sank earlier experiments in automatic giving. LEVee is built the other way round: you always
              hear from us first, and every charge lands on a receipt.
            </p>
            <ul className="mt-6 space-y-3">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-3 text-[15px] font-medium text-ink">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ice">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M3.5 8.2 l2.8 2.8 l6 -6.2" stroke="#0070e0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <PillButton href="/pledge" variant="sky" className="mt-8">
              Set my pledge
            </PillButton>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
