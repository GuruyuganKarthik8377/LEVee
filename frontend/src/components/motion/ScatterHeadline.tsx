"use client";

import { motion } from "motion/react";
import { plainText, withBrand } from "@/components/ui/Brand";

// Fixed offsets so server and client render the same scatter.
const OFFSETS = [
  { x: 40, y: 30, c: "#001c64" },
  { x: 60, y: 40, c: "#0a2e7a" },
  { x: -40, y: 70, c: "#3d6db5" },
  { x: 30, y: 100, c: "#9db8dc" },
  { x: -30, y: 60, c: "#5b86c4" },
];

/** Words start scattered in a staircase and settle into one tight headline. */
export default function ScatterHeadline({ lines, className = "" }: { lines: string[][]; className?: string }) {
  let n = 0;
  return (
    <motion.h2
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ staggerChildren: 0.12 }}
      aria-label={plainText(lines.map((l) => l.join(" ")).join(" "))}
    >
      {lines.map((line, li) => (
        <span key={li} className="block" aria-hidden>
          {line.map((word) => {
            const o = OFFSETS[n++ % OFFSETS.length];
            return (
              <motion.span
                key={word}
                className="inline-block px-[0.12em]"
                variants={{
                  hidden: { x: o.x, y: o.y, color: o.c, opacity: 0.2 },
                  show: {
                    x: 0,
                    y: 0,
                    opacity: 1,
                    color: "#001c64",
                    transition: { type: "spring", stiffness: 120, damping: 18, color: { duration: 0.9 } },
                  },
                }}
              >
                {withBrand(word)}
              </motion.span>
            );
          })}
        </span>
      ))}
    </motion.h2>
  );
}
