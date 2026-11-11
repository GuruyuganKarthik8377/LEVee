import { REGIONS, type Advisory, type Snapshot } from "./feeds.ts";

export type Landfall = { etaUtc: string; lat: number; lon: number; leadHours: number; regionId: string };

// Facts computed by code. The Policy Engine relies on these, so the LLM reads them but never writes them.
export type Signals = {
  advisoryCount: number;
  latestAdvisoryAt: string;
  landfall: Landfall | null;
  // How far the forecast landfall moved between the two latest advisories, and across all of them.
  trackShiftKm: number | null;
  maxTrackShiftKm: number | null;
  etaShiftHours: number | null;
  rivers: { id: string; name: string; latestDischarge: number | null; forecastPeak: number | null; forecastSpreadRatio: number | null }[];
  newsCount: number;
};

const HOUR = 3_600_000;
const round = (n: number, digits = 1) => Number(n.toFixed(digits));

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Where and when the advisory's track first crosses a region's coast, interpolated between the two points either side of it.
export function forecastLandfall(advisory: Advisory, asOf: string): Landfall | null {
  for (let i = 0; i + 1 < advisory.points.length; i++) {
    const [from, to] = [advisory.points[i], advisory.points[i + 1]];
    for (const region of REGIONS) {
      if (from.lat >= region.coastLatitude || to.lat < region.coastLatitude) continue;
      const share = (region.coastLatitude - from.lat) / (to.lat - from.lat);
      const lon = from.lon + (to.lon - from.lon) * share;
      if (lon < region.minLon || lon > region.maxLon) continue;
      const eta = new Date(from.time).getTime() + (new Date(to.time).getTime() - new Date(from.time).getTime()) * share;
      return { etaUtc: new Date(eta).toISOString(), lat: region.coastLatitude, lon: round(lon, 2), leadHours: round((eta - new Date(asOf).getTime()) / HOUR), regionId: region.id };
    }
  }
  return null;
}

export function computeSignals(snapshot: Snapshot): Signals {
  const { advisories, asOf } = snapshot;
  if (advisories.length === 0) throw new Error("A snapshot needs at least one advisory");
  const landfalls = advisories.map((a) => forecastLandfall(a, asOf)).filter((l) => l !== null);
  const latest = forecastLandfall(advisories.at(-1)!, asOf);
  const previous = landfalls.length >= 2 && latest ? landfalls.at(-2)! : null;
  return {
    advisoryCount: advisories.length,
    latestAdvisoryAt: advisories.at(-1)!.issuedAt,
    landfall: latest,
    trackShiftKm: latest && previous ? round(distanceKm(previous, latest)) : null,
    maxTrackShiftKm: latest && landfalls.length >= 2 ? round(Math.max(...landfalls.map((l) => distanceKm(l, latest)))) : null,
    etaShiftHours: latest && previous ? round((new Date(latest.etaUtc).getTime() - new Date(previous.etaUtc).getTime()) / HOUR) : null,
    rivers: snapshot.rivers.map((river) => {
      const observed = river.days.filter((d) => !d.forecast);
      const forecast = river.days.filter((d) => d.forecast);
      const peak = forecast.length ? Math.max(...forecast.map((d) => d.max)) : null;
      const spread = forecast.length ? Math.max(...forecast.map((d) => (d.max - d.min) / Math.max(d.discharge, 1))) : null;
      return { id: river.id, name: river.name, latestDischarge: observed.at(-1)?.discharge ?? null, forecastPeak: peak, forecastSpreadRatio: spread === null ? null : round(spread, 2) };
    }),
    newsCount: snapshot.news.length,
  };
}
