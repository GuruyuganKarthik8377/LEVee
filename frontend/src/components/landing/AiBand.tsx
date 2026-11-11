import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";
import { ForecastLaptop } from "@/components/illustrations/Spots";

const RULES = ["GDACS Orange or Red alert", "Landfall inside 72 hours", "Sentinel confidence 70 or more"];

export default function AiBand() {
  return (
    <section className="relative overflow-hidden bg-blue-section px-4 py-20 [--accent-color:#60cdff] md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <div>
          <WordReveal
            text="AI reads the storm. Rules move the *money.*"
            from="rgba(255,255,255,0.35)"
            to="#ffffff"
            className="font-display text-[clamp(36px,4.6vw,64px)]"
          />
          <Reveal delay={0.3} y={20}>
            <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-white/85">
              Sentinel reads GDACS alerts and GloFAS river ensembles every hour and scores how sure it is. But a score never
              moves money on its own. Only the region&apos;s published playbook can, and only when all three rules pass.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {RULES.map((r) => (
                <li
                  key={r}
                  className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[13px] font-semibold text-white"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                    <circle cx="8" cy="8" r="8" fill="#2fbf71" />
                    <path d="M4.5 8.2 l2.2 2.2 l4.6 -4.8" stroke="#fff" strokeWidth="1.8" fill="none" />
                  </svg>
                  {r}
                </li>
              ))}
            </ul>
            <PillButton href="#agents" variant="sky" className="mt-8">
              Meet the agents
            </PillButton>
          </Reveal>
        </div>
        <Reveal scale={0.9} className="mx-auto w-full max-w-[520px]">
          <ForecastLaptop className="w-full" />
        </Reveal>
      </div>
    </section>
  );
}
