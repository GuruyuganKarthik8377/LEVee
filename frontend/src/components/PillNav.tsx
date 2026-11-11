"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logOut, useAccount, type Account } from "@/lib/account";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type Variants,
} from "motion/react";
import Logo from "@/components/ui/Logo";

/* Each icon draws itself and has its own small move, played when its link is hovered or becomes active. */
const ICONS = {
  gear: {
    shape: (
      <>
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      </>
    ),
    hover: { rotate: 135, transition: { type: "spring", stiffness: 140, damping: 9 } },
  },
  spark: {
    shape: (
      <>
        <path d="M11 4l1.8 5.2L18 11l-5.2 1.8L11 18l-1.8-5.2L4 11l5.2-1.8z" />
        <path d="M19 16v4M17 18h4" />
      </>
    ),
    hover: { scale: [1, 1.35, 0.9, 1.1, 1], rotate: [0, -16, 14, -6, 0], transition: { duration: 0.6 } },
  },
  truck: {
    shape: (
      <>
        <path d="M2.5 6.5h11v10h-11zM13.5 10h4l4 3.8v2.7h-8z" />
        <circle cx="7" cy="18" r="1.8" />
        <circle cx="17" cy="18" r="1.8" />
      </>
    ),
    hover: { x: [0, 4, -2, 1, 0], rotate: [0, -5, 2, 0, 0], transition: { duration: 0.6 } },
  },
  storm: {
    shape: (
      <>
        <path d="M12 3.5c7.5 0 10 6.5 4.5 10M12 20.5c-7.5 0-10-6.5-4.5-10" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </>
    ),
    hover: { rotate: [0, 360], transition: { duration: 0.9, ease: "easeOut" } },
  },
  ask: {
    shape: (
      <>
        <path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
        <path d="M9.8 9a2.3 2.3 0 1 1 3.3 2.1c-.8.4-1.1.9-1.1 1.6M12 15.3h.01" />
      </>
    ),
    hover: { rotate: [0, -18, 14, -8, 0], y: [0, -2, 0, -1, 0], transition: { duration: 0.6 } },
  },
  heart: {
    shape: <path d="M12 20s-7.8-4.7-9.2-9.5C1.9 7.1 4.2 4.5 7 4.5c2 0 3.7 1.1 5 3.2 1.3-2.1 3-3.2 5-3.2 2.8 0 5.1 2.6 4.2 6C19.8 15.3 12 20 12 20Z" />,
    hover: { scale: [1, 1.32, 1, 1.2, 1], transition: { duration: 0.65 } },
  },
  shield: {
    shape: (
      <>
        <path d="M12 3l7.5 3v5.5c0 4.5-3 7.8-7.5 9.5-4.5-1.7-7.5-5-7.5-9.5V6z" />
        <path d="M8.5 12l2.4 2.4 4.6-5" />
      </>
    ),
    hover: { y: [0, -4, 0, -2, 0], scale: [1, 1.12, 0.95, 1.05, 1], transition: { duration: 0.6 } },
  },
  radar: {
    shape: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 12l5.5-5.5" />
      </>
    ),
    hover: { rotate: [0, 360], transition: { duration: 1, ease: "linear" } },
  },
  route: {
    shape: (
      <>
        <circle cx="6" cy="19" r="2.2" />
        <circle cx="18" cy="5" r="2.2" />
        <path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" />
      </>
    ),
    hover: { x: [0, 3, -2, 1, 0], transition: { duration: 0.6 } },
  },
  sliders: {
    shape: <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4" />,
    hover: { scale: [1, 1.2, 0.95, 1], transition: { duration: 0.5 } },
  },
  book: {
    shape: (
      <>
        <path d="M12 6.5C10 5 7 4.5 3.5 5v14c3.500-.5 6.500 0 8.500 1.500 2-1.500 5-2 8.500-1.500V5C17 4.500 14 5 12 6.500Z" />
        <path d="M12 6.500V20.500" />
      </>
    ),
    hover: { rotate: [0, -8, 7, -3, 0], transition: { duration: 0.55 } },
  },
  log: {
    shape: (
      <>
        <path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
    hover: { rotate: [0, -10, 9, -4, 0], transition: { duration: 0.55 } },
  },
} satisfies Record<string, { shape: React.ReactNode; hover: Variants[string] }>;

type IconName = keyof typeof ICONS;

// In page order, so the active pill moves left to right as you scroll down.
const LINKS: { id: string; label: string; icon: IconName }[] = [
  { id: "how", label: "How it works", icon: "gear" },
  { id: "agents", label: "Agents", icon: "spark" },
  { id: "responders", label: "Responders", icon: "truck" },
  { id: "replay", label: "Replay", icon: "storm" },
  { id: "faq", label: "FAQ", icon: "ask" },
];

// The product screens, reached by route rather than by section.
const APP_MAIN: typeof LINKS = [
  { id: "/give", label: "Give now", icon: "heart" },
  { id: "/run", label: "Live demo", icon: "route" },
  { id: "/replay/helene", label: "Replay", icon: "storm" },
  { id: "/live", label: "Storms", icon: "radar" },
];

// The bar can only hold so many links, so the rest sit in a menu that says what each one is.
const APP_MORE: ((typeof LINKS)[number] & { note: string })[] = [
  { id: "/track", label: "Your $10", icon: "route", note: "Where one gift goes, step by step" },
  { id: "/simulate", label: "Simulator", icon: "sliders", note: "Try to break the rules" },
  { id: "/donor", label: "Donor", icon: "heart", note: "Notices, receipts and questions" },
  { id: "/responder", label: "Responder", icon: "truck", note: "A partner's funds and proof" },
  { id: "/ops", label: "Ops", icon: "shield", note: "Approvals and reviews" },
  { id: "/transparency", label: "Open books", icon: "book", note: "Money, rules and forecasts" },
  { id: "/audit", label: "Audit log", icon: "log", note: "Every decision, explained" },
];

const APP_LINKS: typeof LINKS = [...APP_MAIN, ...APP_MORE];

const LIST: Variants = { hidden: {}, show: { transition: { delayChildren: 0.35, staggerChildren: 0.06 } } };
const ITEM: Variants = {
  hidden: { opacity: 0, y: -16, scale: 0.8 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 15 } },
};
const LETTER: Variants = {
  rest: { y: 0 },
  hover: (i: number) => ({ y: [0, -4, 0], transition: { duration: 0.34, delay: i * 0.024, ease: "easeOut" } }),
};
const ICON_REST: Variants[string] = { rotate: 0, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 20 } };

function NavIcon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const { shape, hover } = ICONS[name];
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={{ rest: ICON_REST, hover }}
      aria-hidden
    >
      {shape}
    </motion.svg>
  );
}

/** The label, split so its letters can hop in a wave. The link carries the real name for screen readers. */
function HopLabel({ text }: { text: string }) {
  return (
    <span aria-hidden className="inline-flex whitespace-pre">
      {[...text].map((letter, i) => (
        <motion.span key={i} custom={i} variants={LETTER} className="inline-block">
          {letter}
        </motion.span>
      ))}
    </span>
  );
}

/** Leans gently toward the cursor and squishes when pressed. */
function Magnetic({ children }: { children: React.ReactNode }) {
  const calm = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 260, damping: 15, mass: 0.5 };
  const pullX = useSpring(x, spring);
  const pullY = useSpring(y, spring);

  return (
    <motion.div
      style={{ x: pullX, y: pullY }}
      whileTap={{ scale: 0.93 }}
      onPointerMove={(e) => {
        if (calm || e.pointerType !== "mouse") return;
        const box = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - box.left - box.width / 2) * 0.2);
        y.set((e.clientY - box.top - box.height / 2) * 0.3);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** The rest of the product screens, opened by hover, click or keyboard. */
function ExploreMenu({ active }: { active: string | null }) {
  const [open, setOpen] = useState(false);
  const current = APP_MORE.some((l) => l.id === active);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full px-2.5 py-2 font-medium whitespace-nowrap transition-colors duration-200 xl:px-3.5 ${current || open ? "bg-ice-soft text-link" : "text-[#4a5768]"}`}
      >
        Explore
        <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M2.500 4.500 6 8l3.500-3.500" fill="none" stroke="currentColor" strokeWidth="1.800" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          /* The top padding is part of the hover area, so moving down to the menu doesn't close it. */
          <motion.div
            className="absolute right-0 top-full w-[290px] pt-3"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <ul className="rounded-3xl bg-white p-2 shadow-[0_18px_50px_rgba(0,28,100,0.18)] ring-1 ring-ice">
              {APP_MORE.map((l) => (
                <li key={l.id}>
                  <motion.div initial="rest" whileHover="hover" animate="rest">
                    <Link
                      href={l.id}
                      aria-current={active === l.id ? "true" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-ice-soft ${active === l.id ? "bg-ice-soft" : ""}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ice-soft text-link">
                        <NavIcon name={l.icon} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-ink">{l.label}</span>
                        <span className="block text-[12px] leading-snug text-[#5f6b7a]">{l.note}</span>
                      </span>
                    </Link>
                  </motion.div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The id of the last section whose top has passed 40% of the viewport, or null while in the hero. */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const { id } of LINKS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return active;
}

function PledgeButton({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      href="/pledge"
      onClick={onClick}
      className={`group inline-flex items-center justify-center gap-2.5 rounded-full bg-blue py-1.5 pl-1.5 pr-5 text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-[#003087] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`}
    >
      <span className="animate-coin-nudge">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-[14px] font-bold text-outline shadow-[inset_0_-2px_0_#c28a0e] transition-transform duration-700 ease-out group-hover:rotate-[360deg]">
          $
        </span>
      </span>
      Pledge now
    </Link>
  );
}

/** Secondary pill, the same 44px height as Pledge now, so the two read as a pair. Logged in, it shows who you are and logs you out. */
function LoginButton({ className = "", onClick, account }: { className?: string; onClick?: () => void; account: Account | null }) {
  const style = `group inline-flex h-11 shrink-0 whitespace-nowrap items-center justify-center gap-2 rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link ring-1 ring-inset ring-ice transition-colors duration-200 hover:bg-ice hover:ring-ice-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${className}`;
  const icon = (
    <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" aria-hidden>
      <circle cx="10" cy="6.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 17.5c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
  if (account) {
    return (
      <button
        type="button"
        title={`Logged in as ${account.email}`}
        aria-label={`Log out, logged in as ${account.email}`}
        onClick={() => {
          onClick?.();
          void logOut();
        }}
        className={style}
      >
        {icon}
        <span className="max-w-[10ch] truncate">{account.name.split(" ")[0]}</span>
        <span aria-hidden className="text-[#8c9bae]">·</span>
        Log out
      </button>
    );
  }
  return (
    <Link href="/login" onClick={onClick} className={style}>
      {icon}
      Log in
    </Link>
  );
}

/** On the homepage links are plain #anchors (smooth scroll); elsewhere pass base="/" so they lead back home, or app for the product screens. */
export default function PillNav({ base = "", app = false }: { base?: string; app?: boolean }) {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  const [hovered, setHovered] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const section = useActiveSection();
  const pathname = usePathname();
  const links = app ? APP_LINKS : LINKS;
  const active = app ? (APP_LINKS.find((l) => pathname.startsWith(l.id))?.id ?? null) : section;
  const hrefFor = (id: string) => (app ? id : `${base}#${id}`);

  const calm = useReducedMotion();
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  // the bar leans into a fast scroll, and a coin rolls along its bottom edge as you read
  const speed = useVelocity(scrollY);
  const lean = useSpring(useTransform(speed, [-2400, 2400], [-1.2, 1.2]), { stiffness: 200, damping: 24 });
  const coinAt = useTransform(progress, [0, 1], ["0%", "100%"]);
  const coinTurn = useTransform(progress, [0, 1], [0, 2160]);

  const highlighted = hovered ?? active;

  return (
    <MotionConfig reducedMotion="user">
      <motion.header
        className="fixed inset-x-0 top-4 z-50 px-4"
        initial={{ y: -90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.2 }}
      >
        <motion.nav
          style={{ rotate: calm ? 0 : lean }}
          className={`relative mx-auto flex items-center justify-between gap-4 rounded-full px-3 transition-[max-width,padding,background-color,box-shadow] duration-500 ease-out ${
            scrolled
              ? "max-w-5xl bg-white/75 py-2 shadow-[0_12px_40px_rgba(0,28,100,0.14)] ring-1 ring-ice backdrop-blur-xl backdrop-saturate-150"
              : "max-w-6xl bg-white py-3 shadow-[0_8px_30px_rgba(0,28,100,0.08)]"
          }`}
        >
          <Logo className="pl-3" />

          <div className="hidden items-center gap-3 lg:flex xl:gap-5">
            <motion.ul variants={LIST} initial="hidden" animate="show" className="flex items-center gap-0.5 text-[14px]" onMouseLeave={() => setHovered(null)}>
              {(app ? APP_MAIN : links).map((l) => {
                const isActive = active === l.id;
                const lit = highlighted === l.id;
                return (
                  <motion.li key={l.id} variants={ITEM}>
                    <motion.div className="relative" initial="rest" animate={lit ? "hover" : "rest"} whileTap={{ scale: 0.92 }}>
                      {lit && (
                        <motion.span
                          layoutId="nav-pill"
                          className={`absolute inset-0 rounded-full ${isActive && !hovered ? "bg-ice" : "bg-ice-soft"}`}
                          transition={{ type: "spring", stiffness: 520, damping: 25, mass: 0.9 }}
                        />
                      )}
                      <Link
                        href={hrefFor(l.id)}
                        aria-label={l.label}
                        aria-current={isActive ? "true" : undefined}
                        onMouseEnter={() => setHovered(l.id)}
                        onFocus={() => setHovered(l.id)}
                        onBlur={() => setHovered(null)}
                        className={`relative z-10 flex items-center gap-1.5 rounded-full px-2.5 py-2 font-medium whitespace-nowrap transition-colors duration-200 xl:px-3.5 ${
                          lit ? "text-link" : "text-[#4a5768]"
                        }`}
                      >
                        <NavIcon name={l.icon} />
                        <HopLabel text={l.label} />
                      </Link>
                    </motion.div>
                  </motion.li>
                );
              })}
              {app && (
                <motion.li variants={ITEM}>
                  <ExploreMenu active={active} />
                </motion.li>
              )}
            </motion.ul>

            <div className="flex items-center gap-2">
              <Magnetic>
                <LoginButton account={account} />
              </Magnetic>
              <Magnetic>
                <PledgeButton />
              </Magnetic>
            </div>
          </div>

          <motion.button
            type="button"
            className={`mr-1 flex h-10 w-10 items-center justify-center rounded-full bg-ice-soft text-ink lg:hidden`}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            whileTap={{ scale: 0.86 }}
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 16 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <motion.path
                d="M2 5h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                animate={open ? { d: "M3 3l12 12" } : { d: "M2 5h14" }}
              />
              <motion.path
                d="M2 9h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                animate={{ opacity: open ? 0 : 1 }}
              />
              <motion.path
                d="M2 13h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                animate={open ? { d: "M3 15l12 -12" } : { d: "M2 13h14" }}
              />
            </svg>
          </motion.button>

          {/* reading progress along the bottom of the pill, with the coin rolling on its tip */}
          <span aria-hidden className={`pointer-events-none absolute inset-x-8 bottom-0 h-0 transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0"}`}>
            <motion.span style={{ scaleX: progress }} className="absolute inset-x-0 -top-[2px] h-[2px] origin-left rounded-full bg-gradient-to-r from-blue via-sky-strong to-gold" />
            <motion.span
              style={{ left: coinAt, rotate: calm ? 0 : coinTurn }}
              className="absolute -top-[9px] -ml-2 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold leading-none text-outline shadow-[inset_0_-1px_0_#c28a0e]"
            >
              $
            </motion.span>
          </span>
        </motion.nav>

        <AnimatePresence>
          {open && (
            <motion.div
              className={`mx-auto mt-2 max-h-[calc(100svh-7rem)] max-w-6xl origin-top overflow-y-auto rounded-3xl bg-white/90 p-6 shadow-[0_16px_40px_rgba(0,28,100,0.16)] ring-1 ring-ice backdrop-blur-xl lg:hidden`}
              initial={{ opacity: 0, y: -14, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 340, damping: 19 }}
            >
              <ul className="flex flex-col">
                {links.map((l, i) => (
                  <motion.li
                    key={l.id}
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.05 * i }}
                    className="border-b border-ice last:border-0"
                  >
                    <motion.div initial="rest" animate="hover" whileTap={{ scale: 0.97 }}>
                      <Link
                        href={hrefFor(l.id)}
                        onClick={() => setOpen(false)}
                        className={`font-display flex items-center gap-4 py-2.5 text-[26px] ${active === l.id ? "text-link" : "text-ink"}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ice-soft text-link">
                          <NavIcon name={l.icon} className="h-5 w-5" />
                        </span>
                        {l.label}
                      </Link>
                    </motion.div>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-5 flex items-center gap-3">
                <PledgeButton className="flex-1" onClick={() => setOpen(false)} />
                <LoginButton account={account} onClick={() => setOpen(false)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>
    </MotionConfig>
  );
}
