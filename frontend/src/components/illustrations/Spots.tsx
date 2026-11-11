import { C } from "./palette";
import { HELENE, PAYOUT_HOUR } from "@/fixtures/helene";
import { hoursText, NO_FIGURE, trancheOneTotal, usd } from "@/lib/ledger";

type P = { className?: string };
// Big numbers and labels inside the illustrations use the headline face.
const DISPLAY = "var(--font-instrument-sans), sans-serif";

function Coin({ x, y, r = 12 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x + 2} cy={y + 2} r={r} fill={C.goldDark} />
      <circle cx={x} cy={y} r={r} fill={C.gold} stroke={C.goldDeep} strokeWidth="1.5" />
    </g>
  );
}

/* ---------------- feature row icons (sit inside a ice halo) ---------------- */

export function IconPledge({ className = "" }: P) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <g transform="rotate(-12 70 90)">
        <rect x="22" y="62" width="84" height="54" rx="8" fill={C.skyDeep} stroke={C.outline} strokeWidth="2.5" />
        <rect x="22" y="76" width="84" height="10" fill={C.gold} />
      </g>
      <g transform="rotate(4 100 96)">
        <rect x="58" y="70" width="86" height="56" rx="8" fill={C.blue} stroke={C.outline} strokeWidth="2.5" />
        <rect x="68" y="82" width="30" height="5" rx="2" fill={C.white} />
        <rect x="68" y="92" width="20" height="5" rx="2" fill={C.white} />
        <rect x="120" y="80" width="16" height="12" rx="3" fill={C.gold} />
        <path d="M66 114 h12 m6 0 h12 m6 0 h12" stroke={C.white} strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d="M112 34 c-6 -10 -22 -4 -16 8 l16 14 l16 -14 c6 -12 -10 -18 -16 -8z" fill={C.gold} stroke={C.goldDark} strokeWidth="2" />
      <Coin x={52} y={46} r={10} />
      <Coin x={72} y={140} r={8} />
    </svg>
  );
}

export function IconEarly({ className = "" }: P) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <rect x="92" y="34" width="44" height="64" rx="4" fill={C.white} stroke={C.outline} strokeWidth="2" transform="rotate(10 114 66)" />
      <text x="112" y="74" fontSize="22" fill={C.outline} fontFamily="sans-serif" transform="rotate(10 114 66)">
        $
      </text>
      <g transform="rotate(-8 70 90)">
        <rect x="24" y="52" width="92" height="80" rx="8" fill={C.blue} stroke={C.outline} strokeWidth="2.5" />
        <rect x="24" y="52" width="92" height="18" rx="8" fill={C.gold} stroke={C.outline} strokeWidth="2.5" />
        <circle cx="38" cy="61" r="3" fill={C.outline} />
        <circle cx="50" cy="61" r="3" fill={C.outline} />
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect key={`${r}${c}`} x={36 + c * 26} y={78 + r * 17} width="18" height="12" rx="3" fill={r === 1 && c === 1 ? C.gold : C.sky} />
          )),
        )}
      </g>
      <path d="M40 30 a12 12 0 0 1 20 -8 a14 14 0 0 1 24 6 a10 10 0 0 1 -2 18 h-38 a9 9 0 0 1 -4 -16z" fill={C.white} stroke={C.outline} strokeWidth="2" />
      <path d="M62 46 l-6 12 h8 l-6 12" stroke={C.goldDeep} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Coin x={66} y={140} r={13} />
      <path d="M60 140 l10 0 m-4 -4 l4 4 l-4 4" stroke={C.blueDeep} strokeWidth="2.5" fill="none" />
    </svg>
  );
}

export function IconProof({ className = "" }: P) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <rect x="54" y="26" width="66" height="78" rx="4" fill={C.white} stroke={C.lineDark} strokeWidth="1.5" transform="rotate(6 87 65)" />
      <path d="M66 46 h40 M66 58 h30 M66 70 h36" stroke={C.line} strokeWidth="3" transform="rotate(6 87 65)" />
      <rect x="110" y="40" width="10" height="74" rx="3" fill={C.skyDeep} stroke={C.outline} strokeWidth="1.5" />
      <rect x="120" y="46" width="10" height="70" rx="3" fill={C.gold} stroke={C.outline} strokeWidth="1.5" />
      <path d="M26 64 h40 l8 10 h48 v58 a6 6 0 0 1 -6 6 H32 a6 6 0 0 1 -6 -6z" fill={C.blue} stroke={C.outline} strokeWidth="2.5" />
      <path d="M40 100 C 70 90 90 120 118 104" stroke={C.blueLight} strokeWidth="3" fill="none" />
      <circle cx="44" cy="126" r="18" fill={C.gold} stroke={C.outline} strokeWidth="2.5" />
      <path d="M35 126 l6 6 l12 -13" stroke={C.blueDeep} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- blue band: Sentinel reading the forecast ---------------- */

export function ForecastLaptop({ className = "" }: P) {
  return (
    <svg viewBox="0 0 520 440" className={className} aria-hidden>
      <circle cx="270" cy="250" r="190" fill={C.ice} />
      {/* laptop */}
      <g transform="rotate(-6 300 220)">
        <rect x="160" y="96" width="260" height="170" rx="12" fill={C.outline} />
        <rect x="172" y="108" width="236" height="146" rx="6" fill={C.white} />
        <path d="M140 266 h300 l-18 22 H158z" fill={C.outline} />
        <text x="188" y="134" fontSize="13" fontWeight="700" fill={C.outline} fontFamily="sans-serif">
          THREAT BRIEF · HELENE
        </text>
        {/* gauge */}
        <path d="M200 214 a46 46 0 0 1 92 0" stroke={C.ice} strokeWidth="14" fill="none" />
        {HELENE.brief.confidence !== null && <path d="M200 214 a46 46 0 0 1 84 -26" stroke={C.blue} strokeWidth="14" fill="none" />}
        <text x="246" y="212" textAnchor="middle" fontSize="28" fill={C.outline} fontFamily={DISPLAY} fontWeight="700">
          {HELENE.brief.confidence ?? NO_FIGURE}
        </text>
        <text x="246" y="236" textAnchor="middle" fontSize="10" fill={C.outline} fontFamily="sans-serif">
          confidence
        </text>
        {["Orange alert", "Landfall < 72h", "Score ≥ 70"].map((t, i) => (
          <g key={t} transform={`translate(310 ${160 + i * 26})`}>
            <circle r="8" fill={C.green} />
            <path d="M-4 0 l3 3 l5 -6" stroke={C.white} strokeWidth="2" fill="none" />
            <text x="14" y="4" fontSize="11" fill={C.outline} fontFamily="sans-serif">
              {t}
            </text>
          </g>
        ))}
      </g>
      {/* printed brief */}
      <path d="M232 290 h86 v110 l-10 -6 l-10 6 l-10 -6 l-10 6 l-10 -6 l-10 6 l-10 -6 l-10 6 l-6 -4z" fill={C.white} stroke={C.lineDark} strokeWidth="1.5" />
      <path d="M248 312 h54 M248 326 h40 M248 340 h50 M248 354 h34" stroke={C.line} strokeWidth="3" />
      {/* storm swirl */}
      <g transform="translate(110 120)">
        <circle r="44" fill={C.white} stroke={C.outline} strokeWidth="2.5" />
        <g className="origin-center animate-spin-slow" style={{ transformBox: "fill-box" }}>
          <path d="M0 -28 C 24 -28 32 -4 16 8 M0 28 C -24 28 -32 4 -16 -8" stroke={C.blueDeep} strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle r="5" fill={C.blueDeep} />
        </g>
      </g>
      <g className="animate-float">
        <Coin x={440} y={150} r={13} />
      </g>
      <g className="animate-float-slow">
        <Coin x={410} y={380} r={11} />
      </g>
    </svg>
  );
}

/* ---------------- white split: the yearly cap + pre-charge notice ---------------- */

export function CapSafe({ className = "" }: P) {
  return (
    <svg viewBox="0 0 440 420" className={className} aria-hidden>
      <circle cx="230" cy="220" r="160" fill={C.ice} />
      {/* safe */}
      <rect x="80" y="196" width="190" height="180" rx="10" fill={C.blueDeep} stroke={C.outline} strokeWidth="3" />
      <rect x="104" y="208" width="166" height="160" rx="8" fill={C.blue} stroke={C.outline} strokeWidth="3" />
      <rect x="120" y="226" width="134" height="124" rx="6" fill={C.iceSoft} />
      <text x="134" y="256" fontSize="12" fill={C.outline} fontFamily="sans-serif" fontWeight="700">
        YEARLY CAP
      </text>
      <text x="134" y="294" fontSize="28" fill={C.blueDeep} fontFamily={DISPLAY} fontWeight="700">
        $60
      </text>
      <rect x="134" y="312" width="106" height="10" rx="5" fill={C.line} />
      <rect x="100" y="376" width="22" height="12" fill={C.outline} />
      <rect x="236" y="376" width="22" height="12" fill={C.outline} />
      {/* shield */}
      <path d="M86 172 l38 -14 l38 14 v28 c0 26 -18 42 -38 50 c-20 -8 -38 -24 -38 -50z" fill={C.gold} stroke={C.outline} strokeWidth="3" />
      <path d="M108 200 l12 12 l20 -24" stroke={C.outline} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* notice */}
      <g className="animate-float-slow">
        <rect x="214" y="64" width="200" height="112" rx="16" fill={C.white} stroke={C.outline} strokeWidth="2.5" />
        <circle cx="240" cy="92" r="11" fill={C.blue} />
        <path d="M236 88 h8 v6 h-8z" fill={C.white} />
        <text x="258" y="96" fontSize="13" fontWeight="700" fill={C.outline} fontFamily="sans-serif">
          Before we charge you
        </text>
        <text x="232" y="122" fontSize="12" fill={C.outline} fontFamily="sans-serif">
          $10 per hurricane
        </text>
        <text x="232" y="138" fontSize="11" fill="#5f6b7a" fontFamily="sans-serif">
          Charging soon
        </text>
        <rect x="318" y="140" width="80" height="26" rx="13" fill={C.skyDeep} />
        <text x="358" y="158" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.outline} fontFamily="sans-serif">
          Skip this one
        </text>
      </g>
      <Coin x={300} y={210} r={10} />
    </svg>
  );
}

/* ---------------- navy band cards ---------------- */

export function ReceiptPhone({ className = "" }: P) {
  return (
    <svg viewBox="0 0 260 230" className={className} aria-hidden>
      <g transform="rotate(-10 100 110)">
        <rect x="40" y="20" width="110" height="190" rx="18" fill={C.blueDeep} />
        <rect x="46" y="26" width="110" height="190" rx="18" fill={C.iceSoft} stroke={C.blue} strokeWidth="5" />
        <rect x="84" y="36" width="34" height="7" rx="3" fill={C.blue} />
      </g>
      <path d="M96 52 h70 v120 c0 10 -10 10 -14 4 c-4 -6 -14 -6 -14 4 v40 h-70 v-150z" fill={C.white} stroke={C.lineDark} strokeWidth="1.5" />
      <text x="82" y="78" fontSize="11" fontWeight="700" fill={C.outline} fontFamily="sans-serif">
        YOUR $10
      </text>
      <path d="M82 92 h60 M82 104 h46 M82 116 h54 M82 128 h40 M82 152 h46 M82 164 h56" stroke={C.line} strokeWidth="3" />
      <text x="82" y="146" fontSize="10" fill={C.blueDeep} fontFamily="sans-serif">
        Partner A · {NO_FIGURE}
      </text>
      {/* magnifier over the receipt */}
      <g className="animate-float-slow">
        <path d="M206 150 l30 34" stroke={C.outline} strokeWidth="12" strokeLinecap="round" />
        <circle cx="180" cy="122" r="36" fill={C.white} fillOpacity="0.55" stroke={C.outline} strokeWidth="7" />
        <circle cx="180" cy="122" r="36" fill="none" stroke={C.gold} strokeWidth="3" />
        <text x="180" y="132" textAnchor="middle" fontSize="28" fill={C.blueDeep} fontFamily={DISPLAY} fontWeight="700">
          $10
        </text>
      </g>
      <Coin x={226} y={46} r={12} />
    </svg>
  );
}

export function ProofPhotos({ className = "" }: P) {
  return (
    <svg viewBox="0 0 260 230" className={className} aria-hidden>
      <g transform="rotate(-8 90 110)">
        <rect x="24" y="40" width="120" height="140" rx="8" fill={C.white} stroke={C.outline} strokeWidth="2.5" />
        <rect x="36" y="52" width="96" height="84" rx="4" fill={C.ice} />
        <path d="M36 136 l30 -36 l22 22 l14 -14 l30 28z" fill={C.blue} />
        <circle cx="110" cy="72" r="9" fill={C.gold} />
        <path d="M48 154 h60 M48 166 h40" stroke={C.line} strokeWidth="3" />
      </g>
      <g transform="rotate(7 180 120)">
        <rect x="120" y="54" width="112" height="132" rx="8" fill={C.white} stroke={C.outline} strokeWidth="2.5" />
        <rect x="132" y="66" width="88" height="78" rx="4" fill={C.ice} />
        <path d="M132 144 l26 -30 l20 20 l12 -12 l30 22z" fill={C.blueLight} />
        <path d="M144 160 h56 M144 172 h36" stroke={C.line} strokeWidth="3" />
      </g>
      <circle cx="56" cy="44" r="22" fill={C.green} stroke={C.outline} strokeWidth="2.5" />
      <path d="M45 44 l8 8 l14 -15" stroke={C.white} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="222" cy="58" r="22" fill={C.skyDeep} stroke={C.outline} strokeWidth="2.5" />
      <path d="M213 49 l18 18 M231 49 l-18 18" stroke={C.outline} strokeWidth="4.5" strokeLinecap="round" />
      <rect x="168" y="196" width="80" height="24" rx="12" fill={C.outline} />
      <text x="208" y="212" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="sans-serif">
        Reused photo
      </text>
    </svg>
  );
}

export function ResponderCrates({ className = "" }: P) {
  return (
    <svg viewBox="0 0 440 340" className={className} aria-hidden>
      <circle cx="200" cy="170" r="140" fill={C.ice} />
      <ellipse cx="220" cy="310" rx="200" ry="8" fill={C.line} opacity="0.7" />
      {/* crates, stacked to the right of the van */}
      <g stroke={C.goldDark} strokeWidth="2">
        {[0, 1].map((i) => (
          <g key={`b${i}`}>
            <rect x={196 + i * 64} y="250" width="64" height="58" fill={C.gold} />
            <path d={`M${196 + i * 64} 270 h64 M${228 + i * 64} 250 v58`} stroke={C.goldDeep} />
          </g>
        ))}
        <rect x="228" y="192" width="64" height="58" fill={C.gold} />
        <path d="M228 212 h64 M260 192 v58" stroke={C.goldDeep} />
      </g>
      {/* relief van parked on the crates' left */}
      <g>
        <path d="M30 210 h96 v76 H30z" fill={C.white} stroke={C.outline} strokeWidth="3" />
        <path d="M126 230 h30 l22 26 v30 h-52z" fill={C.blue} stroke={C.outline} strokeWidth="3" />
        <path d="M134 238 h18 l14 18 h-32z" fill={C.iceSoft} stroke={C.outline} strokeWidth="2" />
        <path d="M70 232 v32 M54 248 h32" stroke={C.skyDeep} strokeWidth="9" strokeLinecap="round" />
        <circle cx="62" cy="292" r="15" fill={C.outline} />
        <circle cx="62" cy="292" r="6" fill={C.line} />
        <circle cx="150" cy="292" r="15" fill={C.outline} />
        <circle cx="150" cy="292" r="6" fill={C.line} />
      </g>
      {/* payout card */}
      <g className="animate-float-slow">
        <rect x="250" y="58" width="150" height="96" rx="12" fill={C.white} stroke={C.outline} strokeWidth="2.5" />
        <circle cx="270" cy="82" r="7" fill={C.green} />
        <path d="M266.5 82 l2.5 2.5 l4.5 -5" stroke={C.white} strokeWidth="2" fill="none" />
        <text x="283" y="86" fontSize="11" fontWeight="700" fill={C.outline} fontFamily="sans-serif">
          SAMPLE PAYOUT
        </text>
        <text x="264" y="120" fontSize="28" fill={C.blueDeep} fontFamily={DISPLAY} fontWeight="700">
          {usd(trancheOneTotal)}
        </text>
        <text x="264" y="140" fontSize="10" fill="#5f6b7a" fontFamily="sans-serif">
          {hoursText(PAYOUT_HOUR)} before landfall
        </text>
      </g>
      {/* plant */}
      <path d="M346 308 h44 l-6 -34 h-32z" fill={C.paper} stroke={C.lineDark} strokeWidth="1.5" />
      {[-30, -10, 10, 30].map((r) => (
        <path key={r} d="M368 274 c-8 -20 -6 -44 0 -60 c6 16 8 40 0 60z" fill={r % 20 ? C.blueLight : C.blue} transform={`rotate(${r} 368 274)`} />
      ))}
      <Coin x={84} y={176} r={12} />
      <Coin x={410} y={226} r={10} />
    </svg>
  );
}

/* ---------------- sky band: the two tranches ---------------- */

export function TrancheCards({ className = "" }: P) {
  return (
    <svg viewBox="0 0 440 320" className={className} aria-hidden>
      <g transform="rotate(-16 140 170)">
        <rect x="30" y="100" width="220" height="136" rx="16" fill={C.outline} />
        <rect x="24" y="94" width="220" height="136" rx="16" fill={C.skyDeep} />
        <rect x="24" y="126" width="220" height="24" fill={C.gold} />
        <text x="44" y="200" fontSize="24" fill={C.outline} fontFamily={DISPLAY} fontWeight="700">
          Tranche 1
        </text>
        <text x="44" y="218" fontSize="11" fill={C.outline} fontFamily="sans-serif">
          Before landfall
        </text>
      </g>
      <g transform="rotate(4 280 190)">
        <rect x="178" y="128" width="230" height="142" rx="16" fill={C.outline} />
        <rect x="172" y="122" width="230" height="142" rx="16" fill={C.blue} />
        <path d="M172 210 C 240 180 320 240 402 196 V248 a16 16 0 0 1 -16 16 H188 a16 16 0 0 1 -16 -16z" fill={C.blueLight} opacity="0.55" />
        <rect x="192" y="144" width="70" height="8" rx="4" fill={C.white} />
        <rect x="192" y="158" width="44" height="8" rx="4" fill={C.white} />
        <rect x="350" y="140" width="34" height="26" rx="6" fill={C.gold} stroke={C.goldDark} strokeWidth="1.5" />
        <text x="192" y="234" fontSize="24" fill={C.white} fontFamily={DISPLAY} fontWeight="700">
          Tranche 2
        </text>
        <text x="192" y="252" fontSize="11" fill={C.white} fontFamily="sans-serif">
          Only after verified proof
        </text>
      </g>
      <path d="M262 64 l14 26 l22 -32 l10 38 h-56z" fill={C.gold} stroke={C.goldDark} strokeWidth="2" transform="rotate(14 280 76)" />
      <g className="animate-float">
        <Coin x={92} y={64} r={22} />
      </g>
      <g className="animate-float-slow">
        <Coin x={116} y={292} r={18} />
      </g>
    </svg>
  );
}

/* ---------------- outro floaters ---------------- */

export function StackedCoins({ className = "" }: P) {
  return (
    <svg viewBox="0 0 60 50" className={className} aria-hidden>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${i * 3} ${-i * 9})`}>
          <path d="M8 34 v6 a20 6 0 0 0 40 0 v-6" fill={C.ice} stroke={C.lineDark} strokeWidth="1.5" />
          <ellipse cx="28" cy="34" rx="20" ry="6" fill={C.ice} stroke={C.lineDark} strokeWidth="1.5" />
        </g>
      ))}
    </svg>
  );
}

export function ProofFolder({ className = "" }: P) {
  return (
    <svg viewBox="0 0 70 60" className={className} aria-hidden>
      <rect x="20" y="4" width="34" height="40" rx="2" fill={C.white} stroke={C.lineDark} strokeWidth="1.2" />
      <path d="M6 18 h18 l4 5 h32 v30 a3 3 0 0 1 -3 3 H9 a3 3 0 0 1 -3 -3z" fill={C.blue} stroke={C.outline} strokeWidth="1.5" />
      <circle cx="14" cy="50" r="8" fill={C.gold} stroke={C.outline} strokeWidth="1.5" />
    </svg>
  );
}
