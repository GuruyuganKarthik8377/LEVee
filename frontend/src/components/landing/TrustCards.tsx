import Reveal from "@/components/motion/Reveal";
import WordReveal from "@/components/motion/WordReveal";
import PillButton from "@/components/ui/PillButton";
import { ProofPhotos, ReceiptPhone, ResponderCrates } from "@/components/illustrations/Spots";

const RESPONDER_PERKS = ["Paid to your PayPal account", "One batch per tranche", "Upload proof from a phone"];

export default function TrustCards() {
  return (
    <section id="responders" className="bg-navy px-4 py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
        <Reveal className="flex h-full flex-col rounded-2xl bg-sky p-7 md:p-8">
          {/* both card titles reserve two lines so the illustrations line up */}
          <h3 className="font-display min-h-[2.1em] text-[clamp(28px,3vw,36px)] text-ink">Every dollar, traceable</h3>
          <ReceiptPhone className="mx-auto my-6 w-[78%]" />
          <p className="mt-auto text-[15px] leading-relaxed text-body">
            Ask “where did my $10 go?” and get the real PayPal transaction, plus the story of what it paid for.
          </p>
        </Reveal>

        <Reveal delay={0.12} className="flex h-full flex-col rounded-2xl bg-sky-strong p-7 md:p-8">
          <h3 className="font-display min-h-[2.1em] text-[clamp(28px,3vw,36px)] text-ink">Tranche 2 only after proof</h3>
          <ProofPhotos className="mx-auto my-6 w-[78%]" />
          <p className="mt-auto text-[15px] leading-relaxed text-body">
            Responders upload distribution lists, photos and receipts. The Verifier catches a reused photo before another cent
            moves.
          </p>
        </Reveal>

        <Reveal className="relative overflow-hidden rounded-2xl bg-blue-bright p-7 [--accent-color:#ffc439] md:col-span-2 md:p-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div className="relative z-10">
              <WordReveal
                text="Built for *local* responders"
                from="rgba(255,255,255,0.4)"
                to="#ffffff"
                as="h3"
                className="font-display text-[clamp(32px,4vw,48px)]"
              />
              <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-white">
                You already run early action plans and beneficiary lists. What you lack is flexible money in time. LEVee can send it
                up to 72 hours before landfall, and your console shows allocations, proof uploads and payout status in one place.
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {RESPONDER_PERKS.map((p) => (
                  <li key={p} className="rounded-full bg-navy/35 px-3 py-1.5 text-[12px] font-semibold text-white">
                    {p}
                  </li>
                ))}
              </ul>
              <PillButton href="/responder" variant="sky" className="mt-7">
                Open responder console
              </PillButton>
            </div>
            <ResponderCrates className="w-full max-w-[440px] justify-self-center" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
