import type { ProofUpload } from "../../../../../backend/agents/src/levee.ts";
import { bodyOf, handle, RequestError, text, withCookies } from "../../../server/http.ts";
import { levee } from "../../../server/levee.ts";
import { requirePartner } from "../../../server/supabaseAuth.ts";

/**
 * Partners only: a partner token, or a logged-in approved responder. The partner comes from that, never the upload;
 * amounts, dates and service area come from Levee's records. Images arrive as base64 and are decoded here, so nothing
 * from the upload reaches the Verifier as anything but bytes. Only Levee's own sample run (src/server/liveRun.ts) marks
 * a pack as a sample, so a partner can't tell the Verifier to accept placeholders.
 */

const MAX_FILE = 15 * 1024 * 1024;
const LIMITS = { photos: 30, receipts: 50, distribution: 5000 };
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function listOf(body: Record<string, unknown>, field: keyof typeof LIMITS): Record<string, unknown>[] {
  const value = body[field];
  if (!Array.isArray(value)) throw new RequestError("photos, receipts and distribution must be lists");
  if (value.length > LIMITS[field]) throw new RequestError(`Send at most ${LIMITS[field]} ${field}`);
  return value.map((v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new RequestError(`Each of ${field} must be an object`);
    return v as Record<string, unknown>;
  });
}

const words = (row: Record<string, unknown>, field: string, where: string, max = 200) => {
  const value = row[field];
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new RequestError(`${where}: ${field} is required, in up to ${max} characters`);
  return value.trim();
};

const amount = (row: Record<string, unknown>, field: string, where: string) => {
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RequestError(`${where}: ${field} must be a number, 0 or more`);
  return value;
};

function bytes(row: Record<string, unknown>, field: string, where: string) {
  const value = row[field];
  if (typeof value !== "string" || !value || value.length % 4 !== 0 || !BASE64.test(value)) throw new RequestError(`${where}: ${field} must be the file as base64`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > MAX_FILE) throw new RequestError(`${where}: files must be 15 MB or less`);
  return decoded;
}

/** The upload as the Verifier reads it, or a 400 naming what's wrong. */
function proofFrom(body: Record<string, unknown>, partnerId: string): ProofUpload {
  return {
    eventKey: text(body, "eventKey"),
    partnerId,
    photos: listOf(body, "photos").map((p, i) => {
      const where = `Photo ${i + 1}`;
      return { id: words(p, "id", where, 100), caption: typeof p.caption === "string" ? p.caption.slice(0, 500) : "", bytes: bytes(p, "bytes", where) };
    }),
    receipts: listOf(body, "receipts").map((r, i) => {
      const where = `Receipt ${i + 1}`;
      return {
        id: words(r, "id", where, 100),
        number: words(r, "number", where, 100),
        vendor: words(r, "vendor", where),
        date: words(r, "date", where, 40),
        item: words(r, "item", where),
        quantity: amount(r, "quantity", where),
        total: amount(r, "total", where),
        currency: words(r, "currency", where, 3),
        image: bytes(r, "image", where),
      };
    }),
    distribution: listOf(body, "distribution").map((d, i) => {
      const where = `Distribution row ${i + 1}`;
      return { beneficiaryId: words(d, "beneficiaryId", where, 100), item: words(d, "item", where), quantity: amount(d, "quantity", where), date: words(d, "date", where, 40), location: words(d, "location", where) };
    }),
  };
}

export const POST = (request: Request) =>
  handle(async () => {
    const { partnerId, cookies } = await requirePartner(request);
    return withCookies(await levee().submitProof(proofFrom(await bodyOf(request), partnerId)), cookies);
  });
