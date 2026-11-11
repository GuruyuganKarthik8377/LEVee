import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import exifr from "exifr";

export type Money = { currency_code: string; value: string };

// What a partner uploads to show how it used tranche 1. Beneficiaries are ids only: names never enter Levee.
export type ProofPack = {
  partnerId: string;
  eventKey: string;
  amountReceived: Money;
  fundsReceivedAt: string;
  landfallAt: string;
  // Where the partner works, and its clock: photo timestamps carry no time zone.
  serviceArea: { name: string; lat: number; lon: number; radiusKm: number; utcOffsetMinutes: number };
  photos: { id: string; caption: string; bytes: Buffer }[];
  receipts: { id: string; number: string; vendor: string; date: string; item: string; quantity: number; total: number; currency: string; image: Buffer }[];
  distribution: { beneficiaryId: string; item: string; quantity: number; date: string; location: string }[];
  // Sample packs use labelled placeholder images instead of photographs.
  sample?: boolean;
};

export type PhotoFacts = {
  id: string;
  readable: boolean;
  sha256: string;
  dhash: string | null;
  takenAt: string | null;
  lat: number | null;
  lon: number | null;
  software: string | null;
};

// sharp is a native image library. It loads only when a photo is checked, so a server without it still runs every other route.
let sharpModule: Promise<typeof import("sharp")> | undefined;
export const loadSharp = async () => (await (sharpModule ??= import("sharp"))).default;

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// A fingerprint of the picture itself, so a resized or re-saved copy still matches when its bytes don't.
export async function differenceHash(bytes: Buffer): Promise<string> {
  const sharp = await loadSharp();
  const pixels = await sharp(bytes).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | (pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1n : 0n);
  return hash.toString(16).padStart(16, "0");
}

export function hashDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let bits = 0;
  for (; diff > 0n; diff >>= 1n) bits += Number(diff & 1n);
  return bits;
}

// Photo timestamps are local wall-clock text like "2024:05:26 10:15:00". Read as text, because a Date would use this server's time zone.
export function localExifTimeToUtc(text: string, utcOffsetMinutes: number): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - utcOffsetMinutes * 60_000;
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// Uploads are untrusted: a file that won't decode is reported as unreadable, never a crash.
export async function analyzePhoto(photo: { id: string; bytes: Buffer }, utcOffsetMinutes: number): Promise<PhotoFacts> {
  const facts: PhotoFacts = { id: photo.id, readable: false, sha256: sha256(photo.bytes), dhash: null, takenAt: null, lat: null, lon: null, software: null };
  try {
    facts.dhash = await differenceHash(photo.bytes);
    facts.readable = true;
  } catch {
    return facts;
  }
  const exif = await exifr.parse(photo.bytes, { reviveValues: false, tiff: true, exif: true, gps: true }).catch(() => undefined);
  if (exif) {
    facts.takenAt = typeof exif.DateTimeOriginal === "string" ? localExifTimeToUtc(exif.DateTimeOriginal, utcOffsetMinutes) : null;
    facts.lat = typeof exif.latitude === "number" ? exif.latitude : null;
    facts.lon = typeof exif.longitude === "number" ? exif.longitude : null;
    facts.software = typeof exif.Software === "string" ? exif.Software : null;
  }
  return facts;
}

// Reads a pack saved as pack.json plus image files, as the replay fixtures are.
export function loadPack(dir: URL): ProofPack {
  const read = (file: string) => readFileSync(new URL(file, dir));
  const pack = JSON.parse(read("pack.json").toString());
  return {
    ...pack,
    photos: pack.photos.map((p: any) => ({ id: p.id, caption: p.caption, bytes: read(p.file) })),
    receipts: pack.receipts.map((r: any) => ({ ...r, file: undefined, image: read(r.file) })),
  };
}
