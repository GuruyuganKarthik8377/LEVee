"use client";

import { useEffect, useState } from "react";
import { REPLAY_START } from "@/fixtures/helene";

/** Runs from the first GDACS advisory to landfall, the two moments the replay is sure of. */
const START_SECONDS = Math.round(-REPLAY_START * 3600);

function format(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Replay badge that ticks down to Helene's landfall, the clock from the demo script's opening shot. */
export default function Countdown() {
  const [left, setLeft] = useState(START_SECONDS);

  useEffect(() => {
    const id = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : START_SECONDS)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-2.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-ink shadow-[0_6px_20px_rgba(0,28,100,0.08)]">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-strong opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#0070e0]" />
      </span>
      Helene replay · landfall in
      <span className="font-mono tabular-nums text-link">{format(left)}</span>
    </span>
  );
}
