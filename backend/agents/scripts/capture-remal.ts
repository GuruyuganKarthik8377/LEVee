// Usage: npm run capture-remal
// Saves GDACS and Open-Meteo data for Cyclone Remal as the replay fixture. Run once; the fixture is committed so replays need no network.
import { mkdirSync, writeFileSync } from "node:fs";
import { REMAL_EVENT_ID, REGIONS } from "../src/sentinel/feeds.ts";

const base = "https://www.gdacs.org/gdacsapi/api";
const dir = new URL("../fixtures/remal/", import.meta.url);
mkdirSync(dir, { recursive: true });
const getJson = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as any;
};
const save = (name: string, data: unknown) => writeFileSync(new URL(name, dir), JSON.stringify(data) + "\n");

const event = await getJson(`${base}/events/geteventdata?eventtype=TC&eventid=${REMAL_EVENT_ID}`);
const { alertlevel, episodealertlevel, severitydata, affectedcountries, datemodified, eventname, source } = event.properties;
save("event.json", { properties: { alertlevel, episodealertlevel, severitydata, affectedcountries, datemodified, eventname, source, eventid: REMAL_EVENT_ID } });

const advisories = [];
for (let episode = 1; episode <= event.properties.episodes.length; episode++) {
  const geo = await getJson(`${base}/polygons/getgeometry?eventtype=TC&eventid=${REMAL_EVENT_ID}&episodeid=${episode}`);
  // Only the track points, and only the fields the parser reads. The rest is icons and repeated event text.
  const features = geo.features
    .filter((f: any) => f.properties.Class?.startsWith("Point_Polygon"))
    .map((f: any) => ({ geometry: f.geometry, properties: { Class: f.properties.Class, key: f.properties.key, polygondate: f.properties.polygondate } }));
  advisories.push({ episode, features });
}
save("advisories.json", advisories);

// Headlines only, and only up to landfall day: nothing later can reach a replay, even by mistake.
const news = await getJson(`${base}/emm/getemmnewsbykey?eventtype=TC&eventid=${REMAL_EVENT_ID}`);
const items = (Array.isArray(news) ? news : news.value ?? []) as any[];
save("news.json", items.filter((i) => i.pubdate < "2024-05-27").map(({ pubdate, source, title, link }) => ({ pubdate, source, title, link })));

// Ends the day of landfall for the same reason. These are archive values, not forecasts as issued.
const rivers = [];
for (const river of REGIONS[0].rivers) {
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${river.lat}&longitude=${river.lon}&daily=river_discharge,river_discharge_median,river_discharge_min,river_discharge_max&start_date=2024-05-15&end_date=2024-05-26`;
  rivers.push({ name: river.name, lat: river.lat, lon: river.lon, url, data: await getJson(url) });
}
save("rivers.json", rivers);

console.log(`Saved ${advisories.length} advisories, ${items.length} news items seen, ${rivers.length} rivers.`);
