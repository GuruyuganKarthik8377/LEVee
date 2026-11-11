"use client";

import { motion } from "motion/react";
import { plainText, withBrand } from "@/components/ui/Brand";

type Props = {
  text: string;
  className?: string;
  /** Colour each word starts at before settling on the final colour. */
  from?: string;
  to?: string;
  delay?: number;
  stagger?: number;
  /** Drive the animation manually instead of on scroll into view. */
  play?: boolean;
  as?: "h1" | "h2" | "h3" | "p";
};

/** Headline that lands word by word, fading from a pale tint to its final colour. */
export default function WordReveal({
  text,
  className = "",
  from = "#b9d5f2",
  to = "var(--color-ink)",
  delay = 0,
  stagger = 0.09,
  play,
  as = "h2",
}: Props) {
  const Tag = motion[as];
  const words = text.split(" ");
  const trigger =
    play === undefined
      ? { whileInView: "show", viewport: { once: true, amount: 0.2 } }
      : { animate: play ? "show" : "hidden" };

  return (
    <Tag
      className={className}
      initial="hidden"
      {...trigger}
      transition={{ delayChildren: delay, staggerChildren: stagger }}
      aria-label={plainText(text)}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden
          className="inline-block whitespace-pre"
          variants={{
            hidden: { opacity: 0, y: "0.35em", color: from },
            show: {
              opacity: 1,
              y: 0,
              color: to,
              transition: {
                opacity: { duration: 0.35 },
                y: { type: "spring", stiffness: 260, damping: 24 },
                color: { duration: 0.6, delay: 0.25 },
              },
            },
          }}
        >
          {withBrand(word)}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}
