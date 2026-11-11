import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";
import PillButton from "@/components/ui/PillButton";
import Countdown from "@/components/landing/Countdown";
import { HELENE, REPLAY_NOTE, STORM_SOURCES } from "@/fixtures/helene";
import { NO_FIGURE, usd } from "@/lib/ledger";

const STEPS = [
  { title: "Watch", body: "Sentinel reads GDACS alerts and GloFAS river forecasts every hour and scores how sure it is." },
  { title: "Check", body: "The region's published playbook needs an Orange or Red alert, landfall inside 72 hours and a score of 70 or more." },
  { title: "Notice", body: "You get a notice before any charge, with a one tap skip. Your yearly cap always holds." },
  { title: "Charge and pay out", body: "Your pledge is charged and tranche 1 reaches vetted local responders in one Payouts batch.", key: true },
  { title: "Receipt", body: "The Narrator sends your receipt and the story of what your money did, in your language." },
];

const CONTROLS = [
  { title: "Yearly cap", body: "Set a maximum per year. We never charge past it.", icon: "M4 17h16M7 17V9m5 8V5m5 12v-6" },
  { title: "Notice first", body: "A message before every charge, never a surprise.", icon: "M12 4a5 5 0 0 0-5 5v3.2L5.5 15h13L17 12.2V9a5 5 0 0 0-5-5Zm-2 13a2 2 0 0 0 4 0" },
  { title: "Skip any storm", body: "One tap on the notice and that storm is skipped.", icon: "M6 6l12 12M18 6L6 18" },
  { title: "Confirmed only", body: "Give only once landfall is confirmed, if you prefer.", icon: "M5 12.5l4.2 4.2L19 7" },
];

const QUESTIONS = [
  {
    q: "When exactly am I charged?",
    a: "Only when a hurricane on the US Gulf Coast meets every rule of the published playbook, and only after a notice that lets you skip it.",
  },
  {
    q: "What if two storms hit at once?",
    a: "The Allocator splits money across them by need and partner capacity. Your yearly cap still holds across the whole year.",
  },
  {
    q: "Is my payment method safe?",
    a: "It is saved with PayPal Vault, with your consent. LEVee never sees your payment details.",
  },
];

const H2 = "font-display text-[clamp(36px,4.6vw,64px)]";

export default function PledgeDetails() {
  return (
    <>
      {/* how it works */}
      <section className="mt-24 bg-white px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-end gap-6 md:grid-cols-[1.2fr_1fr]">
            <WordReveal text="How your pledge *works*" className={H2} />
            <Reveal delay={0.2} y={16}>
              <p className="max-w-[44ch] text-[16px] leading-relaxed text-body md:pb-2">
                From the first forecast to your receipt, five steps. AI reads the storm; fixed rules decide when money moves.
              </p>
            </Reveal>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.07} className="h-full">
                <div className={`flex h-full flex-col rounded-2xl p-6 ${s.key ? "bg-blue text-white" : "bg-paper text-body"}`}>
                  <span className={`font-display text-[36px] ${s.key ? "text-gold" : "text-link"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={`font-display mt-3 text-[22px] ${s.key ? "text-white" : "text-ink"}`}>{s.title}</h3>
                  <p className={`mt-2 text-[14px] leading-relaxed ${s.key ? "text-white" : ""}`}>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* tranches */}
      <section className="bg-paper px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <WordReveal text="Two tranches, one *promise*" className={H2} />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Reveal className="rounded-2xl bg-sky p-8">
              <span className="rounded-full bg-white/70 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-ink">Before landfall</span>
              <h3 className="font-display mt-5 text-[clamp(28px,3vw,36px)] text-ink">Tranche 1</h3>
              <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-body">
                A small first part, sent as soon as the playbook is met, so responders can move people, stock food and secure homes
                before the storm arrives.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="rounded-2xl bg-blue p-8 text-white">
              <span className="rounded-full bg-navy/35 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider">After proof</span>
              <h3 className="font-display mt-5 text-[clamp(28px,3vw,36px)]">Tranche 2</h3>
              <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-white">
                The rest moves only after landfall is confirmed and the Verifier checks distribution lists, photos and receipts. A
                reused photo stops it.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.15} className="mt-6 flex flex-col gap-4 rounded-2xl bg-white p-6 ring-1 ring-ice sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-[20px] font-bold text-outline">?</span>
            <div>
              <h3 className="font-display text-[22px] text-ink">If the storm misses</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-body">
                Tranche 1 pays for early actions that help anyway, and tranche 2 is never charged. Choose Confirmed only if you would
                rather give only after landfall.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* controls */}
      <section className="bg-white px-4 py-20 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-end gap-6 md:grid-cols-[1.2fr_1fr]">
            <WordReveal text="You stay in *control*" className={H2} />
            <Reveal delay={0.2} y={16}>
              <p className="max-w-[44ch] text-[16px] leading-relaxed text-body md:pb-2">
                Automatic giving only works if you trust it, so these controls are built in.
              </p>
            </Reveal>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {CONTROLS.map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) * 0.07} className="h-full">
                <div className="flex h-full gap-4 rounded-2xl bg-paper p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ice text-link">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                      <path d={c.icon} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-display text-[20px] text-ink">{c.title}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-body">{c.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* storms watched */}
      <section className="bg-navy px-4 py-20 text-white [--accent-color:#ffc439] md:py-24">
        <div className="mx-auto max-w-6xl">
          <WordReveal text="The storm we *replay*" from="rgba(255,255,255,0.35)" to="#ffffff" className={H2} />
          <Reveal delay={0.1} className="mt-12 grid gap-6 rounded-[28px] bg-white/[0.06] p-6 ring-1 ring-inset ring-white/10 md:p-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-display text-[clamp(30px,3.4vw,44px)]">{HELENE.name}</h3>
                <span className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold">Past storm, replay</span>
              </div>
              <p className="mt-2 text-[15px] text-white/75">{HELENE.basin} · replay of September 2024 · landfall near Perry, Florida</p>
              <div className="mt-6">
                <Countdown />
              </div>
              <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
                <div>
                  <dt className="text-[12px] text-white/60">Confidence</dt>
                  <dd className="font-display mt-1 text-[28px]">{HELENE.brief.confidence ?? NO_FIGURE}</dd>
                  <div className="mt-2 h-1.5 rounded-full bg-white/15">
                    <div className="h-1.5 rounded-full bg-gold" style={{ width: `${HELENE.brief.confidence ?? 0}%` }} />
                  </div>
                </div>
                <div>
                  <dt className="text-[12px] text-white/60">Sample partners</dt>
                  <dd className="font-display mt-1 text-[28px]">{HELENE.partnersReady}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-white/60">Raised</dt>
                  <dd className="font-display mt-1 text-[28px]">{usd(HELENE.raised.total)}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl bg-white p-6 text-ink">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5f6b7a]">US Gulf Coast hurricane playbook</p>
              <ul className="mt-4 space-y-3">
                {["GDACS Orange or Red alert", "Landfall within 72 hours", "Sentinel confidence 70 or more"].map((r) => (
                  <li key={r} className="flex items-center gap-3 text-[15px] font-medium">
                    <svg viewBox="0 0 16 16" className="h-5 w-5 shrink-0" aria-hidden>
                      <circle cx="8" cy="8" r="8" fill="#2fbf71" />
                      <path d="M4.5 8.2l2.2 2.2 4.6-4.8" stroke="#fff" strokeWidth="1.8" fill="none" />
                    </svg>
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-[13px] leading-relaxed text-[#5f6b7a]">
                {REPLAY_NOTE} {STORM_SOURCES}
              </p>
              <PillButton href="/replay/helene" className="mt-5 w-full">
                Watch the replay
              </PillButton>
            </div>
          </Reveal>
        </div>
      </section>

      {/* questions */}
      <section className="bg-paper px-4 py-20 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <WordReveal text="Pledge *questions*" className={H2} />
            <Reveal delay={0.2} y={16}>
              <p className="mt-5 max-w-[38ch] text-[16px] leading-relaxed text-body">
                The questions donors ask most before they pledge.
              </p>
            </Reveal>
          </div>
          <div className="space-y-3">
            {QUESTIONS.map((item) => (
              <details key={item.q} className="group rounded-2xl bg-white/70 transition-colors open:bg-white hover:bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
                  <span className="text-[17px] font-semibold text-ink">{item.q}</span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ice text-ink transition-all duration-300 group-open:rotate-45 group-open:bg-blue group-open:text-white">
                    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </summary>
                <p className="px-6 pb-6 text-[15px] leading-relaxed text-body">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
