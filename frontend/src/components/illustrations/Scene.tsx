import { C } from "./palette";
import { HELENE } from "@/fixtures/helene";
import { NO_FIGURE, trancheOneTotal, usd } from "@/lib/ledger";

/* ---------- small line-art props shared by the floor scenes ---------- */

function Plant({ x, y, flip = false, scale = 1 }: { x: number; y: number; flip?: boolean; scale?: number }) {
  const leaves = [-62, -35, -10, 15, 40, 65];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      {leaves.map((r, i) => (
        <g key={r} transform={`rotate(${r})`}>
          <path
            d={`M0 0 C ${-14} ${-30 - i * 2} ${-10} ${-70 - (i % 3) * 8} 0 ${-86 - (i % 3) * 8} C ${10} ${-70 - (i % 3) * 8} ${14} ${-30 - i * 2} 0 0Z`}
            fill={C.ice}
            stroke={C.lineDark}
            strokeWidth="1.6"
          />
          <path d={`M0 0 L0 ${-78 - (i % 3) * 8}`} stroke={C.lineDark} strokeWidth="1.2" />
        </g>
      ))}
    </g>
  );
}

function MoneyBag({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={C.lineDark} strokeWidth="1.8">
      <path d="M-22 0 C-30 -8 -26 -34 -8 -42 L-12 -52 L12 -52 L8 -42 C26 -34 30 -8 22 0Z" fill={C.ice} />
      <path d="M-10 -46 L10 -46" />
      <text x="0" y="-14" textAnchor="middle" fontSize="20" fill={C.lineDark} stroke="none" fontFamily="sans-serif">
        $
      </text>
    </g>
  );
}

function CoinStack({ x, y, n = 3 }: { x: number; y: number; n?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={C.lineDark} strokeWidth="1.6" fill={C.ice}>
      {Array.from({ length: n }).map((_, i) => (
        <g key={i} transform={`translate(${i % 2 ? 4 : 0} ${-i * 12})`}>
          <path d="M-34 0 L-34 10 A34 9 0 0 0 34 10 L34 0" />
          <ellipse cx="0" cy="0" rx="34" ry="9" />
        </g>
      ))}
    </g>
  );
}

function CloudTree({ x, y, s = 1, trunk = 120 }: { x: number; y: number; s?: number; trunk?: number }) {
  const puffs: [number, number, number][] = [
    [0, 0, 26], [28, -10, 24], [52, 6, 22], [20, 22, 24], [-20, 18, 20], [44, 30, 18],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={C.white} stroke={C.lineDark} strokeWidth="1.5">
      <path d={`M16 40 L16 ${trunk} M16 ${40 + (trunk - 40) / 2} L32 ${24 + (trunk - 40) / 2}`} fill="none" />
      {puffs.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

/**
 * Wide line-art "coastal room" that sits along the bottom of the hero and outro.
 * The props always scale to the container's height and stay centred, so nothing is ever cropped
 * off the top; the floor is drawn far past the viewBox and overflows sideways to fill any width.
 * Pass the wrapper's position and size through className.
 */
export function FloorScene({ className = "" }: { className?: string }) {
  const vp = { x: 600, y: 60 };
  const top = 262;
  const t = (top - vp.y) / (360 - vp.y);
  const diagonals = Array.from({ length: 49 }, (_, i) => -3000 + i * 150);

  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden>
      <svg
        viewBox="0 -80 1200 440"
        className="absolute bottom-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2"
        style={{ overflow: "visible" }}
      >
      {/* floor */}
      <rect x="-3000" y={top} width="7200" height={360 - top} fill={C.ice} />
      <g stroke={C.line} strokeWidth="1.5">
        {[top, 285, 315, 352].map((y) => (
          <line key={y} x1="-3000" x2="4200" y1={y} y2={y} />
        ))}
        {diagonals.map((xb) => (
          <line key={xb} x1={vp.x + (xb - vp.x) * t} y1={top} x2={xb} y2={360} />
        ))}
      </g>

      {/* left: tree peeking behind a storm window, then a stilt house */}
      {/* moved left of the centre so the hero's card columns never sit on top of it */}
      <g transform="translate(-125 0)">
      <CloudTree x={58} y={78} s={0.9} />
      <g stroke={C.lineDark} strokeWidth="1.8" fill="none">
        <rect x="40" y="100" width="130" height="140" fill={C.white} />
        <line x1="40" y1="170" x2="170" y2="170" />
        <line x1="105" y1="100" x2="105" y2="240" />
        <rect x="30" y="240" width="150" height="9" fill={C.white} />
        <path d="M54 134 a13 13 0 0 1 21 -11 a15 15 0 0 1 26 6 a11 11 0 0 1 -2 20 h-41 a9 9 0 0 1 -4 -15z" fill={C.iceSoft} />
        <path d="M64 156 l-4 9 M78 156 l-4 9 M92 156 l-4 9" strokeLinecap="round" />
        <path d="M134 188 l8 -14 h-8 l8 -14" stroke={C.goldDeep} />
      </g>
      <g stroke={C.lineDark} strokeWidth="1.8" fill={C.ice}>
        <path d="M200 212 L260 172 L320 212Z" fill={C.iceSoft} />
        <rect x="210" y="212" width="100" height="40" />
        <rect x="248" y="226" width="22" height="26" fill={C.white} />
        <path d="M218 252 v20 M302 252 v20 M260 252 v20" fill="none" />
      </g>

      </g>

      {/* mirrored around the centre line (x=600), peeking out either side of the phone */}
      <CoinStack x={395} y={300} />
      <MoneyBag x={460} y={268} />
      <MoneyBag x={740} y={268} />
      <CoinStack x={805} y={300} />

      {/* right: weather mast tripod + tree, kept outside the hero's story card column */}
      <g stroke={C.lineDark} strokeWidth="1.8" fill="none" transform="translate(170 0)">
        <path d="M870 110 L840 268 M870 110 L900 268 M870 110 L872 268" />
        <path d="M870 110 L870 70" />
        <path d="M852 70 h36" />
        <circle cx="852" cy="70" r="7" fill={C.white} />
        <circle cx="888" cy="70" r="7" fill={C.white} />
        <path d="M860 92 l20 -8 l-4 14z" fill={C.iceSoft} />
      </g>
      <CloudTree x={1125} y={120} s={1} trunk={146} />

      <Plant x={70} y={350} scale={1.1} />
      <Plant x={160} y={360} flip scale={0.75} />
      <Plant x={1130} y={350} flip scale={1.1} />
      <Plant x={1040} y={360} scale={0.75} />
      </svg>
    </div>
  );
}

// Phone frame edges as fractions of the SVG width, so cards can be placed exactly against the frame.
export const PHONE_LEFT = 15 / 240;
export const PHONE_RIGHT = 225 / 240;

const UI = "var(--font-instrument-sans), sans-serif";

/**
 * Hero centrepiece: an upright phone with real proportions (about 2:1, thin bezels, Dynamic Island, side buttons)
 * showing the Helene replay. The viewBox is symmetric around the phone's centre line (x=252), so centring
 * the SVG centres the phone exactly, and everything on the screen is centred on that same line.
 */
export function HeroPhone({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="132 0 240 450" className={className} style={{ overflow: "visible" }} aria-hidden>
      <defs>
        <linearGradient id="phone-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="252" cy="443" rx="130" ry="6" fill={C.lineDark} opacity="0.5" />

      {/* side buttons sit behind the frame */}
      <g fill={C.outline}>
        <rect x="142" y="104" width="7" height="28" rx="2" />
        <rect x="142" y="148" width="7" height="52" rx="2" />
        <rect x="142" y="210" width="7" height="52" rx="2" />
        <rect x="355" y="160" width="7" height="84" rx="2" />
      </g>

      {/* frame, blue rim, bezel, screen */}
      <rect x="147" y="10" width="210" height="430" rx="44" fill={C.outline} />
      <rect x="150" y="13" width="204" height="424" rx="41" fill={C.blue} />
      <rect x="154" y="17" width="196" height="416" rx="37" fill={C.outline} />
      <rect x="158" y="21" width="188" height="408" rx="33" fill={C.iceSoft} />

      {/* Dynamic Island and status bar */}
      <rect x="222" y="30" width="60" height="17" rx="8.5" fill={C.outline} />
      <circle cx="272" cy="38.5" r="3" fill="#0a2e7a" />
      <text x="192" y="43" textAnchor="middle" fontSize="12" fontWeight="700" fill={C.outline} fontFamily={UI}>
        9:41
      </text>
      <g fill={C.outline}>
        <rect x="294" y="40" width="3" height="4" rx="0.8" />
        <rect x="298.5" y="38" width="3" height="6" rx="0.8" />
        <rect x="303" y="36" width="3" height="8" rx="0.8" />
      </g>
      <rect x="310" y="34.5" width="20" height="10" rx="3" fill="none" stroke={C.outline} strokeWidth="1.5" />
      <rect x="312.5" y="37" width="13" height="5" rx="1.5" fill={C.outline} />
      <rect x="331" y="37.5" width="2" height="4" rx="1" fill={C.outline} />

      {/* app screen: every row is centred on x=252 */}
      <text x="252" y="80" textAnchor="middle" fontSize="18" fill={C.blueDeep} fontFamily={UI}>
        <tspan fontWeight="700">LEV</tspan>
        <tspan fontStyle="italic" fontFamily="var(--font-instrument-serif), Georgia, serif" fontSize="20">
          ee
        </tspan>
      </text>
      <rect x="221" y="90" width="62" height="18" rx="9" fill={C.skyDeep} />
      <circle cx="232" cy="99" r="3.5" fill={C.outline} />
      <text x="240" y="103" fontSize="9.5" fontWeight="700" fill={C.outline} fontFamily={UI}>
        REPLAY
      </text>

      <g transform="translate(252 162)">
        <circle r="42" fill={C.white} />
        <g className="origin-center animate-spin-slow" style={{ transformBox: "fill-box" }}>
          <path d="M0 -27 C 24 -27 30 -3 17 7 M0 27 C -24 27 -30 3 -17 -7" stroke={C.blueDeep} strokeWidth="5.5" fill="none" strokeLinecap="round" />
          <path d="M-5 -13 C 8 -15 15 -3 7 3 M5 13 C -8 15 -15 3 -7 -3" stroke={C.blue} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <circle r="4.5" fill={C.blueDeep} />
        </g>
      </g>

      <text x="252" y="232" textAnchor="middle" fontSize="17" fontWeight="700" fill={C.outline} fontFamily={UI}>
        {HELENE.name}
      </text>
      <rect x="186" y="242" width="132" height="26" rx="13" fill={C.blueDeep} />
      <text x="252" y="259" textAnchor="middle" fontSize="12" fontWeight="600" fill={C.white} fontFamily={UI}>
        Past storm, sandbox
      </text>
      <rect x="177" y="284" width="150" height="8" rx="4" fill={C.line} />
      <rect x="177" y="284" width={150 * ((HELENE.brief.confidence ?? 0) / 100)} height="8" rx="4" fill={C.gold} />
      <text x="252" y="309" textAnchor="middle" fontSize="11.5" fill={C.outline} fontFamily={UI}>
        Confidence {HELENE.brief.confidence ?? NO_FIGURE} of 100
      </text>
      <rect x="177" y="320" width="150" height="34" rx="17" fill={C.gold} stroke={C.goldDark} strokeWidth="2" />
      <text x="252" y="342" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.outline} fontFamily={UI}>
        Tranche 1
      </text>
      <rect x="177" y="364" width="150" height="42" rx="12" fill={C.white} />
      <text x="252" y="382" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.outline} fontFamily={UI}>
        Sample payout
      </text>
      <text x="252" y="396" textAnchor="middle" fontSize="10" fill="#5f6b7a" fontFamily={UI}>
        {usd(trancheOneTotal)} · 2 sample partners
      </text>
      <rect x="212" y="416" width="80" height="5" rx="2.5" fill={C.outline} opacity="0.75" />

      <rect x="158" y="21" width="188" height="408" rx="33" fill="url(#phone-glass)" />
    </svg>
  );
}
