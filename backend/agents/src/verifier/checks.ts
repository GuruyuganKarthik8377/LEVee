import { hashDistance, sha256, type PhotoFacts, type ProofPack } from "./proof.ts";

// integrity: something looks wrong, so a person decides. incomplete: nothing looks wrong, but it isn't fully shown.
export type Severity = "integrity" | "incomplete";
export type ProofCheck = { rule: string; required: string; actual: string; passed: boolean; severity: Severity };

export type SeenImage = { sha256: string; dhash: string | null; partnerId: string; eventKey: string; imageId: string };
// Every image Levee has accepted before. This is what catches a photo recycled from another storm or partner.
export type ImageRegistry = { all(): Promise<SeenImage[]>; add(images: SeenImage[]): Promise<void> };

export function memoryRegistry(initial: SeenImage[] = []): ImageRegistry {
  const images = [...initial];
  return {
    async all() {
      return images;
    },
    async add(more) {
      images.push(...more);
    },
  };
}

// Limits for a person to tune. A false match only sends a pack to human review.
export const SAME_PICTURE_MAX_DISTANCE = 8;
const MIN_ACCOUNTED_SHARE = 0.8;
const MAX_ACCOUNTED_SHARE = 1.25;
const MIN_DISTRIBUTED_SHARE = 0.8;
const EDITING_SOFTWARE = /photoshop|lightroom|gimp|snapseed|picsart|canva|affinity|pixelmator|facetune/i;

const norm = (s: string) => s.trim().toLowerCase();
const list = (items: string[]) => (items.length ? items.join(", ") : "none");

export function samePicture(a: { sha256: string; dhash: string | null }, b: { sha256: string; dhash: string | null }): boolean {
  return a.sha256 === b.sha256 || (a.dhash !== null && b.dhash !== null && hashDistance(a.dhash, b.dhash) <= SAME_PICTURE_MAX_DISTANCE);
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Calendar date on the partner's clock, because receipts and lists carry dates, not times.
const localDate = (iso: string, utcOffsetMinutes: number) => new Date(new Date(iso).getTime() + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);

// usdPerUnit is Levee's own rate table: rates supplied by a partner could be used to inflate its figures.
export function runChecks(pack: ProofPack, photos: PhotoFacts[], seen: SeenImage[], usdPerUnit: Record<string, number>): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const add = (severity: Severity, rule: string, required: string, actual: string, passed: boolean) => checks.push({ rule, required, actual, passed, severity });
  const { serviceArea: area, fundsReceivedAt: from, landfallAt: to } = pack;
  const firstDay = localDate(from, area.utcOffsetMinutes);
  const lastDay = localDate(to, area.utcOffsetMinutes);
  const inWindow = (day: string) => day >= firstDay && day <= lastDay;
  const window = `${firstDay} to ${lastDay}`;

  // Photos: reuse is the demo's headline case, and costs nothing to catch here.
  const readable = photos.filter((p) => p.readable);
  add("incomplete", "Photos can be read", "at least one, all readable", `${readable.length} of ${photos.length}`, readable.length > 0 && readable.length === photos.length);

  const repeats = readable.filter((p, i) => readable.slice(0, i).some((q) => samePicture(p, q))).map((p) => p.id);
  add("integrity", "No photo appears twice in this pack", "none", list(repeats), repeats.length === 0);

  const reused = readable.flatMap((p) =>
    seen
      .filter((s) => (s.partnerId !== pack.partnerId || s.eventKey !== pack.eventKey) && samePicture(p, s))
      .slice(0, 1)
      .map((s) => `${p.id} matches ${s.imageId} (${s.partnerId}, ${s.eventKey})`),
  );
  add("integrity", "No photo was used before", "none", list(reused), reused.length === 0);

  const edited = readable.filter((p) => p.software && EDITING_SOFTWARE.test(p.software)).map((p) => `${p.id} (${p.software})`);
  add("integrity", "No photo went through editing software", "none", list(edited), edited.length === 0);

  const dated = readable.filter((p) => p.takenAt);
  const outside = dated.filter((p) => p.takenAt! < from || p.takenAt! > to).map((p) => `${p.id} (${p.takenAt})`);
  add("integrity", "Photos taken after funds arrived and before landfall", `${from} to ${to}`, list(outside), outside.length === 0);
  add("incomplete", "Photos carry a timestamp", "all", `${dated.length} of ${readable.length}`, readable.length > 0 && dated.length === readable.length);

  const located = readable.filter((p) => p.lat !== null && p.lon !== null);
  const far = located.filter((p) => distanceKm({ lat: p.lat!, lon: p.lon! }, area) > area.radiusKm).map((p) => `${p.id} (${Math.round(distanceKm({ lat: p.lat!, lon: p.lon! }, area))} km away)`);
  add("integrity", "Photos taken in the partner's service area", `within ${area.radiusKm} km of ${area.name}`, list(far), far.length === 0);
  add("incomplete", "Photos carry a location", "all", `${located.length} of ${readable.length}`, readable.length > 0 && located.length === readable.length);

  // Receipts.
  const numbers = pack.receipts.map((r) => norm(r.number));
  const hashes = pack.receipts.map((r) => sha256(r.image));
  const repeatedReceipts = pack.receipts.filter((_, i) => numbers.indexOf(numbers[i]) !== i || hashes.indexOf(hashes[i]) !== i).map((r) => r.id);
  add("integrity", "No receipt appears twice", "none", list(repeatedReceipts), repeatedReceipts.length === 0);

  const reusedReceipts = pack.receipts.filter((r, i) => seen.some((s) => (s.partnerId !== pack.partnerId || s.eventKey !== pack.eventKey) && s.sha256 === hashes[i])).map((r) => r.id);
  add("integrity", "No receipt was used before", "none", list(reusedReceipts), reusedReceipts.length === 0);

  const badDates = pack.receipts.filter((r) => !inWindow(r.date)).map((r) => `${r.id} (${r.date})`);
  add("integrity", "Receipts dated after funds arrived and before landfall", window, list(badDates), badDates.length === 0);

  const noRate = pack.receipts.filter((r) => !usdPerUnit[r.currency]).map((r) => `${r.id} (${r.currency})`);
  add("incomplete", "Receipts in a currency Levee can convert", "all", noRate.length ? list(noRate) : "all", noRate.length === 0);

  const received = Number(pack.amountReceived.value) * (usdPerUnit[pack.amountReceived.currency_code] ?? NaN);
  const spent = pack.receipts.reduce((sum, r) => sum + r.total * (usdPerUnit[r.currency] ?? 0), 0);
  const share = spent / received;
  add("incomplete", "Receipts account for the money received", `${MIN_ACCOUNTED_SHARE * 100}% to ${MAX_ACCOUNTED_SHARE * 100}% of $${received.toFixed(2)}`, Number.isFinite(share) ? `$${spent.toFixed(2)}, ${Math.round(share * 100)}%` : "cannot convert", share >= MIN_ACCOUNTED_SHARE && share <= MAX_ACCOUNTED_SHARE);

  // Distribution lists against what was bought.
  add("incomplete", "A distribution list is included", "at least one row", `${pack.distribution.length} rows`, pack.distribution.length > 0);

  const bought = new Map<string, number>();
  for (const r of pack.receipts) bought.set(norm(r.item), (bought.get(norm(r.item)) ?? 0) + r.quantity);
  const given = new Map<string, number>();
  for (const d of pack.distribution) given.set(norm(d.item), (given.get(norm(d.item)) ?? 0) + d.quantity);

  const overGiven = [...given].filter(([item, qty]) => qty > (bought.get(item) ?? 0)).map(([item, qty]) => `${item}: gave ${qty}, bought ${bought.get(item) ?? 0}`);
  add("integrity", "No more handed out than was bought", "none over", list(overGiven), overGiven.length === 0);

  const underGiven = [...bought].filter(([item, qty]) => (given.get(item) ?? 0) < qty * MIN_DISTRIBUTED_SHARE).map(([item, qty]) => `${item}: gave ${given.get(item) ?? 0}, bought ${qty}`);
  add("incomplete", "Most of what was bought was handed out", `${MIN_DISTRIBUTED_SHARE * 100}% of each item`, list(underGiven), underGiven.length === 0);

  const rowKeys = pack.distribution.map((d) => `${d.beneficiaryId}|${norm(d.item)}`);
  const repeatRows = [...new Set(rowKeys.filter((k, i) => rowKeys.indexOf(k) !== i))].map((k) => k.replace("|", " got "));
  add("incomplete", "No household listed twice for the same item", "none", list(repeatRows), repeatRows.length === 0);

  const badRowDates = pack.distribution.filter((d) => !inWindow(d.date)).length;
  add("integrity", "Handouts dated after funds arrived and before landfall", window, `${badRowDates} outside`, badRowDates === 0);

  return checks;
}

export type Verdict = "pass" | "partial" | "human";

export function verdictFrom(checks: ProofCheck[]): Verdict {
  if (checks.some((c) => !c.passed && c.severity === "integrity")) return "human";
  if (checks.some((c) => !c.passed)) return "partial";
  return "pass";
}
