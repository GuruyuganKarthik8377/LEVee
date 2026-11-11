import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import Coin from "@/components/ui/Coin";
import Brand from "@/components/ui/Brand";

const ABOUT = [
  { href: "/#how", label: "How it works" },
  { href: "/#agents", label: "The five agents" },
  { href: "/give", label: "Give now" },
  { href: "/run", label: "Live PayPal demo" },
  { href: "/live", label: "Live storm watch" },
  { href: "/replay/helene", label: "Helene replay" },
  { href: "/track", label: "Follow your dollar" },
  { href: "/simulate", label: "Two storms simulator" },
  { href: "/transparency", label: "Open books" },
  { href: "/donor", label: "Donor notices" },
  { href: "/responder", label: "Responder console" },
  { href: "/ops", label: "Ops review" },
  { href: "/audit", label: "Public audit log" },
  { href: "/#faq", label: "FAQ" },
];

const BUILT_WITH = ["PayPal Vault, Orders and Payouts", "PayPal Agent Toolkit", "Claude", "GDACS and GloFAS forecasts", "Render"];

export default function Footer() {
  const demoUrl = process.env.NEXT_PUBLIC_DEMO_URL ?? "http://localhost:3000";

  return (
    <footer className="relative overflow-hidden bg-[#001435] px-4 pt-16 text-white">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-display max-w-[18ch] text-[26px] leading-tight">
            The easiest way to give before a storm lands
          </p>
          <div className="mt-6 flex items-center gap-6">
            <p className="max-w-[12ch] text-[20px] font-semibold leading-snug text-sky-strong">
              Scan to open the live demo
            </p>
            <div className="rounded-lg bg-white p-2">
              <QRCodeSVG value={demoUrl} size={92} fgColor="#000000" bgColor="#ffffff" />
            </div>
          </div>
        </div>

        <nav aria-label="About LEVee">
          <p className="text-[14px] font-semibold">About LEVee</p>
          <ul className="mt-4 space-y-2.5 text-[14px] text-white/80">
            {ABOUT.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-[14px] font-semibold">Built with</p>
          <ul className="mt-4 space-y-2.5 text-[14px] text-white/80">
            {BUILT_WITH.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="mt-6 max-w-[30ch] text-[12px] text-white/50">
            Hackathon build. Runs on the PayPal sandbox only, so no real money moves.
          </p>
        </div>
      </div>

      <Coin size={64} className="absolute right-[8%] top-14 hidden animate-float md:block" />

      <p
        aria-hidden
        className="mt-14 select-none text-center text-[clamp(96px,24vw,340px)] leading-[0.8] bg-gradient-to-b from-[#009cde] to-[#003087] bg-clip-text text-transparent translate-y-[0.1em]"
      >
        <Brand />
      </p>
    </footer>
  );
}
