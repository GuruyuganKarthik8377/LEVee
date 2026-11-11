// The Supabase store behaves like the JSON file, checked against a fake Supabase client: no keys, no network.
// Run: node --test src/server/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LedgerRow } from "../../../backend/payments/src/types.ts";
import { newRun } from "../lib/liveSession.ts";
import { fakeSupabase } from "./fakeSupabase.ts";
import { fileStore } from "./store.ts";
import { supabaseSessions, supabaseStore } from "./supabaseStore.ts";

const row = (paypalId: string, status = "COMPLETED"): LedgerRow => ({ kind: "charge", ref: "pledge-1", paypalId, status, at: "2026-11-08T12:00:00Z" });

const stores = {
  "JSON file": () => fileStore(join(mkdtempSync(join(tmpdir(), "levee-store-")), "store.json")),
  Supabase: () => supabaseStore(fakeSupabase().client),
};

for (const [name, make] of Object.entries(stores)) {
  test(`${name}: the key-value table`, async () => {
    const { kv } = make();
    assert.equal(await kv.get("missing"), undefined);
    const value = { a: 1, nested: { b: [1, 2] } };
    await kv.set("event:one", value);
    value.nested.b.push(3);
    assert.deepEqual(await kv.get("event:one"), { a: 1, nested: { b: [1, 2] } }, "a stored value can't be changed by holding on to it");
    await kv.set("event:two", 2);
    await kv.set("session:x", null);
    assert.equal(await kv.get("session:x"), null);
    await kv.set("event:one", "changed");
    assert.deepEqual(await kv.list("event:"), ["changed", 2], "keys keep the order they were first written");
    await kv.set("run:a_b:x", "literal");
    await kv.set("run:aXb:x", "other");
    assert.deepEqual(await kv.list("run:a_b:"), ["literal"], "a prefix is matched literally");
  });

  test(`${name}: the ledger ignores a repeated PayPal event`, async () => {
    const { ledger, readLedger } = make();
    await ledger.record(row("CAP-1"));
    await ledger.record(row("CAP-1"));
    await ledger.record(row("CAP-1", "REFUNDED"));
    await ledger.record(row("CAP-2"));
    assert.deepEqual((await readLedger()).map((r) => `${r.paypalId} ${r.status}`), ["CAP-1 COMPLETED", "CAP-1 REFUNDED", "CAP-2 COMPLETED"]);
  });
}

test("Supabase: long lists are read a page at a time, the audit log is kept, and a failure throws", async () => {
  const fake = fakeSupabase();
  const store = supabaseStore(fake.client);
  for (let i = 0; i < 2_500; i++) await store.kv.set(`p:${i}`, i);
  const listed = await store.kv.list<number>("p:");
  assert.equal(listed.length, 2_500);
  assert.equal(listed.at(-1), 2_499);
  for (let i = 0; i < 1_200; i++) await store.ledger.record(row(`CAP-${i}`));
  assert.equal((await store.readLedger()).length, 1_200);
  await store.audit({ decision: "fired" });
  assert.deepEqual(fake.tables.levee_audit.map((r) => r.entry), [{ decision: "fired" }]);

  const broken = supabaseStore(fakeSupabase("levee_ledger").client);
  await assert.rejects(broken.ledger.record(row("CAP-1")), /Supabase: connection refused/);
});

test("Supabase: /run's sessions, one row per browser", async () => {
  const sessions = supabaseSessions(fakeSupabase().client);
  assert.equal(await sessions.load("0b9f3c1e-2d4a-4f6b-8c7d-9e0a1b2c3d4e"), undefined);
  const a = { id: "0b9f3c1e-2d4a-4f6b-8c7d-9e0a1b2c3d4e", gifts: [], run: newRun(), activity: [] };
  await sessions.save([a]);
  await sessions.save([{ ...a, activity: [{ tone: "rule" as const, title: "saved", detail: "", at: "x" }] }]);
  assert.equal((await sessions.load(a.id))?.activity[0].title, "saved");
});
