import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";
import { TrancheCards } from "@/components/illustrations/Spots";

export default function Evidence() {
  return (
    <section className="relative overflow-hidden bg-sky px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <WordReveal
          text="Up to 72 hours *ahead.* Not weeks after."
          from="#9db8dc"
          className="font-display max-w-[24ch] text-[clamp(40px,5.6vw,76px)]"
        />
        <div className="mt-10 grid items-center gap-10 md:grid-cols-2">
          <Reveal scale={0.9} className="w-full max-w-[440px]">
            <TrancheCards className="w-full" />
          </Reveal>
          <Reveal delay={0.2} y={24}>
            <p className="max-w-[46ch] text-[16px] leading-relaxed text-body">
              Aid usually arrives after families have already sold assets, cut meals or taken on debt. Research from Bangladesh
              suggests earlier cash helps: households paid before the 2020 flood peak lost fewer assets and showed earlier signs
              of recovery. Yet money triggered by forecasts mostly lives inside institutions, and in 2025 seven countries absorbed
              66% of it. LEVee opens it to anyone with PayPal.
            </p>
            <p className="mt-3 max-w-[46ch] text-[12px] leading-relaxed text-[#3d5a80]">
              Sources: Pople, Hill, Dercon and Brunckhorst, The Importance of Being Early? (Bangladesh, not Helene or the US);
              ALNAP, Global Humanitarian Assistance 2026.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PillButton href="/pledge" variant="navy">
                Start a pledge
              </PillButton>
              <PillButton href="#how" variant="ghost">
                How it works
              </PillButton>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
