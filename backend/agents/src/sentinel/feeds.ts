import { readFileSync } from "node:fs";

// Everything Sentinel may know at one moment. Built the same way for live runs and replays, so replays can't see the future.
export type Snapshot = {
  mode: "live" | "replay";
  asOf: string;
  event: { id: number; name: string; alertLevel: string; windKmh: number; countries: string[]; url: string };
  advisories: Advisory[];
  rivers: RiverReading[];
  news: { id: string; publishedAt: string; source: string; title: string; link: string }[];
  // Limits of this data that a reader of the brief must know.
  caveats: string[];
};
export type TrackPoint = { time: string; lat: number; lon: number };
export type Advisory = { id: string; issuedAt: string; url: string; points: TrackPoint[] };
export type RiverReading = {
  id: string;
  name: string;
  url: string;
  days: { date: string; discharge: number; min: number; max: number; forecast: boolean }[];
};

export const REMAL_EVENT_ID = 1001064;
export const HELENE_EVENT_ID = 1001101;
const GDACS = "https://www.gdacs.org/gdacsapi/api";

// shortcut: the coast is one latitude line per region, which only works for coasts running east-west. Use a coastline polygon when adding other regions.
export const REGIONS = [
  {
    id: "bay-of-bengal-north",
    coastLatitude: 21.8,
    minLon: 86,
    maxLon: 93,
    rivers: [
      { name: "Khulna", lat: 22.82, lon: 89.55 },
      { name: "Barisal", lat: 22.7, lon: 90.37 },
      { name: "Meghna at Chandpur", lat: 23.23, lon: 90.65 },
      { name: "Hooghly at Kolkata", lat: 22.57, lon: 88.36 },
    ],
  },
  {
    // Florida's Big Bend, where the coast meets storms coming north. Not the peninsula's west coast, which runs north-south.
    id: "us-gulf-coast",
    coastLatitude: 30.0,
    minLon: -86,
    maxLon: -82,
    rivers: [
      { name: "Suwannee at Branford", lat: 29.96, lon: -82.93 },
      { name: "Withlacoochee at Valdosta", lat: 30.83, lon: -83.32 },
      { name: "Ochlockonee at Bloxham", lat: 30.38, lon: -84.65 },
    ],
  },
];

const utc = (time: string) => (/[zZ]$/.test(time) ? time : `${time}Z`);
const iso = (ms: number) => new Date(ms).toISOString();

// GDACS draws each track point as a circle of wind radii, so its centre is the storm's position. Point keys are MMDDHHmm UTC with no year.
export function parseAdvisory(episode: number, eventId: number, features: any[]): Advisory {
  const points = features.filter((f) => f.properties.Class?.startsWith("Point_Polygon"));
  if (points.length === 0) throw new Error(`Advisory ${episode} has no track points`);
  const issued = utc(points[0].properties.polygondate);
  const issuedDate = new Date(issued);
  return {
    id: `gdacs-advisory-${episode}`,
    issuedAt: issuedDate.toISOString(),
    url: `${GDACS}/polygons/getgeometry?eventtype=TC&eventid=${eventId}&episodeid=${episode}`,
    points: points
      .map((f) => {
        const ring: number[][] = f.geometry.coordinates[0];
        const mean = (axis: number) => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length;
        const key: string = f.properties.key;
        const [month, day, hour, minute] = [key.slice(0, 2), key.slice(2, 4), key.slice(4, 6), key.slice(6, 8)].map(Number);
        // A storm spanning New Year has January points on a December advisory.
        const year = issuedDate.getUTCFullYear() + (month < issuedDate.getUTCMonth() + 1 ? 1 : 0);
        return { time: iso(Date.UTC(year, month - 1, day, hour, minute)), lat: Number(mean(1).toFixed(2)), lon: Number(mean(0).toFixed(2)) };
      })
      .sort((a, b) => a.time.localeCompare(b.time)),
  };
}

export function parseRiver(name: string, url: string, data: any, asOf: string): RiverReading {
  const d = data.daily;
  const today = asOf.slice(0, 10);
  return {
    id: `river-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    name,
    url,
    days: d.time.map((date: string, i: number) => ({
      date,
      discharge: d.river_discharge[i],
      min: d.river_discharge_min[i],
      max: d.river_discharge_max[i],
      forecast: date > today,
    })),
  };
}

function eventFields(properties: any, id: number) {
  return {
    id,
    name: properties.eventname,
    alertLevel: properties.alertlevel,
    windKmh: Math.round(properties.severitydata.severity),
    countries: properties.affectedcountries.map((c: any) => c.countryname),
    url: `https://www.gdacs.org/report.aspx?eventid=${id}&eventtype=TC`,
  };
}

const newsItem = (i: any, index: number) => ({ id: `news-${index + 1}`, publishedAt: new Date(utc(i.pubdate)).toISOString(), source: i.source, title: i.title, link: i.link });

const REPLAYS = { remal: REMAL_EVENT_ID, helene: HELENE_EVENT_ID };

type FixtureFile = "advisories.json" | "event.json" | "rivers.json" | "news.json";

// Each path is written out in full, because the website's bundler can't follow a path built from variables: it turned
// `../../fixtures/${storm}/${name}` into one file, so every read returned advisories.json and /run's replay crashed.
const FIXTURES: Record<keyof typeof REPLAYS, Record<FixtureFile, URL>> = {
  remal: {
    "advisories.json": new URL("../../fixtures/remal/advisories.json", import.meta.url),
    "event.json": new URL("../../fixtures/remal/event.json", import.meta.url),
    "rivers.json": new URL("../../fixtures/remal/rivers.json", import.meta.url),
    "news.json": new URL("../../fixtures/remal/news.json", import.meta.url),
  },
  helene: {
    "advisories.json": new URL("../../fixtures/helene/advisories.json", import.meta.url),
    "event.json": new URL("../../fixtures/helene/event.json", import.meta.url),
    "rivers.json": new URL("../../fixtures/helene/rivers.json", import.meta.url),
    "news.json": new URL("../../fixtures/helene/news.json", import.meta.url),
  },
};

// A past storm as it looked right after an advisory was issued. Remal has 6 advisories and Helene has 18.
export function replaySnapshot(advisory: number, storm: keyof typeof REPLAYS = "remal"): Snapshot {
  const fixture = (name: FixtureFile) => JSON.parse(readFileSync(FIXTURES[storm][name], "utf8"));
  const eventId = REPLAYS[storm];
  const all: any[] = fixture("advisories.json");
  const parsed = all.map((a) => parseAdvisory(a.episode, eventId, a.features));
  const current = parsed.find((a) => a.id === `gdacs-advisory-${advisory}`);
  if (!current) throw new Error(`${storm} has advisories 1 to ${all.length}, not ${advisory}`);
  // Helene's capture kept the alert and wind as issued. Remal's only has the final values, which its caveat says.
  const asIssued = all.find((a) => a.episode === advisory);
  const asOf = current.issuedAt;
  const { properties } = fixture("event.json");
  const isoAsOf = new Date(asOf).getTime();
  return {
    mode: "replay",
    asOf,
    event: { ...eventFields(properties, eventId), ...(asIssued.alertLevel && { alertLevel: asIssued.alertLevel }), ...(asIssued.windKmh && { windKmh: asIssued.windKmh }) },
    advisories: parsed.filter((a) => a.issuedAt <= asOf),
    // Only days already over: archive values for later days are what really happened, not what was forecast then.
    rivers: fixture("rivers.json").map((r: any) => {
      const reading = parseRiver(r.name, r.url, r.data, asOf);
      return { ...reading, days: reading.days.filter((d) => d.date < asOf.slice(0, 10)) };
    }),
    news: fixture("news.json")
      .filter((i: any) => new Date(utc(i.pubdate)).getTime() <= isoAsOf)
      .sort((a: any, b: any) => a.pubdate.localeCompare(b.pubdate))
      .map(newsItem),
    caveats: [
      asIssued.alertLevel
        ? "Replay of a past storm. The alert level and wind speed are as GDACS issued them at this advisory."
        : `Replay of a past storm. GDACS last reprocessed this event on ${properties.datemodified.slice(0, 10)}, so its alert level and wind speed are final values, not necessarily what was shown at the time. Forecast tracks are as issued.`,
      "River forecasts as issued were not archived, so this replay has no river forecast: only readings from days already over.",
    ],
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

// Active cyclones GDACS currently rates Orange or Red. An hourly run calls this, then snapshots each one.
export async function activeCycloneIds(): Promise<number[]> {
  const list = await getJson(`${GDACS}/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Orange;Red`);
  return (list.features ?? []).filter((f: any) => f.properties.iscurrent === "true" || f.properties.iscurrent === true).map((f: any) => f.properties.eventid);
}

/**
 * A storm as GDACS shows it now. `latest` limits it to the newest advisories, for a quick read: GDACS can take half a
 * minute for one advisory, and Sentinel's input only shows the latest six. The hourly job reads them all, so the
 * largest track shift is measured across every advisory. Missing news or river data becomes a caveat, not a failure.
 */
export async function liveSnapshot(eventId: number, now = new Date(), latest?: number): Promise<Snapshot> {
  const event = await getJson(`${GDACS}/events/geteventdata?eventtype=TC&eventid=${eventId}`);
  const count: number = event.properties.episodes.length;
  const from = latest ? Math.max(1, count - latest + 1) : 1;
  // Six at a time: a storm can have dozens of advisories, and one after another took most of a minute.
  const advisories: Advisory[] = [];
  for (let first = from; first <= count; first += 6) {
    const episodes = Array.from({ length: Math.min(6, count - first + 1) }, (_, i) => first + i);
    const batch = await Promise.all(episodes.map(async (episode) => parseAdvisory(episode, eventId, (await getJson(`${GDACS}/polygons/getgeometry?eventtype=TC&eventid=${eventId}&episodeid=${episode}`)).features)));
    advisories.push(...batch);
  }
  const asOf = now.toISOString();
  const position = advisories.at(-1)!.points.at(-1)!;
  const region = REGIONS.find((r) => position.lon >= r.minLon && position.lon <= r.maxLon);
  const caveats = region ? [] : ["This storm is outside every Levee region, so there is no landfall estimate and no river data."];
  if (from > 1) caveats.push(`Read the latest ${count - from + 1} of ${count} advisories, so the largest track shift covers only those.`);

  const rivers = (
    await Promise.all(
      (region?.rivers ?? []).map(async (r) => {
        const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${r.lat}&longitude=${r.lon}&daily=river_discharge,river_discharge_median,river_discharge_min,river_discharge_max&past_days=3&forecast_days=7`;
        try {
          return parseRiver(r.name, url, await getJson(url), asOf);
        } catch {
          caveats.push(`No river data for ${r.name}: the flood service didn't answer.`);
          return null;
        }
      }),
    )
  ).filter((r): r is RiverReading => r !== null);

  // GDACS answers 404 for a storm no news story has mentioned yet, which is common far out at sea.
  let items: any[] = [];
  try {
    const news = await getJson(`${GDACS}/emm/getemmnewsbykey?eventtype=TC&eventid=${eventId}`);
    items = (Array.isArray(news) ? news : news.value ?? []) as any[];
  } catch {
    caveats.push("GDACS has no news stories for this storm, so the brief rests on the forecast data alone.");
  }
  return {
    mode: "live",
    asOf,
    event: eventFields(event.properties, eventId),
    advisories,
    rivers,
    news: items.sort((a, b) => a.pubdate.localeCompare(b.pubdate)).map(newsItem),
    caveats,
  };
}
