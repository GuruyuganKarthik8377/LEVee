const ITEMS = [
  "PayPal Vault",
  "Orders v2",
  "Payouts",
  "Invoicing",
  "PayPal Agent Toolkit",
  "GDACS alerts",
  "GloFAS river forecasts",
  "Claude",
  "Render",
];

/** Slim band under the hero naming the rails and data LEVee runs on, scrolling slowly. */
export default function BuiltOn() {
  return (
    <section aria-label="Built on" className="border-y border-ice bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-5">
        <p className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#5f6b7a]">Built on</p>
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <ul className="flex w-max animate-marquee items-center hover:[animation-play-state:paused]">
            {[...ITEMS, ...ITEMS].map((item, i) => (
              <li
                key={i}
                aria-hidden={i >= ITEMS.length}
                className="font-display flex items-center whitespace-nowrap text-[18px] text-[#9db8dc]"
              >
                <span className="px-6">{item}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
