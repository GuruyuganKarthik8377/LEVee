import type { ProofFile } from "@/fixtures/helene";

const SKY = "#cfeaff";
const NAVY = "#001c64";

/** Drawn stand-ins for the partners' photos in the demo sets, so the sandbox holds no real pictures of real people. */
export default function ProofArt({ art, className = "" }: { art: NonNullable<ProofFile["art"]>; className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} role="img" aria-label={`Demo proof photo: ${art}`}>
      <rect width="160" height="110" fill={SKY} />
      <rect y="78" width="160" height="32" fill="#60cdff" />
      {art === "shelter" && (
        <g>
          <path d="M34 78V46l46-20 46 20v32z" fill="#fff" stroke={NAVY} strokeWidth="3" strokeLinejoin="round" />
          <rect x="68" y="54" width="24" height="24" fill="#0070e0" stroke={NAVY} strokeWidth="3" />
        </g>
      )}
      {art === "food" && (
        <g stroke={NAVY} strokeWidth="3" strokeLinejoin="round">
          <rect x="30" y="52" width="40" height="28" rx="3" fill="#ffc439" />
          <rect x="74" y="52" width="40" height="28" rx="3" fill="#fff" />
          <rect x="52" y="26" width="40" height="26" rx="3" fill="#0070e0" />
        </g>
      )}
      {art === "boat" && (
        <g stroke={NAVY} strokeWidth="3" strokeLinejoin="round">
          <path d="M30 70h100l-14 18H44z" fill="#fff" />
          <path d="M80 70V26l30 34z" fill="#ffc439" />
        </g>
      )}
      {art === "water" && (
        <g stroke={NAVY} strokeWidth="3" strokeLinejoin="round">
          <rect x="32" y="34" width="42" height="46" rx="6" fill="#0070e0" />
          <rect x="86" y="34" width="42" height="46" rx="6" fill="#fff" />
          <path d="M32 50h42M86 50h42" />
        </g>
      )}
    </svg>
  );
}
