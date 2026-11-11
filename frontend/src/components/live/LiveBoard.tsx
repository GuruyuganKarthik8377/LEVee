"use client";

import { useState } from "react";
import { Card, Label, Pill, type Tone } from "@/components/app/ui";
import WorldMap from "@/components/live/WorldMap";
import { SentinelBriefPanel, useLiveBrief } from "@/components/live/SentinelBrief";
import { alertMeets, inGulfWatchArea, type LiveStorm } from "@/lib/gdacs";
import { RULES } from "@/lib/rules";

const ALERT_TONE: Record<string, Tone> = { Red: "red", Orange: "gold", Green: "green" };

const stamp = (iso: string) =>
  iso ? `${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))} UTC` : "Not given";

function Rule({ met, label, detail }: { met: boolean | null; label: string; detail: string }) {
  const mark = met === null ? "–" : met ? "✓" : "✕";
  const color = met === null ? "bg-paper text-[#5f6b7a] ring-1 ring-inset ring-ice" : met ? "bg-[#dff5e8] text-[#1b7a48]" : "bg-[#fde8e6] text-[#a8261b]";
  return (
    <li className="flex gap-2.5 text-[14px] leading-snug">
      <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${color}`}>
        {mark}
      </span>
      <span>
        <span className="font-semibold text-ink">{label}</span>
        <span className="block text-[13px] text-[#5f6b7a]">{detail}</span>
      </span>
    </li>
  );
}

function StormDetail({ storm }: { storm: LiveStorm }) {
  const alertOk = alertMeets(storm.alert);
  const inArea = inGulfWatchArea(storm);
  const forecastPoints = storm.track.filter((p) => p.forecast);
  const live = useLiveBrief(storm.id);
  const b = live.brief?.brief;
  // Lead time and confidence come from Sentinel's brief once there is one: lead time from code, confidence from the AI.
  const lead = b?.landfall ? Math.round(b.landfall.leadHours) : null;
  const leadMet = !b || !inArea ? null : lead !== null && lead >= RULES.minLeadHours && lead <= RULES.maxLeadHours;
  const facts: [string, string][] = [
    ["Where", storm.countries || "Over open ocean"],
    ["Position", `${Math.abs(storm.lat).toFixed(1)}°${storm.lat >= 0 ? "N" : "S"}, ${Math.abs(storm.lon).toFixed(1)}°${storm.lon >= 0 ? "E" : "W"}`],
    ["Peak winds", storm.windKmh === null ? "Not given" : `${storm.windKmh} km/h`],
    ["Latest advisory", stamp(storm.updated)],
    ["Forecast reaches", forecastPoints.length ? stamp(forecastPoints.at(-1)!.time) : "Not given"],
  ];
  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[26px] text-ink">{storm.name}</h2>
        <Pill tone={ALERT_TONE[storm.alert] ?? "grey"}>{storm.alert} alert</Pill>
      </div>
      <div className="mt-3 grid gap-x-10 gap-y-5 md:grid-cols-2">
        <dl className="divide-y divide-ice text-[14px]">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-[#5f6b7a]">{k}</dt>
              <dd className="text-right font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <Label>Against LEVee&apos;s rules</Label>
          <ul className="mt-3 space-y-3">
            <Rule met={alertOk} label="GDACS Orange or Red alert" detail={`GDACS says ${storm.alert}`} />
            <Rule met={inArea} label="In a LEVee playbook area" detail={inArea ? "Inside the US Gulf Coast watch area" : "No LEVee playbook covers this area yet"} />
            <Rule
              met={leadMet}
              label={`Forecast landfall ${RULES.minLeadHours} to ${RULES.maxLeadHours} hours away`}
              detail={!inArea ? "Only checked inside a playbook area" : !b ? "Worked out from the forecast track when Sentinel reads it" : lead === null ? "No forecast landfall on a LEVee coast" : `Forecast landfall in about ${lead} hours`}
            />
            <Rule
              met={b ? b.confidence >= RULES.minConfidence : null}
              label={`Sentinel confidence ${RULES.minConfidence} or more`}
              detail={b ? `Sentinel scored ${b.confidence} from advisory ${live.brief!.advisory}` : "Ask Sentinel below for a live brief"}
            />
          </ul>
        </div>
      </div>
      <SentinelBriefPanel {...live} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ice pt-3">
        <p className="text-[14px] font-semibold text-ink">{alertOk && inArea ? "Being watched. No money has moved" : "No money moves for this storm"}</p>
        <a href={storm.url} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-link hover:underline">
          Read the GDACS report
        </a>
      </div>
    </Card>
  );
}

function Legend() {
  const dot = (color: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full ring-1 ring-navy/30" style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[#5f6b7a]">
      {dot("#ff6a5e", "Red alert")}
      {dot("#ffc439", "Orange alert")}
      {dot("#6fe3a1", "Green alert")}
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-5 bg-[#5f6b7a]" />
        Track so far
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="w-5 border-t-2 border-dashed border-[#5f6b7a]" />
        Forecast
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-5 rounded-sm bg-ice ring-1 ring-ice-line" />
        Forecast cone
      </span>
    </div>
  );
}

export default function LiveBoard({ current }: { current: LiveStorm[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = current.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
        <Card pad="p-0" className="min-w-0 overflow-hidden">
          <div className="relative">
            <WorldMap storms={current} selected={selected} onSelect={setSelectedId} />
            {selected && (
              <button type="button" onClick={() => setSelectedId(null)} className="absolute right-3 top-3 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-semibold text-link shadow-md transition hover:bg-ice-soft">
                Back to the world
              </button>
            )}
          </div>
          <div className="px-5 py-3">
            <Legend />
            <p className="mt-1.5 text-[12px] text-[#5f6b7a]">Storm data from GDACS, refreshed every 15 minutes. Map data from Natural Earth. For illustration, not for navigation or safety decisions.</p>
          </div>
        </Card>

        <div className="min-w-0">
          <Label>
            {current.length} current {current.length === 1 ? "cyclone" : "cyclones"}
          </Label>
          {current.length === 0 ? (
            <p className="mt-2 text-[15px] leading-relaxed text-body">GDACS has no active tropical cyclones right now, so LEVee has nothing to watch and spends nothing.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {current.map((s) => {
                const on = selected?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelectedId(on ? null : s.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition ${on ? "bg-ice-soft ring-blue" : "bg-white ring-ice hover:bg-ice-soft"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{s.name}</span>
                        <span className="block truncate text-[13px] text-[#5f6b7a]">
                          {s.countries || "Over open ocean"}
                          {s.windKmh !== null && ` · ${s.windKmh} km/h`}
                        </span>
                      </span>
                      <Pill tone={ALERT_TONE[s.alert] ?? "grey"}>{s.alert}</Pill>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {current.length > 0 && !selected && <p className="mt-3 text-[13px] leading-relaxed text-[#5f6b7a]">Choose a storm to zoom in and check it against the rules.</p>}
        </div>
      </div>

      {selected && <StormDetail key={selected.id} storm={selected} />}
    </>
  );
}
