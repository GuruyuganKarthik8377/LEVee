import Link from "next/link";

const VARIANTS = {
  blue: "bg-blue text-white hover:bg-[#003087]",
  sky: "bg-sky-strong text-ink hover:bg-[#33b8f5]",
  navy: "bg-navy text-white hover:bg-blue-section",
  ghost: "bg-white/70 text-ink hover:bg-white",
  light: "bg-[#eaf1f9] text-ink hover:bg-[#dce8f5]",
} as const;

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  className?: string;
};

export default function PillButton({ href, children, variant = "blue", className = "" }: Props) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full px-6 py-2.5 text-[15px] font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
