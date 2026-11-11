// Usage: npm run capture-helene
// Saves GDACS and Open-Meteo data for Hurricane Helene as a replay fixture. No LLM. Run once; replays then need no network.
import { mkdirSync, writeFileSync } from "node:fs";
import { HELENE_EVENT_ID, REGIONS } from "../src/sentinel/feeds.ts";

const base = "https://www.gdacs.org/gdacsapi/api";
const dir = new URL("../fixtures/helene/", import.meta.url);
mkdirSync(dir, { recursive: true });
const getJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as any;
};
const save = (name: string, data: unknown) => writeFileSync(new URL(name, dir), JSON.stringify(data) + "\n");

const event = await getJson(`${base}/events/geteventdata?eventtype=TC&eventid=${HELENE_EVENT_ID}`);
const { alertlevel, episodealertlevel, severitydata, affectedcountries, datemodified, eventname, source } = event.properties;
save("event.json", { properties: { alertlevel, episodealertlevel, severitydata, affectedcountries, datemodified, eventname, source, eventid: HELENE_EVENT_ID } });

const advisories = [];
for (let episode = 1; episode <= event.properties.episodes.length; episode++) {
  const geo = await getJson(`${base}/polygons/getgeometry?eventtype=TC&eventid=${HELENE_EVENT_ID}&episodeid=${episode}`);
  const details = await getJson(`${base}/events/getepisodedata?eventtype=TC&eventid=${HELENE_EVENT_ID}&episodeid=${episode}`);
  const features = geo.features
    .filter((f: any) => f.properties.Class?.startsWith("Point_Polygon"))
    .map((f: any) => ({ geometry: f.geometry, properties: { Class: f.properties.Class, key: f.properties.key, polygondate: f.properties.polygondate } }));
  // The alert and wind as they stood at this advisory: the event's own values are only the final ones, which a replay must not see early.
  advisories.push({ episode, alertLevel: details.properties.episodealertlevel, windKmh: Math.round(details.properties.severitydata?.severity ?? 0), features });
}
save("advisories.json", advisories);

// Headlines only, and only up to landfall day: nothing later can reach a replay, even by mistake.
const news = await getJson(`${base}/emm/getemmnewsbykey?eventtype=TC&eventid=${HELENE_EVENT_ID}`);
const items = (Array.isArray(news) ? news : news.value ?? []) as any[];
save("news.json", items.filter((i) => i.pubdate < "2024-09-28").map(({ pubdate, source, title, link }) => ({ pubdate, source, title, link })));

// Ends the day of landfall for the same reason. These are archive values, not forecasts as issued.
const region = REGIONS.find((r) => r.id === "us-gulf-coast")!;
const rivers = [];
for (const river of region.rivers) {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${river.lat}&longitude=${river.lon}&daily=river_discharge,river_discharge_median,river_discharge_min,river_discharge_max&start_date=2024-09-13&end_date=2024-09-27`;
  rivers.push({ name: river.name, lat: river.lat, lon: river.lon, url, data: await getJson(url) });
}
save("rivers.json", rivers);

console.log(`Saved ${advisories.length} advisories, ${items.length} news items seen, ${rivers.length} rivers.`);
