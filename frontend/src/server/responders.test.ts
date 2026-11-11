// Ops reviewing responders, on a fake Supabase: no keys, no network. Run: node --test src/server/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Organisation } from "./accounts.ts";
import { fakeSupabase } from "./fakeSupabase.ts";
import { createResponders } from "./responders.ts";

const A = "1a2b3c4d-0000-4000-8000-00000000000a";
const B = "1a2b3c4d-0000-4000-8000-00000000000b";
const DONOR = "1a2b3c4d-0000-4000-8000-00000000000d";
const ORG: Organisation = { region: "US Gulf Coast", actions: ["Food and water"], households: 1200, payoutEmail: "payouts@gulfrelief.org", status: "pending_review" };
const AREA = { area: { name: "Perry, FL", lat: 30.12, lon: -83.58 }, radiusKm: 150, capacityUsd: 2000, utcOffsetMinutes: -240 };

function setup() {
  const db = fakeSupabase(undefined, {}, { [A]: "ops@gulfrelief.org", [B]: "hello@bayoucare.org" });
  db.tables.levee_profiles = [
    { seq: 1, user_id: A, role: "responder", name: "Gulf Relief", donor_id: null, pledge: null, organisation: ORG, created_at: "2026-11-08T10:00:00Z" },
    { seq: 2, user_id: DONOR, role: "donor", name: "Ana", donor_id: DONOR, pledge: { amount: 10, cap: 60, timing: "early" }, organisation: null, created_at: "2026-11-08T10:30:00Z" },
    { seq: 3, user_id: B, role: "responder", name: "Bayou Care", donor_id: null, pledge: null, organisation: ORG, created_at: "2026-11-08T11:00:00Z" },
  ];
  const audit: unknown[] = [];
  const responders = createResponders(db.client, async (e) => void audit.push(e), () => new Date("2026-11-08T12:00:00Z"));
  return { db, audit, responders };
}
const failsWith = async (work: Promise<unknown>, status: number, message: RegExp) =>
  assert.rejects(work, (err: { status?: number; message: string }) => err.status === status && message.test(err.message));

test("ops see every responder, oldest first, with the email it logs in with, and no donors", async () => {
  const { responders } = setup();
  assert.deepEqual(
    (await responders.list()).map((r) => [r.name, r.email, r.organisation.status]),
    [
      ["Gulf Relief", "ops@gulfrelief.org", "pending_review"],
      ["Bayou Care", "hello@bayoucare.org", "pending_review"],
    ],
  );
  assert.deepEqual(await responders.approvedPartners(), [], "nobody is paid before approval");
});

test("approving checks the partner details, saves them, logs it publicly, and makes it a partner", async () => {
  const { responders, audit } = setup();
  const approve = (partner: object) => responders.decide(A, { decision: "approve", partner }, "lead@levee.org");
  await failsWith(approve({ ...AREA, area: { ...AREA.area, name: " " } }), 400, /place/);
  await failsWith(approve({ ...AREA, area: { ...AREA.area, lat: 91 } }), 400, /Latitude/);
  await failsWith(approve({ ...AREA, area: { ...AREA.area, lon: "" } }), 400, /Longitude/);
  await failsWith(approve({ ...AREA, radiusKm: 0 }), 400, /radius/);
  await failsWith(approve({ ...AREA, capacityUsd: -5 }), 400, /Capacity/);
  await failsWith(approve({ ...AREA, utcOffsetMinutes: 900 }), 400, /time zone/);
  assert.equal(audit.length, 0);

  const decided = await approve(AREA);
  assert.deepEqual(decided.organisation, { ...ORG, status: "approved", partner: AREA, review: { by: "lead@levee.org", at: "2026-11-08T12:00:00.000Z" } });
  assert.deepEqual(audit, [{ kind: "responder_review", at: "2026-11-08T12:00:00.000Z", responder: "Gulf Relief", decision: "approved" }], "the public log doesn't name the ops person");
  assert.deepEqual(await responders.approvedPartners(), [
    {
      id: A,
      name: "Gulf Relief",
      regionId: "us-gulf-coast",
      area: AREA.area,
      earlyActions: ["Food and water"],
      households: 1200,
      capacityUsd: 2000,
      committedUsd: 0,
      email: "payouts@gulfrelief.org",
      radiusKm: 150,
      utcOffsetMinutes: -240,
    },
  ]);
});

test("rejecting needs a reason, and replaces an earlier approval", async () => {
  const { responders, audit } = setup();
  await responders.decide(B, { decision: "approve", partner: AREA }, "lead@levee.org");
  await failsWith(responders.decide(B, { decision: "reject", reason: "  " }, "lead@levee.org"), 400, /reason/);
  const decided = await responders.decide(B, { decision: "reject", reason: "We couldn't verify your registration." }, "lead@levee.org");
  assert.equal(decided.organisation.status, "rejected");
  assert.equal(decided.organisation.partner, undefined, "a rejected responder keeps no payment details");
  assert.equal((audit[1] as { reason: string }).reason, "We couldn't verify your registration.");
  assert.deepEqual(await responders.approvedPartners(), []);
});

test("only a responder that exists can be decided", async () => {
  const { responders } = setup();
  await failsWith(responders.decide(DONOR, { decision: "approve", partner: AREA }, "lead@levee.org"), 404, /No responder/);
  await failsWith(responders.decide("not-a-uuid", { decision: "approve", partner: AREA }, "lead@levee.org"), 404, /No responder/);
  await failsWith(responders.decide(A, { decision: "maybe" } as never, "lead@levee.org"), 400, /approve or reject/);
});
