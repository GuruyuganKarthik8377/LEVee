"use client";

import { MapControls, usePanZoom, type Bounds } from "@/components/maps/panZoom";
import { HELENE, PARTNERS, PAYOUT_HOUR, TRACK, type PartnerId } from "@/fixtures/helene";
import { brief, reached, stormPosition, usd } from "@/lib/ledger";

const SCALE = 22.4;
const WEST = -101;
const NORTH = 38.4;
const WIDTH = 792;
const HEIGHT = 500;

const x = (lon: number) => (lon - WEST) * SCALE;
const y = (lat: number) => (NORTH - lat) * SCALE;
/** The whole Gulf, and the closest zoom: a quarter of its width. */
const GULF: Bounds = { x: 0, y: 0, w: WIDTH, h: HEIGHT, minW: WIDTH / 4 };

const pt = (lon: number, lat: number) => `${x(lon).toFixed(1)},${y(lat).toFixed(1)}`;

// The outer cities drop away on phones, where the labels would otherwise be unreadably small.
const PLACES: { name: string; lat: number; lon: number; anchor?: "end"; outer?: boolean }[] = [
  { name: "Atlanta", lat: 33.75, lon: -84.39, anchor: "end" },
  { name: "New Orleans", lat: 29.95, lon: -90.07, anchor: "end" },
  { name: "Tampa", lat: 27.95, lon: -82.46 },
  { name: "Miami", lat: 25.77, lon: -80.19, outer: true },
  { name: "Cancún", lat: 21.16, lon: -86.85, anchor: "end", outer: true },
];

const STATES = [
  { name: "FLORIDA", lat: 28.4, lon: -81.6 },
  { name: "GEORGIA", lat: 32.7, lon: -83.4 },
  { name: "ALABAMA", lat: 32.6, lon: -86.8 },
  { name: "MISSISSIPPI", lat: 32.7, lon: -89.7 },
  { name: "LOUISIANA", lat: 31, lon: -92.4 },
  { name: "TEXAS", lat: 31.4, lon: -98.4 },
  { name: "SOUTH CAROLINA", lat: 34, lon: -80.9 },
  { name: "NORTH CAROLINA", lat: 35.6, lon: -79.2 },
  { name: "TENNESSEE", lat: 35.8, lon: -86.4 },
  { name: "KENTUCKY", lat: 37.5, lon: -85.2 },
  { name: "CUBA", lat: 21.9, lon: -79.4 },
  { name: "MEXICO", lat: 19.5, lon: -99 },
];

function Cone({ lon, lat, confidence }: { lon: number; lat: number; confidence: number }) {
  const end = TRACK.find((p) => p.t === 0)!;
  const [ax, ay, bx, by] = [x(lon), y(lat), x(end.lon), y(end.lat)];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const [nx, ny] = [-(by - ay) / length, (bx - ax) / length];
  const spread = (100 - confidence) * 1.5 + 12;
  const left = `${(bx + nx * spread).toFixed(1)} ${(by + ny * spread).toFixed(1)}`;
  const right = `${(bx - nx * spread).toFixed(1)} ${(by - ny * spread).toFixed(1)}`;
  return <path d={`M${ax.toFixed(1)} ${ay.toFixed(1)} L${left} A${spread} ${spread} 0 0 0 ${right}Z`} fill="#60cdff" opacity="0.28" />;
}

/** The Gulf of Mexico with Helene's best track and the two sample partners. The cone needs Sentinel's score, so it waits for the replay. */
export default function StormMap({ clock, paid }: { clock: number; paid: Partial<Record<PartnerId, number | null>> }) {
  const storm = stormPosition(clock);
  const { confidence } = brief(clock);
  const passed = [...TRACK.filter((p) => p.t < clock), storm];
  const ahead = [storm, ...TRACK.filter((p) => p.t > clock)];
  const line = (points: { lon: number; lat: number }[]) => points.map((p) => pt(p.lon, p.lat)).join(" ");
  // Labels and marks keep their size on screen however far the map is zoomed: each is drawn at its point, scaled by k.
  const { k, svgProps, controls } = usePanZoom(GULF);
  const at = (px: number, py: number) => `translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${k.toFixed(4)})`;

  return (
    <div className="relative">
      <svg
        {...svgProps}
        role="img"
        aria-label={`Map of the Gulf of Mexico with ${HELENE.name} at ${storm.lat.toFixed(1)} north, ${Math.abs(storm.lon).toFixed(1)} west`}
      >
        <rect width={WIDTH} height={HEIGHT} fill="#0d4fbe" />
        {[20, 25, 30, 35].map((lat) => (
          <line key={lat} x1="0" x2={WIDTH} y1={y(lat)} y2={y(lat)} stroke="#fff" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
        ))}
        {[-95, -90, -85, -80, -75, -70].map((lon) => (
          <line key={lon} y1="0" y2={HEIGHT} x1={x(lon)} x2={x(lon)} stroke="#fff" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
        ))}
        <image href="/maps/gulf.svg" width={WIDTH} height={HEIGHT} />
        <g transform={at(x(-96.8), y(25.4))}>
          <text fill="#fff" fillOpacity="0.55" fontSize="20" fontWeight="600" letterSpacing="5" className="max-sm:text-[22px]">
            GULF OF MEXICO
          </text>
        </g>

        {STATES.map((p) => (
          <g key={p.name} transform={at(x(p.lon), y(p.lat))}>
            <text textAnchor="middle" fill="#fff" fillOpacity="0.3" fontSize="11" fontWeight="600" letterSpacing="2" className="max-sm:hidden">
              {p.name}
            </text>
          </g>
        ))}

        {PLACES.map((p) => (
          <g key={p.name} transform={at(x(p.lon), y(p.lat))} className={p.outer ? "max-sm:hidden" : undefined}>
            <circle r="3" fill="#fff" fillOpacity="0.6" />
            <text x={p.anchor ? -9 : 9} y={5} textAnchor={p.anchor ?? "start"} fill="#fff" fillOpacity="0.8" fontSize="15" className="max-sm:text-[24px]">
              {p.name}
            </text>
          </g>
        ))}

        {clock < 0 && confidence !== null && <Cone lon={storm.lon} lat={storm.lat} confidence={confidence} />}
        <polyline points={line(ahead)} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth={2.5 * k} strokeDasharray={`${4 * k} ${9 * k}`} strokeLinecap="round" />
        <polyline points={line(passed)} fill="none" stroke="#60cdff" strokeWidth={4 * k} strokeLinecap="round" strokeLinejoin="round" />

        {(Object.keys(PARTNERS) as PartnerId[]).map((id) => {
          const p = PARTNERS[id];
          const sent = id in paid;
          const west = id === "a";
          return (
            <g key={id} transform={at(x(p.lon), y(p.lat))}>
              {reached(clock, PAYOUT_HOUR) && clock < PAYOUT_HOUR! + 8 && (
                <circle r="8" fill="none" stroke="#ffc439" strokeWidth="2.5">
                  <animate attributeName="r" values="8;26" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r="6" fill={sent ? "#ffc439" : "#fff"} stroke="#001c64" strokeWidth="2.5" />
              <g transform={`translate(${west ? -14 : 14} ${west ? 14 : -52})`}>
                <g className="max-sm:scale-[1.6]">
                  <rect x={west ? -176 : 0} width="176" height="44" rx="9" fill="#fff" />
                  <text x={west ? -166 : 10} y="18" fontSize="14" fontWeight="600" fill="#001c64">
                    {p.label}, {p.region}
                  </text>
                  <text x={west ? -166 : 10} y="36" fontSize="13" fontWeight={sent ? 700 : 500} fill={sent ? "#0057b8" : "#5f6b7a"}>
                    {sent ? `${usd(paid[id] ?? null)} sent, sample` : "Sample data"}
                  </text>
                </g>
              </g>
            </g>
          );
        })}

        <g transform={at(x(storm.lon), y(storm.lat))}>
          <circle r="24" fill="#001c64" fillOpacity="0.75" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" />
          <g className="animate-spin-slow" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <path d="M0 -16 C 16 -16 21 -2 10 6 M0 16 C -16 16 -21 2 -10 -6" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle r="3.5" fill="#fff" />
          </g>
        </g>
      </svg>
      <MapControls controls={controls} resetLabel="Show the whole Gulf" />
    </div>
  );
}
