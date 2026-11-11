/* Notification-style card used for the product's story beats (hero, login and sign up). */

const ICONS = {
  check: <path d="M6 12.5 l4 4 l8 -9" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  dots: (
    <g fill="currentColor">
      <circle cx="7" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="17" cy="12" r="2" />
    </g>
  ),
  dollar: (
    <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="currentColor" fontFamily="sans-serif">
      $
    </text>
  ),
  bell: (
    <path
      d="M12 4a5 5 0 0 0-5 5v3.2L5.5 15h13L17 12.2V9a5 5 0 0 0-5-5Zm-2 13a2 2 0 0 0 4 0"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  split: (
    <g stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 5v7l5 4" />
    </g>
  ),
} as const;

/** Background and icon colour pairs from the palette. */
export const STORY_TONES = {
  blue: "bg-blue text-white",
  green: "bg-[#2fbf71] text-white",
  gold: "bg-gold text-outline",
  sky: "bg-sky-strong text-outline",
} as const;

export type StoryBeat = {
  title: string;
  detail: string;
  tone: keyof typeof STORY_TONES;
  icon: keyof typeof ICONS;
};

/** The round coloured badge on its own, for compact layouts. */
export function StoryIcon({ tone, icon, className = "h-9 w-9" }: Pick<StoryBeat, "tone" | "icon"> & { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${STORY_TONES[tone]} ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[56%] w-[56%]" aria-hidden>
        {ICONS[icon]}
      </svg>
    </span>
  );
}

export default function StoryCard({ title, detail, tone, icon, className = "" }: StoryBeat & { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_14px_34px_rgba(0,28,100,0.12)] ring-1 ring-ice ${className}`}
    >
      <StoryIcon tone={tone} icon={icon} />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold leading-tight text-ink">{title}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#5f6b7a]">{detail}</p>
      </div>
    </div>
  );
}
