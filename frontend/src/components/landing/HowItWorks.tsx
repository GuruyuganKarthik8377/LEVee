import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";

const STEPS = [
  { title: "Pledge once", body: "The Concierge reads your intent in plain words. PayPal Vault saves your consent.", always: true },
  { title: "Watch forecasts", body: "Sentinel reads GDACS and GloFAS every hour and scores its confidence.", always: true },
  { title: "Check the playbook", body: "Fixed rules check the alert level, the lead time and a confidence of 70 or more." },
  { title: "Notify donors", body: "A notice before each charge with a single tap skip, always inside your yearly cap." },
  { title: "Charge, pay out", body: "Orders captures vaulted pledges. Payouts sends tranche 1 to partners in one batch.", key: true },
  { title: "Responders act", body: "Evacuation transport, food and securing assets, all before the storm hits." },
  { title: "Verify proof", body: "The Verifier checks lists, photos and receipts. Tranche 2 needs a pass." },
  { title: "Tell the donor", body: "The Narrator sends your receipt and story. Corporate matches get invoiced." },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-white px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-end gap-6 md:grid-cols-[1.2fr_1fr]">
          <WordReveal text="Eight steps from forecast to *receipt*" className="font-display text-[clamp(36px,4.6vw,64px)]" />
          <Reveal delay={0.2} y={16}>
            <p className="max-w-[44ch] text-[16px] leading-relaxed text-body md:pb-2">
              Steps one and two run all the time. Steps three to eight run once per storm, and tranche 2 moves only after
              landfall is confirmed.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={(i % 4) * 0.08} className="h-full">
              <div
                className={`flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1 ${
                  s.key ? "bg-blue text-white" : "bg-paper text-body"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-display text-[40px] ${s.key ? "text-gold" : "text-link"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                      s.key ? "bg-navy/35 text-white" : s.always ? "bg-ice text-ink" : "bg-sky text-ink"
                    }`}
                  >
                    {s.key ? "Money moves" : s.always ? "Always on" : "Per storm"}
                  </span>
                </div>
                <h3 className={`font-display mt-4 text-[22px] ${s.key ? "text-white" : "text-ink"}`}>{s.title}</h3>
                <p className={`mt-2 text-[14px] leading-relaxed ${s.key ? "text-white" : ""}`}>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
