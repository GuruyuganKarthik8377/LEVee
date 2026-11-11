"use client";

import Link from "next/link";
import { useDemo } from "@/lib/demoStore";
import { clockText, stageIndex, whenText } from "@/lib/ledger";
import { STAGES } from "@/fixtures/helene";

/** Every screen reads the same replay, so each one says where it has got to and links back to the controls. */
export default function ReplayStatus() {
  const { clock } = useDemo();
  return (
    <Link
      href="/replay/helene"
      className="group inline-flex items-center gap-2 rounded-full bg-navy px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-blue-section"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
      {STAGES[stageIndex(clock)].title}
      <span className="font-medium tabular-nums text-white/70">{clock < 0 ? `${clockText(clock)} to landfall` : whenText(clock)}</span>
      <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden>
        <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
