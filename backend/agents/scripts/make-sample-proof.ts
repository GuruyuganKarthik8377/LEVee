// Usage: npm run make-sample-proof
// Writes Remal's sample proof packs. Photos are labelled placeholders, never real or AI-made pictures of a disaster.
// Partner A is honest. Partner B is identical except that one photo is a resized copy of a picture from an earlier storm.
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

type Exif = { takenLocal?: string; lat?: number; lon?: number; software?: string };

const dms = (value: number) => {
  const deg = Math.floor(value);
  const min = Math.floor((value - deg) * 60);
  const sec = Math.round(((value - deg) * 60 - min) * 60);
  return `${deg}/1 ${min}/1 ${sec}/1`;
};
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// A different pattern per seed, so each placeholder has its own fingerprint the way different photos do.
export async function placeholderPhoto(seed: number, label: string, exif: Exif = {}): Promise<Buffer> {
  const colour = (n: number) => `#${(((seed + 1) * 2654435 * (n + 7)) % 0xffffff).toString(16).padStart(6, "0")}`;
  const shapes = Array.from({ length: 24 }, (_, i) => {
    const x = ((seed + 3) * (i + 1) * 193) % 1100;
    const y = ((seed + 5) * (i + 2) * 127) % 680;
    return `<rect x="${x}" y="${y}" width="${70 + ((i * seed) % 170)}" height="${50 + ((i * 7 + seed) % 130)}" fill="${colour(i)}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${colour(99)}"/>${shapes}<rect x="0" y="690" width="1200" height="110" fill="#000000"/><text x="30" y="735" font-family="Arial" font-size="30" fill="#ffffff">SAMPLE PLACEHOLDER, NOT A PHOTOGRAPH</text><text x="30" y="775" font-family="Arial" font-size="30" fill="#ffffff">${escapeXml(label)}</text></svg>`;
  const tags: Record<string, Record<string, string>> = {};
  if (exif.software) tags.IFD0 = { Software: exif.software };
  if (exif.takenLocal) tags.IFD2 = { DateTimeOriginal: exif.takenLocal };
  if (exif.lat !== undefined && exif.lon !== undefined) tags.IFD3 = { GPSLatitudeRef: "N", GPSLatitude: dms(exif.lat), GPSLongitudeRef: exif.lon < 0 ? "W" : "E", GPSLongitude: dms(Math.abs(exif.lon)) };
  return sharp(Buffer.from(svg)).withExif(tags).jpeg({ quality: 82 }).toBuffer();
}

export async function receiptImage(r: { number: string; vendor: string; date: string; item: string; quantity: number; unit: number; total: number; currency: string }): Promise<Buffer> {
  const lines = [`RECEIPT ${r.number}`, r.vendor, `Date: ${r.date}`, "", `${r.item}`, `${r.quantity} x ${r.unit} ${r.currency}`, "", `TOTAL ${r.total} ${r.currency}`, "", "SAMPLE DOCUMENT"];
  const text = lines.map((l, i) => `<text x="50" y="${90 + i * 62}" font-family="Courier" font-size="38" fill="#111111">${escapeXml(l)}</text>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="760"><rect width="800" height="760" fill="#fbfaf5"/>${text}</svg>`)).jpeg({ quality: 88 }).toBuffer();
}

function distributionRows(prefix: string, date: string, location: string, item: string, households: number, start = 1) {
  return Array.from({ length: households }, (_, i) => ({ beneficiaryId: `${prefix}-${String(start + i).padStart(4, "0")}`, item, quantity: 1, date, location }));
}

async function main() {
  const root = new URL("../fixtures/remal/proof/", import.meta.url);
  const write = (dir: string, name: string, bytes: Buffer | string) => {
    mkdirSync(new URL(`${dir}/`, root), { recursive: true });
    writeFileSync(new URL(`${dir}/${name}`, root), bytes);
  };

  // Tranche 1 was paid at 01:00 UTC on 26 May and Remal landed around 18:30 UTC. Bangladesh is UTC+6.
  const shared = {
    eventKey: "remal-2024",
    amountReceived: { currency_code: "USD", value: "458.00" },
    fundsReceivedAt: "2024-05-26T01:00:00.000Z",
    landfallAt: "2024-05-26T18:30:00.000Z",
    sample: true,
  };
  // Each vendor has its own numbering, as real ones do. Claude flagged an earlier version where both shared a prefix.
  const receipts = async (dir: string, first: string, second: string) => {
    const defs = [
      { id: "receipt-1", number: first, vendor: "Coastal Traders", date: "2024-05-26", item: "rice sack", quantity: 60, unit: 650, total: 39000, currency: "BDT" },
      { id: "receipt-2", number: second, vendor: "Delta Supply", date: "2024-05-26", item: "tarpaulin", quantity: 40, unit: 300, total: 12000, currency: "BDT" },
    ];
    for (const d of defs) write(dir, `${d.id}.jpg`, await receiptImage(d));
    return defs.map(({ unit: _unit, ...d }) => ({ ...d, file: `${d.id}.jpg` }));
  };

  // A picture from an earlier storm, already in Levee's registry.
  const old = await placeholderPhoto(77, "Rice handout, earlier storm, 2020", { takenLocal: "2020:05:19 09:00:00", lat: 22.36, lon: 90.33 });
  write("prior", "old-photo-1.jpg", old);

  // Partner A: honest.
  const mongla = { lat: 22.49, lon: 89.6 };
  const a = [
    { id: "photo-1", seed: 11, caption: "Rice sacks handed out at Mongla", takenLocal: "2024:05:26 08:30:00" },
    { id: "photo-2", seed: 23, caption: "Tarpaulins handed out to households", takenLocal: "2024:05:26 11:00:00" },
    { id: "photo-3", seed: 41, caption: "Families moving to the Mongla shelter", takenLocal: "2024:05:26 14:45:00" },
  ];
  for (const p of a) write("partner-a", `${p.id}.jpg`, await placeholderPhoto(p.seed, p.caption, { takenLocal: p.takenLocal, ...mongla }));
  write("partner-a", "pack.json", JSON.stringify({
    ...shared,
    partnerId: "partner-a",
    serviceArea: { name: "Mongla, Bagerhat", ...mongla, radiusKm: 150, utcOffsetMinutes: 360 },
    photos: a.map(({ id, caption }) => ({ id, caption, file: `${id}.jpg` })),
    receipts: await receipts("partner-a", "CT-1041", "DS-2207"),
    distribution: [...distributionRows("MNG", "2024-05-26", "Mongla", "rice sack", 60), ...distributionRows("MNG", "2024-05-26", "Mongla", "tarpaulin", 40)],
  }, null, 2));

  // Partner B: everything adds up, but photo-2 is the old picture, resized and re-saved so its bytes no longer match.
  const patuakhali = { lat: 22.36, lon: 90.33 };
  write("partner-b", "photo-1.jpg", await placeholderPhoto(53, "Rice sacks handed out at Patuakhali", { takenLocal: "2024:05:26 09:15:00", ...patuakhali }));
  write("partner-b", "photo-2.jpg", await sharp(old).resize(900).withExif({ IFD2: { DateTimeOriginal: "2024:05:26 12:20:00" } }).jpeg({ quality: 60 }).toBuffer());
  write("partner-b", "pack.json", JSON.stringify({
    ...shared,
    partnerId: "partner-b",
    serviceArea: { name: "Patuakhali", ...patuakhali, radiusKm: 150, utcOffsetMinutes: 360 },
    photos: [
      { id: "photo-1", caption: "Rice sacks handed out at Patuakhali", file: "photo-1.jpg" },
      { id: "photo-2", caption: "More rice handed out before the storm", file: "photo-2.jpg" },
    ],
    receipts: await receipts("partner-b", "CT-1188", "DS-2315"),
    distribution: [...distributionRows("PTK", "2024-05-26", "Patuakhali", "rice sack", 60), ...distributionRows("PTK", "2024-05-26", "Patuakhali", "tarpaulin", 40)],
  }, null, 2));
  console.log("Wrote sample proof packs for partner-a, partner-b and one earlier-storm photo.");
}

if (import.meta.main) await main();
