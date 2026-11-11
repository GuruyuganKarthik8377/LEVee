import Link from "next/link";
import WordReveal from "@/components/motion/WordReveal";
import Reveal from "@/components/motion/Reveal";

const STROKE = "#001c64";

function Glyph({ name }: { name: string }) {
  const common = { stroke: STROKE, strokeWidth: 2.4, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "Concierge":
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <path d="M8 10 h24 a3 3 0 0 1 3 3 v12 a3 3 0 0 1 -3 3 h-14 l-6 5 v-5 h-4 a3 3 0 0 1 -3 -3 v-12 a3 3 0 0 1 3 -3z" {...common} />
          <path d="M13 18 h14 M13 23 h9" {...common} />
        </svg>
      );
    case "Sentinel":
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <path d="M20 8 C 32 8 36 18 28 23 M20 32 C 8 32 4 22 12 17" {...common} />
          <circle cx="20" cy="20" r="3" fill={STROKE} />
        </svg>
      );
    case "Allocator":
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <circle cx="20" cy="20" r="13" {...common} />
          <path d="M20 7 v13 l10 8" {...common} />
        </svg>
      );
    case "Verifier":
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <circle cx="17" cy="17" r="10" {...common} />
          <path d="M24.5 24.5 l8 8 M12.5 17 l3.2 3.2 l6 -6.4" {...common} />
        </svg>
      );
    case "Narrator":
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <rect x="7" y="10" width="26" height="20" rx="3" {...common} />
          <path d="M8 12 l12 9 l12 -9" {...common} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden>
          <rect x="10" y="18" width="20" height="15" rx="3" stroke="#fff" strokeWidth="2.4" fill="none" />
          <path d="M14 18 v-4 a6 6 0 0 1 12 0 v4" stroke="#fff" strokeWidth="2.4" fill="none" />
        </svg>
      );
  }
}

const AGENTS = [
  {
    name: "Concierge",
    role: "Turns plain words into a pledge",
    decides: "Amount per hurricane, yearly cap, and whether you give early or only once landfall is confirmed.",
    guard: "Schema checked. You confirm the card before PayPal Vault opens.",
    tone: "bg-sky",
    live: { href: "/pledge", label: "Describe a pledge in your own words" },
  },
  {
    name: "Sentinel",
    role: "Reads the storm",
    decides: "Whether GDACS, GloFAS and the news agree, how wide the forecast spread is, the lead time, and who is exposed.",
    guard: "Cannot move money. Its 0 to 100 score is one input to the rules.",
    tone: "bg-white",
    live: { href: "/live", label: "Ask it about a storm on the map today" },
  },
  {
    name: "Allocator",
    role: "Splits the pool",
    decides: "How to share money across partners when two storms overlap, with a reason for every split.",
    guard: "Sums and caps are rechecked. Large splits need one click of ops approval.",
    tone: "bg-sky",
    live: { href: "/run", label: "Run the PayPal demo with live AI" },
  },
  {
    name: "Verifier",
    role: "Checks the proof",
    decides: "Counts match amounts, dates fall before landfall, photos are not reused or edited, and locations fit.",
    guard: "Tranche 2 for a partner unlocks only on a pass.",
    tone: "bg-white",
    live: { href: "/responder", label: "Send it proof as a responder" },
  },
  {
    name: "Narrator",
    role: "Talks to donors",
    decides: "What each donor hears and when: a notice before each charge, a receipt, and an impact story in their language.",
    guard: "Read only. Pulls real transactions through the PayPal Agent Toolkit.",
    tone: "bg-sky",
    live: { href: "/run", label: "Ask it where your money went" },
  },
];

const PLAYBOOK = ["Orange or Red alert", "Landfall within 72h", "Confidence 70 or more"];

export default function Agents() {
  return (
    <section id="agents" className="bg-ice-soft px-4 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <WordReveal
          text="Five agents *propose.* One rulebook moves the money."
          className="font-display max-w-[26ch] text-[clamp(36px,4.6vw,64px)]"
        />
        <Reveal delay={0.2} y={16}>
          <p className="mt-5 max-w-[60ch] text-[16px] leading-relaxed text-body">
            AI does the judgment work rules cannot: do three noisy forecasts really agree, how should money split between two
            storms, is that photo recycled? A deterministic Policy Engine is the only thing allowed to move money, and every
            decision lands in a public audit log with its inputs and reasoning.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <Reveal key={a.name} delay={(i % 3) * 0.08} className="h-full">
              <article className={`flex h-full flex-col rounded-2xl p-7 ${a.tone}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80 ring-2 ring-outline">
                    <Glyph name={a.name} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[24px] text-ink">{a.name}</h3>
                    <p className="text-[13px] font-semibold text-link">{a.role}</p>
                  </div>
                </div>
                <p className="mt-5 text-[14px] leading-relaxed text-body">{a.decides}</p>
                <p className="mt-auto flex gap-2 border-t border-outline/15 pt-4 text-[13px] leading-snug text-body/90">
                  <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
                    <path d="M8 1 l6 2.2 v4.3 c0 3.8 -2.6 6.2 -6 7.5 c-3.4 -1.3 -6 -3.7 -6 -7.5 v-4.3z" fill="#ffc439" stroke={STROKE} strokeWidth="1.2" />
                  </svg>
                  <span>
                    <strong className="font-semibold text-ink">Guardrail.</strong> {a.guard}
                  </span>
                </p>
                <Link href={a.live.href} className="group mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-link hover:underline">
                  Try it: {a.live.label}
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden>
                    <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </article>
            </Reveal>
          ))}

          <Reveal delay={0.16} className="h-full">
            <article className="flex h-full flex-col rounded-2xl bg-navy p-7 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue ring-2 ring-white/40">
                  <Glyph name="Policy" />
                </span>
                <div>
                  <h3 className="font-display text-[24px]">Policy Engine</h3>
                  <p className="text-[13px] font-semibold text-sky-strong">Not AI. The only part that moves money.</p>
                </div>
              </div>
              <p className="mt-5 text-[14px] leading-relaxed text-white/85">
                The US Gulf Coast has a published Early Action Playbook, fixed before any storm forms. Tranche 1 fires only when every
                rule passes. Tranche 2 needs confirmed landfall plus a Verifier pass.
              </p>
              <ul className="mt-auto flex flex-wrap gap-2 pt-5">
                {PLAYBOOK.map((p) => (
                  <li key={p} className="rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-semibold">
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
