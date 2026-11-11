import ScatterHeadline from "@/components/motion/ScatterHeadline";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";
import { FloorScene } from "@/components/illustrations/Scene";
import { ProofFolder, StackedCoins } from "@/components/illustrations/Spots";

export default function Outro() {
  return (
    <section className="relative overflow-hidden bg-white">
      <FloorScene className="absolute inset-x-0 bottom-0 h-[340px] md:h-[440px]" />
      <StackedCoins className="absolute left-[22%] top-[22%] hidden w-12 animate-float md:block" />
      <ProofFolder className="absolute right-[20%] top-[24%] hidden w-14 animate-float-slow md:block" />

      <div className="relative z-10 flex flex-col items-center px-4 pb-64 pt-28 text-center md:pb-80 md:pt-36">
        <ScatterHeadline
          lines={[
            ["Your", "pledge."],
            ["Their", "LEVee."],
          ]}
          className="font-display text-[clamp(44px,6vw,80px)]"
        />
        <Reveal delay={0.4} y={16}>
          <p className="mx-auto mt-4 max-w-[42ch] text-[16px] text-body">
            A levee holds the water back. Yours holds back the losses, from forecast to receipt.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PillButton href="/pledge">Pledge now</PillButton>
            <PillButton href="#how" variant="light">
              Learn more
            </PillButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
