import Reveal from "@/components/motion/Reveal";
import { IconEarly, IconPledge, IconProof } from "@/components/illustrations/Spots";

const FEATURES = [
  {
    Icon: IconPledge,
    title: "Pledge once",
    body: "Say it in plain words, like “$10 per hurricane, max $60 a year.” Save your PayPal account once and you are set.",
  },
  {
    Icon: IconEarly,
    title: "Paid before landfall",
    body: "When a forecast crosses a published threshold, the first tranche can reach responders up to 72 hours before landfall.",
  },
  {
    Icon: IconProof,
    title: "Money follows proof",
    body: "The rest moves only after responders show what they delivered. Every dollar stays on the record.",
  },
];

export default function Features() {
  return (
    <section className="bg-white px-4 py-20 md:py-24">
      <div className="mx-auto grid max-w-5xl gap-14 md:grid-cols-3 md:gap-10">
        {FEATURES.map(({ Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 0.12} className="flex flex-col items-center text-center">
            <div className="halo flex h-36 w-36 items-center justify-center">
              <Icon className="h-32 w-32" />
            </div>
            <h3 className="font-display mt-6 text-[24px] text-ink">{title}</h3>
            <p className="mt-2 max-w-[30ch] text-[15px] leading-relaxed text-body">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
