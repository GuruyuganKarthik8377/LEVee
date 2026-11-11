"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";

const SEEN_KEY = "levee:intro-seen";

let introDone = false;
const listeners = new Set<() => void>();

function finishIntro() {
  introDone = true;
  listeners.forEach((l) => l());
}

/** True once the splash has slid away, so the hero can start its own animation. */
export function useIntroDone() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => introDone,
    () => false,
  );
}

/** Opening splash: a blue coin rolls in and parts the wordmark, then the page slides in. */
export default function IntroLoader() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setShow(false), seen || reduced ? 0 : 1700);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence onExitComplete={finishIntro}>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-paper"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          aria-hidden
        >
          {/* same two fonts as the Brand wordmark, split so the coin can roll between them */}
          <div className="flex items-center text-[clamp(56px,10vw,104px)] text-link">
            <motion.span
              className="font-sans font-bold tracking-[-0.04em]"
              initial={{ x: 0 }}
              animate={{ x: -14 }}
              transition={{ delay: 0.55, duration: 0.4 }}
            >
              LEV
            </motion.span>
            <motion.span
              className="mx-1 inline-block h-[0.62em] w-[0.62em] rounded-full bg-[radial-gradient(circle_at_35%_30%,#60cdff,#0070e0)]"
              initial={{ x: "-45vw", rotate: -540, scale: 0.6 }}
              animate={{ x: 0, rotate: 0, scale: [0.6, 1.15, 1] }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.span
              className="font-serif text-[1.18em] italic leading-none"
              initial={{ x: 0 }}
              animate={{ x: 14 }}
              transition={{ delay: 0.55, duration: 0.4 }}
            >
              ee
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
