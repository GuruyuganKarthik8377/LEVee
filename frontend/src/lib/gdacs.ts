/** Real tropical cyclones from GDACS, the UN and European Commission's disaster alert service. No AI runs here. */

const API = "https://www.gdacs.org/gdacsapi/api";

export type TrackPoint = { lat: number; lon: number; time: string; forecast: boolean };

export type LiveStorm = {
  id: number;
  episode: number;
  name: string;
  alert: string;
  current: boolean;
  lat: number;
  lon: number;
  countries: string;
  windKmh: number | null;
  /** When GDACS issued the latest advisory, in UTC. */
  updated: string;
  url: string;
  track: TrackPoint[];
  /** GDACS's forecast cone as [lon, lat] rings. */
  cone: [number, number][][];
};

type GdacsFeature = {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    eventid: number;
    episodeid?: number;
    name?: string;
    eventname?: string;
    alertlevel?: string;
    iscurrent?: boolean | string;
    country?: string;
    todate?: string;
    severitydata?: { severity?: number };
    Class?: string;
    key?: string;
    polygondate?: string;
  };
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const utc = (time: string) => (/[zZ]$/.test(time) ? time : `${time}Z`);
const revalidate = 900;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json() as Promise<T>;
}

/** GDACS draws each track point as a circle of wind radii, so its centre is the storm's position. Keys are MMDDHHmm in UTC. */
function parseTrack(features: GdacsFeature[]): TrackPoint[] {
  const points = features.filter((f) => f.properties?.Class?.startsWith("Point_Polygon"));
  const issued = points[0]?.properties?.polygondate;
  if (!issued) return [];
  const issuedMs = Date.parse(utc(issued));
  const year = new Date(issuedMs).getUTCFullYear();
  return points
    .map((f) => {
      const ring = (f.geometry?.coordinates as number[][][])[0];
      const mean = (axis: number) => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length;
      const key = f.properties!.key!;
      const [month, date, hour, minute] = [key.slice(0, 2), key.slice(2, 4), key.slice(4, 6), key.slice(6, 8)].map(Number);
      const ms = Date.UTC(month < new Date(issuedMs).getUTCMonth() + 1 ? year + 1 : year, month - 1, date, hour, minute);
      return { lat: mean(1), lon: mean(0), time: new Date(ms).toISOString(), forecast: ms > issuedMs };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** The cone's outer rings, thinned out: the map doesn't need thousands of points. */
function parseCone(features: GdacsFeature[]): [number, number][][] {
  const cone = features.find((f) => f.properties?.Class === "Poly_Cones");
  if (!cone?.geometry) return [];
  const rings = cone.geometry.type === "MultiPolygon" ? (cone.geometry.coordinates as number[][][][]).map((p) => p[0]) : [(cone.geometry.coordinates as number[][][])[0]];
  return rings.map((ring) => {
    const step = Math.max(1, Math.floor(ring.length / 120));
    return ring.filter((_, i) => i % step === 0).map(([lon, lat]) => [lon, lat] as [number, number]);
  });
}

/** Cyclones from the last two weeks, newest first. Returns null if GDACS can't be reached, which is different from a quiet day. */
export async function getStorms(): Promise<LiveStorm[] | null> {
  const to = new Date();
  const from = new Date(to.getTime() - 14 * 24 * 3_600_000);
  try {
    const list = await getJson<{ features?: GdacsFeature[] }>(`${API}/events/geteventlist/SEARCH?eventlist=TC&fromDate=${day(from)}&toDate=${day(to)}&alertlevel=green;orange;red`);
    const storms = (list.features ?? []).flatMap((f): LiveStorm[] => {
      const p = f.properties;
      const [lon, lat] = (f.geometry?.coordinates as number[] | undefined) ?? [];
      if (!p || typeof lat !== "number" || typeof lon !== "number") return [];
      return [
        {
          id: p.eventid,
          episode: p.episodeid ?? 1,
          name: (p.name ?? p.eventname ?? "Tropical cyclone").replace(/^Tropical Cyclone\s+/i, ""),
          alert: p.alertlevel ?? "Green",
          current: String(p.iscurrent) === "true",
          lat,
          lon,
          countries: p.country?.trim() ?? "",
          windKmh: p.severitydata?.severity ? Math.round(p.severitydata.severity) : null,
          updated: p.todate ? utc(p.todate) : "",
          url: `https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=TC`,
          track: [],
          cone: [],
        },
      ];
    });
    // A storm without a track still shows on the map, so one failed request can't hide it.
    await Promise.all(
      storms
        .filter((s) => s.current)
        .map(async (s) => {
          try {
            const geo = await getJson<{ features: GdacsFeature[] }>(`${API}/polygons/getgeometry?eventtype=TC&eventid=${s.id}&episodeid=${s.episode}`);
            s.track = parseTrack(geo.features);
            s.cone = parseCone(geo.features);
          } catch {
            // the marker alone is still true
          }
        }),
    );
    return storms;
  } catch {
    return null;
  }
}

/** The area around LEVee's one playbook, the US Gulf Coast. A storm here gets its forecast track checked. */
export const inGulfWatchArea = (s: { lat: number; lon: number }) => s.lat >= 15 && s.lat <= 36 && s.lon >= -98 && s.lon <= -74;

export const alertMeets = (alert: string) => alert === "Orange" || alert === "Red";
