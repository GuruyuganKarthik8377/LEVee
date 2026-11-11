"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";

/** Counts from 0 up to `to` the first time it scrolls into view, with thousands separators. */
export default function CountUp({ to, prefix = "", duration = 1.2 }: { to: number; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, { duration, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [inView, to, duration]);

  return (
    <span ref={ref} aria-label={`${prefix}${to.toLocaleString("en-US")}`}>
      {prefix}
      {n.toLocaleString("en-US")}
    </span>
  );
}
