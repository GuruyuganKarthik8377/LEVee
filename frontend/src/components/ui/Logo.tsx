import Link from "next/link";
import Brand from "./Brand";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`lev-logo text-[26px] leading-none text-link ${className}`}
      aria-label="LEVee home"
    >
      <Brand />
    </Link>
  );
}
