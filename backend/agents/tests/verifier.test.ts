import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { placeholderPhoto, receiptImage } from "../scripts/make-sample-proof.ts";
import { buildInput, runVerifier, VerifierError } from "../src/verifier/agent.ts";
import { memoryRegistry, runChecks, samePicture, verdictFrom, type SeenImage } from "../src/verifier/checks.ts";
import { analyzePhoto, differenceHash, hashDistance, loadPack, localExifTimeToUtc, sha256, type PhotoFacts, type ProofPack } from "../src/verifier/proof.ts";

const root = new URL("../fixtures/remal/proof/", import.meta.url);
const packA = () => loadPack(new URL("partner-a/", root));
const packB = () => loadPack(new URL("partner-b/", root));
const usdPerUnit = { USD: 1, BDT: 1 / 117 };

const oldPhoto = readFileSync(new URL("prior/old-photo-1.jpg", root));
async function seenOld(): Promise<SeenImage> {
  return { sha256: sha256(oldPhoto), dhash: await differenceHash(oldPhoto), partnerId: "partner-c", eventKey: "earlier-storm-2020", imageId: "old-photo-1" };
}
const factsOf = (pack: ProofPack) => Promise.all(pack.photos.map((p) => analyzePhoto(p, pack.serviceArea.utcOffsetMinutes)));
const failed = async (pack: ProofPack, seen: SeenImage[] = []) => runChecks(pack, await factsOf(pack), seen, usdPerUnit).filter((c) => !c.passed);

test("a resized, re-saved copy matches its original; a different picture does not", async () => {
  const original = await placeholderPhoto(11, "A");
  const copy = await sharp(original).resize(500).jpeg({ quality: 40 }).toBuffer();
  const other = await placeholderPhoto(23, "B");
  const [h, c, o] = await Promise.all([differenceHash(original), differenceHash(copy), differenceHash(other)]);
  assert.notEqual(sha256(original), sha256(copy));
  assert.ok(hashDistance(h, c) <= 8, `copy distance ${hashDistance(h, c)}`);
  assert.ok(hashDistance(h, o) > 8, `other distance ${hashDistance(h, o)}`);
  assert.equal(samePicture({ sha256: "x", dhash: h }, { sha256: "y", dhash: c }), true);
  assert.equal(samePicture({ sha256: "x", dhash: h }, { sha256: "y", dhash: o }), false);
});

test("photo times convert with the partner's clock, not this server's", () => {
  assert.equal(localExifTimeToUtc("2024:05:26 10:15:00", 360), "2024-05-26T04:15:00.000Z");
  assert.equal(localExifTimeToUtc("not a time", 360), null);
});

test("photo metadata is read: time, place and editing software", async () => {
  const bytes = await placeholderPhoto(11, "A", { takenLocal: "2024:05:26 10:15:00", lat: 22.49, lon: 89.6, software: "Adobe Photoshop 25" });
  const f = await analyzePhoto({ id: "p", bytes }, 360);
  assert.equal(f.takenAt, "2024-05-26T04:15:00.000Z");
  assert.ok(Math.abs(f.lat! - 22.49) < 0.01 && Math.abs(f.lon! - 89.6) < 0.01);
  assert.equal(f.software, "Adobe Photoshop 25");
});

test("an upload that isn't an image is reported, not a crash", async () => {
  const f = await analyzePhoto({ id: "bad", bytes: Buffer.from("not an image") }, 360);
  assert.equal(f.readable, false);
  const pack = packA();
  pack.photos[0].bytes = Buffer.from("not an image");
  assert.equal(verdictFrom(await failed(pack)), "partial");
});

test("the honest sample pack passes every code check", async () => {
  assert.deepEqual(await failed(packA()), []);
});

test("the recycled sample photo is caught even with a new timestamp and new bytes", async () => {
  const bad = await failed(packB(), [await seenOld()]);
  assert.equal(verdictFrom(bad), "human");
  assert.match(bad.find((c) => c.rule === "No photo was used before")!.actual, /photo-2 matches old-photo-1/);
});

type Change = (p: ProofPack) => void | Promise<void>;
const cases: [string, Change, "human" | "partial", RegExp][] = [
  ["a photo appearing twice", (p) => void (p.photos[1].bytes = p.photos[0].bytes), "human", /appears twice/],
  ["a photo from editing software", async (p) => void (p.photos[0].bytes = await placeholderPhoto(11, "x", { takenLocal: "2024:05:26 08:30:00", lat: 22.49, lon: 89.6, software: "Adobe Photoshop" })), "human", /editing software/],
  ["a photo taken after landfall", async (p) => void (p.photos[0].bytes = await placeholderPhoto(11, "x", { takenLocal: "2024:05:27 09:00:00", lat: 22.49, lon: 89.6 })), "human", /before landfall/],
  ["a photo taken before funds arrived", async (p) => void (p.photos[0].bytes = await placeholderPhoto(11, "x", { takenLocal: "2024:05:20 09:00:00", lat: 22.49, lon: 89.6 })), "human", /after funds arrived/],
  ["a photo taken far away", async (p) => void (p.photos[0].bytes = await placeholderPhoto(11, "x", { takenLocal: "2024:05:26 08:30:00", lat: 28.6, lon: 77.2 })), "human", /service area/],
  ["a photo with no timestamp", async (p) => void (p.photos[0].bytes = await placeholderPhoto(11, "x", { lat: 22.49, lon: 89.6 })), "partial", /timestamp/],
  ["a photo with no location", async (p) => void (p.photos[0].bytes = await placeholderPhoto(11, "x", { takenLocal: "2024:05:26 08:30:00" })), "partial", /location/],
  ["no photos at all", (p) => void (p.photos = []), "partial", /can be read/],
  ["a receipt number used twice", (p) => void (p.receipts[1].number = p.receipts[0].number), "human", /receipt appears twice/],
  ["a receipt dated after landfall", (p) => void (p.receipts[0].date = "2024-05-28"), "human", /Receipts dated/],
  ["a currency Levee can't convert", (p) => void (p.receipts[0].currency = "XXX"), "partial", /convert/],
  ["receipts covering too little", (p) => void (p.receipts[0].total = 1000), "partial", /account for/],
  ["receipts far above what was received", (p) => void (p.receipts[0].total = 390000), "partial", /account for/],
  ["handing out more than was bought", (p) => void (p.receipts[0].quantity = 10), "human", /more handed out/],
  ["handing out much less than was bought", (p) => void (p.distribution = p.distribution.slice(0, 20)), "partial", /Most of what/],
  ["a household listed twice", (p) => void (p.distribution[1].beneficiaryId = p.distribution[0].beneficiaryId), "partial", /listed twice/],
  ["no distribution list", (p) => void (p.distribution = []), "partial", /distribution list/],
  ["a handout dated after landfall", (p) => void (p.distribution[0].date = "2024-05-29"), "human", /Handouts dated/],
];
for (const [name, change, verdict, rule] of cases) {
  test(`${name} gives "${verdict}"`, async () => {
    const pack = packA();
    await change(pack);
    const bad = await failed(pack);
    assert.equal(verdictFrom(bad), verdict);
    assert.ok(bad.some((c) => rule.test(c.rule)), `failed: ${bad.map((c) => c.rule).join("; ")}`);
  });
}

// Fake Claude, with the honest answer unless a test changes it.
function fakeClient(response: object) {
  const requests: any[] = [];
  const client = { beta: { messages: { parse: async (params: unknown) => { requests.push(params); return { id: "msg_1", model: "claude-haiku-5-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, ...response }; } } } };
  return { requests, client: client as unknown as Anthropic };
}
const honest = (pack: ProofPack, over: object = {}) => ({
  parsed_output: {
    photos: pack.photos.map((p) => ({ id: p.id, showsClaimedActivity: "yes", looksEdited: false, note: "Fine." })),
    receipts: pack.receipts.map((r) => ({ id: r.id, readable: true, total: r.total, currency: r.currency, date: r.date })),
    consistency: "consistent",
    summary: "The proof supports the partner's account.",
    concerns: [],
    ...over,
  },
});
const verify = (pack: ProofPack, response: object, seen: SeenImage[] = []) => {
  const fake = fakeClient(response);
  return { ...fake, run: () => runVerifier(pack, { registry: memoryRegistry(seen), usdPerUnit, client: fake.client }) };
};

test("an honest pack with an honest review passes", async () => {
  const pack = packA();
  const r = await verify(pack, honest(pack)).run();
  assert.equal(r.verdict, "pass");
  assert.ok(r.checks.every((c) => c.passed));
  assert.equal(r.audit.llm?.messageId, "msg_1");
  assert.equal(r.audit.imagesSha256.length, 5);
});

test("a recycled photo goes to a person with no LLM call at all", async () => {
  const { run, requests } = verify(packB(), { parsed_output: null }, [await seenOld()]);
  const r = await run();
  assert.equal(r.verdict, "human");
  assert.equal(requests.length, 0);
  assert.equal(r.audit.llm, null);
  assert.match(r.summary, /photo-2 matches old-photo-1/);
});

const lowered: [string, (p: ProofPack) => object, "human" | "partial", RegExp][] = [
  ["a receipt image showing a different total", (p) => ({ receipts: [{ id: "receipt-1", readable: true, total: 9000, currency: "BDT", date: "2024-05-26" }, { id: "receipt-2", readable: true, total: 12000, currency: "BDT", date: "2024-05-26" }] }), "human", /match what the partner entered/],
  ["a receipt image showing a different date", (p) => ({ receipts: p.receipts.map((r, i) => ({ id: r.id, readable: true, total: r.total, currency: r.currency, date: i ? r.date : "2024-05-20" })) }), "human", /match what the partner entered/],
  ["a receipt image in another currency", (p) => ({ receipts: p.receipts.map((r, i) => ({ id: r.id, readable: true, total: r.total, currency: i ? r.currency : "USD", date: r.date })) }), "human", /match what the partner entered/],
  ["an unreadable receipt", (p) => ({ receipts: p.receipts.map((r, i) => ({ id: r.id, readable: i > 0, total: i ? r.total : null, currency: null, date: null })) }), "partial", /can be read/],
  ["a receipt Claude left out", (p) => ({ receipts: [{ id: "receipt-2", readable: true, total: 12000, currency: "BDT", date: "2024-05-26" }] }), "partial", /can be read/],
  ["a photo that looks edited", (p) => ({ photos: p.photos.map((x, i) => ({ id: x.id, showsClaimedActivity: "yes", looksEdited: i === 0, note: "x" })) }), "human", /looks edited/],
  ["a photo that doesn't show the activity", (p) => ({ photos: p.photos.map((x, i) => ({ id: x.id, showsClaimedActivity: i ? "yes" : "no", looksEdited: false, note: "x" })) }), "partial", /show the claimed activity/],
  ["an unclear photo", (p) => ({ photos: p.photos.map((x, i) => ({ id: x.id, showsClaimedActivity: i ? "yes" : "unclear", looksEdited: false, note: "x" })) }), "partial", /show the claimed activity/],
  ["minor issues overall", () => ({ consistency: "minor_issues" }), "partial", /hangs together/],
  ["serious concerns overall", () => ({ consistency: "serious_concerns" }), "human", /hangs together/],
];
for (const [name, over, verdict, rule] of lowered) {
  test(`${name} lowers the verdict to "${verdict}"`, async () => {
    const pack = packA();
    const r = await verify(pack, honest(pack, over(pack))).run();
    assert.equal(r.verdict, verdict);
    assert.ok(r.checks.some((c) => !c.passed && rule.test(c.rule)));
  });
}

test("Claude can't rescue a failed code check: a glowing review of an incomplete pack is still partial", async () => {
  const pack = packA();
  pack.distribution = pack.distribution.slice(0, 20);
  assert.equal((await verify(pack, honest(pack)).run()).verdict, "partial");
});

const failClosed: [string, (p: ProofPack) => object, RegExp][] = [
  ["a refusal", () => ({ stop_reason: "refusal", stop_details: { category: "bio" }, parsed_output: null }), /declined: bio/],
  ["running out of tokens", () => ({ stop_reason: "max_tokens", parsed_output: null }), /out of tokens/],
  ["an unparseable answer", () => ({ parsed_output: null }), /did not match/],
];
for (const [name, response, message] of failClosed) {
  test(`${name} gives no verdict, so tranche 2 can't reach the partner`, async () => {
    const pack = packA();
    await assert.rejects(verify(pack, response(pack)).run(), (e: unknown) => e instanceof VerifierError && message.test(e.message));
  });
}

for (const [name, evidence] of [["something invented", ["photo-99"]], ["nothing", []]] as const) {
  test(`a concern citing ${name} goes to a person instead of crashing the upload`, async () => {
    const pack = packA();
    const result = await verify(pack, honest(pack, { concerns: [{ text: "x", evidence: [...evidence] }] })).run();
    assert.equal(result.verdict, "partial");
    assert.ok(result.checks.some((c) => c.rule === "Every concern points to a photo or receipt" && !c.passed));
  });
}

test("only Levee's own sample data gets the placeholder instructions", async () => {
  const sample = packA();
  const { run, requests } = verify(sample, honest(sample));
  await run();
  assert.match(requests[0].system, /deliberately placeholders/);
  const real = { ...packA(), sample: false };
  const second = verify(real, honest(real));
  await second.run();
  assert.equal(second.requests[0].system.includes("deliberately placeholders"), false);
});

test("no household ids reach Claude or the public audit log", async () => {
  const pack = packA();
  const { run, requests } = verify(pack, honest(pack));
  const r = await run();
  assert.equal(JSON.stringify(buildInput(pack)).includes("MNG-"), false);
  assert.equal(JSON.stringify(requests[0].messages[0].content.filter((c: any) => c.type === "text")).includes("MNG-"), false);
  assert.equal(JSON.stringify(r).includes("MNG-"), false);
  assert.deepEqual(buildInput(pack).distributed, [{ item: "rice sack", quantity: 60, households: 60 }, { item: "tarpaulin", quantity: 40, households: 40 }]);
});

test("images are shrunk before sending, labelled, and the request is valid for current Claude", async () => {
  const pack = packA();
  pack.photos[0].bytes = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#336699" } }).jpeg().toBuffer();
  const { run, requests } = verify(pack, honest(pack));
  await run();
  const [r] = requests;
  const images = r.messages[0].content.filter((c: any) => c.type === "image");
  assert.equal(images.length, 5);
  const meta = await sharp(Buffer.from(images[0].source.data, "base64")).metadata();
  assert.equal(Math.max(meta.width!, meta.height!), 1024);
  assert.ok(r.messages[0].content.some((c: any) => c.type === "text" && c.text === "photo photo-1:"));
  assert.equal(r.temperature, undefined);
  assert.equal(r.tool_choice, undefined);
  assert.equal(r.model, "claude-haiku-5-5");
});

test("more than 10 images: only 10 are sent, and the verdict can't be pass", async () => {
  const pack = packA();
  for (let i = 0; i < 8; i++) pack.photos.push({ id: `extra-${i}`, caption: "x", bytes: await placeholderPhoto(100 + i * 17, "x", { takenLocal: "2024:05:26 12:00:00", lat: 22.49, lon: 89.6 }) });
  const { run, requests } = verify(pack, honest(pack));
  const r = await run();
  assert.equal(requests[0].messages[0].content.filter((c: any) => c.type === "image").length, 10);
  assert.equal(r.verdict, "partial");
  assert.match(r.checks.find((c) => c.rule === "Every image was reviewed")!.actual, /10 of 13/);
});

test("the registry stops one partner reusing another's accepted photo, but a re-run of the same pack is fine", async () => {
  const registry = memoryRegistry();
  const pack = packA();
  const run = (p: ProofPack) => runVerifier(p, { registry, usdPerUnit, client: fakeClient(honest(p)).client });
  assert.equal((await run(pack)).verdict, "pass");
  assert.equal((await run(pack)).verdict, "pass", "same partner, same event");
  const thief = { ...pack, partnerId: "partner-z" };
  const r = await run(thief);
  assert.equal(r.verdict, "human");
  assert.match(r.summary, /used before/);
});

test("a receipt image that won't decode reaches Claude's judgment as unread", async () => {
  const pack = packA();
  pack.receipts[0].image = Buffer.from("not an image");
  const { run, requests } = verify(pack, honest(pack, { receipts: [{ id: "receipt-1", readable: false, total: null, currency: null, date: null }, { id: "receipt-2", readable: true, total: 12000, currency: "BDT", date: "2024-05-26" }] }));
  assert.equal((await run()).verdict, "partial");
  assert.equal(requests[0].messages[0].content.filter((c: any) => c.type === "image").length, 4);
});

test("sample receipts render readable text", async () => {
  const bytes = await receiptImage({ number: "X-1", vendor: "V", date: "2024-05-26", item: "rice", quantity: 1, unit: 10, total: 10, currency: "BDT" });
  assert.ok((await sharp(bytes).metadata()).width === 800);
});
