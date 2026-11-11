import PillNav from "@/components/PillNav";
import Footer from "@/components/landing/Footer";
import WordReveal from "@/components/motion/WordReveal";
import ReplayStatus from "./ReplayStatus";
import { FIGURES_PENDING, REPLAY_NOTE } from "@/fixtures/helene";

const TONES = {
  blue: "bg-ice text-link",
  sky: "bg-sky text-ink",
  green: "bg-[#dff5e8] text-[#1b7a48]",
  gold: "bg-[#ffedb8] text-[#7a5a00]",
  red: "bg-[#fde8e6] text-[#a8261b]",
  grey: "bg-paper text-[#5f6b7a] ring-1 ring-inset ring-ice",
  navy: "bg-navy text-white",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone = "blue", className = "", children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5 ${TONES[tone]} ${className}`}>{children}</span>;
}

export function Card({ className = "", pad = "p-6", children }: { className?: string; pad?: string; children: React.ReactNode }) {
  return <div className={`rounded-[24px] bg-white ${pad} shadow-[0_20px_60px_rgba(0,28,100,0.08)] ring-1 ring-ice ${className}`}>{children}</div>;
}

export function Label({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <p className={`text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5f6b7a] ${className}`}>{children}</p>;
}

/** Frame for the product screens: nav, a short header, content, footer. */
function ReplayNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[13px] leading-relaxed text-[#5f6b7a] ${className}`}>
      {REPLAY_NOTE}
      {FIGURES_PENDING && " Figures show a dash until the replay has been run."}
    </p>
  );
}

/** The replay's clock and note inside a page, for pages that show the Helene replay only to some visitors (the responder console). */
export function ReplayHeader() {
  return (
    <div className="mb-6 space-y-2">
      <ReplayStatus />
      <ReplayNote />
    </div>
  );
}

export function AppPage({
  badge,
  title,
  intro,
  actions,
  status = true,
  replay = true,
  children,
}: {
  badge: string;
  title: string;
  intro: string;
  actions?: React.ReactNode;
  status?: boolean;
  /** False for a page that isn't about the Helene replay, so it doesn't carry the replay's note. */
  replay?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <PillNav app />
      <main className="min-h-svh bg-paper pb-20 pt-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-link ring-1 ring-ice">
              <span className="h-1.5 w-1.5 rounded-full bg-blue" />
              {badge}
            </span>
            {status && <ReplayStatus />}
          </div>
          <WordReveal play as="h1" text={title} className="font-display mt-4 text-[clamp(34px,4.2vw,56px)]" />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <p className="max-w-[62ch] text-[16px] leading-relaxed text-body">{intro}</p>
            {actions}
          </div>
          {replay && <ReplayNote className="mt-2" />}
          <div className="mt-6">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
