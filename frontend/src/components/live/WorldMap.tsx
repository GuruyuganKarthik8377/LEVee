"use client";

import { useReducedMotion } from "motion/react";
import { MapControls, usePanZoom, type Bounds, type View } from "@/components/maps/panZoom";
import type { LiveStorm } from "@/lib/gdacs";

const WIDTH = 1000;
const HEIGHT = 500;
const TOP = 12;
const VIEW_HEIGHT = 430;

/** Natural Earth projection, the same formula and scale as public/maps/world.svg, so storms land in the right place. */
export function project(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const p2 = p * p;
  const p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [500 + 175 * x, 250 - 175 * y];
}

const OCEANS: { name: string; lon: number; lat: number; size?: number }[] = [
  { name: "NORTH PACIFIC", lon: -150, lat: 30 },
  { name: "SOUTH PACIFIC", lon: -125, lat: -30 },
  { name: "NORTH ATLANTIC", lon: -42, lat: 32 },
  { name: "SOUTH ATLANTIC", lon: -16, lat: -28 },
  { name: "INDIAN OCEAN", lon: 78, lat: -28 },
  { name: "Gulf of Mexico", lon: -90, lat: 25, size: 6 },
  { name: "Bay of Bengal", lon: 89, lat: 14, size: 6 },
  { name: "Philippine Sea", lon: 134, lat: 20, size: 6 },
  { name: "Caribbean Sea", lon: -72, lat: 15, size: 6 },
];

const COLORS: Record<string, string> = { Red: "#ff6a5e", Orange: "#ffc439", Green: "#6fe3a1" };
const colorOf = (alert: string) => COLORS[alert] ?? COLORS.Green;

const line = (points: { lon: number; lat: number }[]) => points.map((p) => project(p.lon, p.lat).map((n) => n.toFixed(1)).join(",")).join(" ");

/** The whole world, and the closest zoom: a sixteenth of its width. */
const WORLD: Bounds = { x: 0, y: TOP, w: WIDTH, h: VIEW_HEIGHT, minW: WIDTH / 16 };

/** The part of the map to show: the world, or one storm's whole track with room around it. */
function viewFor(storm: LiveStorm | null): View {
  if (!storm) return WORLD;
  const points = [...storm.track, { lon: storm.lon, lat: storm.lat }];
  const xy = points.map((p) => project(p.lon, p.lat));
  const xs = xy.map(([x]) => x);
  const ys = xy.map(([, y]) => y);
  const [cx, cy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const span = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * (WIDTH / VIEW_HEIGHT));
  const w = Math.min(Math.max(span * 1.5, WIDTH / 6), WIDTH / 2);
  const h = w * (VIEW_HEIGHT / WIDTH);
  return { x: Math.min(Math.max(cx - w / 2, 0), WIDTH - w), y: Math.min(Math.max(cy - h / 2, TOP), TOP + VIEW_HEIGHT - h), w, h };
}

export default function WorldMap({ storms, selected, onSelect }: { storms: LiveStorm[]; selected: LiveStorm | null; onSelect: (id: number | null) => void }) {
  const calm = useReducedMotion();
  // Marks and labels keep the same size on screen however far the map is zoomed: sizes are multiplied by k.
  const { k, svgProps, controls } = usePanZoom(WORLD, viewFor(selected));

  return (
    <div className="relative">
      <svg
        {...svgProps}
        role="group"
        aria-label={selected ? `World map zoomed to ${selected.name}` : `World map showing ${storms.length} current tropical cyclones from GDACS`}
      >
        <defs>
          <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0f58c8" />
            <stop offset="1" stopColor="#0a3f9e" />
          </linearGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#ocean)" onClick={() => onSelect(null)} />

        <g>
          <image href="/maps/world.svg" width={WIDTH} height={HEIGHT} onClick={() => onSelect(null)} />

          {OCEANS.map((o) => {
            const [x, y] = project(o.lon, o.lat);
            return (
              <text key={o.name} x={x} y={y} textAnchor="middle" fill="#fff" fillOpacity="0.42" fontSize={(o.size ?? 8) * Math.max(k, 0.3)} fontStyle="italic" letterSpacing={o.size ? 0.2 : 1.6} pointerEvents="none" className="max-sm:hidden">
                {o.name}
              </text>
            );
          })}

          {/* The US Gulf Coast playbook's watch area. */}
          {(() => {
            const corners = [[-98, 36], [-74, 36], [-74, 15], [-98, 15]].map(([lon, lat]) => ({ lon, lat }));
            const [labelX, labelY] = project(-98, 36);
            return (
              <g pointerEvents="none">
                <polygon points={line(corners)} fill="#ffc439" fillOpacity="0.1" stroke="#ffc439" strokeOpacity="0.9" strokeWidth={1.2 * k} strokeDasharray={`${4 * k} ${3 * k}`} />
                <text x={labelX} y={labelY - 4 * k} fill="#ffc439" fontSize={9 * k} fontWeight="600">
                  LEVee playbook area
                </text>
              </g>
            );
          })()}

          {storms.map((s) => {
            const on = selected?.id === s.id;
            const color = colorOf(s.alert);
            const [x, y] = project(s.lon, s.lat);
            const past = s.track.filter((p) => !p.forecast);
            const ahead = [...past.slice(-1), ...s.track.filter((p) => p.forecast)];
            const flip = x > 860;
            return (
              <g key={s.id} opacity={selected && !on ? 0.45 : 1}>
                {s.cone.map((ring, i) => (
                  <polygon key={i} points={line(ring.map(([lon, lat]) => ({ lon, lat })))} fill={color} fillOpacity="0.16" stroke={color} strokeOpacity="0.55" strokeWidth={0.6 * k} pointerEvents="none" />
                ))}
                {past.length > 1 && <polyline points={line(past)} fill="none" stroke="#fff" strokeWidth={1.4 * k} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
                {ahead.length > 1 && <polyline points={line(ahead)} fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth={1.2 * k} strokeDasharray={`${2.5 * k} ${3 * k}`} strokeLinecap="round" pointerEvents="none" />}
                {on &&
                  s.track.map((p) => {
                    const [px, py] = project(p.lon, p.lat);
                    return <circle key={p.time} cx={px} cy={py} r={1.7 * k} fill={p.forecast ? "#0a3f9e" : "#fff"} stroke="#fff" strokeWidth={0.7 * k} pointerEvents="none" />;
                  })}

                <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} role="button" tabIndex={0} aria-label={`${s.name}, ${s.alert} alert`} aria-pressed={on} className="cursor-pointer focus:outline-none" onClick={() => onSelect(on ? null : s.id)} onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(on ? null : s.id);
                  }
                }}>
                  <circle r={14 * k} fill="transparent" />
                  {!calm && (
                    <circle r={5 * k} fill="none" stroke={color} strokeWidth={1.4 * k}>
                      <animate attributeName="r" values={`${5 * k};${15 * k}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={(on ? 5.5 : 4.5) * k} fill={color} stroke="#001c64" strokeWidth={1.4 * k} />
                  <g transform={`translate(${(flip ? -9 : 9) * k} ${-7 * k})`} pointerEvents="none">
                    <rect x={flip ? -(s.name.length * 5.4 + 8) * k : 0} width={(s.name.length * 5.4 + 8) * k} height={14 * k} rx={4 * k} fill="#001c64" fillOpacity="0.85" />
                    <text x={(flip ? -(s.name.length * 5.4 + 4) : 4) * k} y={10.2 * k} fill="#fff" fontSize={9.4 * k} fontWeight="600">
                      {s.name}
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <MapControls controls={controls} resetLabel={selected ? `Back to ${selected.name}` : "Show the whole world"} />
    </div>
  );
}
