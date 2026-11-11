import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeveePartner } from "../../../backend/agents/src/levee.ts";
import { US_GULF_HURRICANE } from "../../../backend/policy/src/playbook.ts";
import type { Organisation, PartnerDetails } from "./accounts.ts";
import { RequestError } from "./http.ts";
import { check } from "./supabaseStore.ts";

/**
 * Responders who signed up, as ops review them: approving one adds what Levee needs to pay it (service area, capacity,
 * time zone) and makes it a partner for real storms. Every decision goes on the public audit log.
 */

type Row = { user_id: string; name: string; organisation: Organisation; created_at: string };
export type ResponderForReview = { userId: string; name: string; email: string | null; organisation: Organisation; createdAt: string };
export type Decision = { decision: "approve"; partner: Partial<PartnerDetails> } | { decision: "reject"; reason: string };

// The one region sign-up offers, and the playbook it's paid under.
const REGION_IDS: Record<string, string> = { "US Gulf Coast": US_GULF_HURRICANE.regionId };

const bad = (message: string, status = 400) => new RequestError(message, status);

function within(value: unknown, min: number, max: number, message: string) {
  const n = Number(value);
  if (typeof value === "boolean" || value === null || value === "" || !Number.isFinite(n) || n < min || n > max) throw bad(message);
  return n;
}

function checkPartner(p: Partial<PartnerDetails> | undefined): PartnerDetails {
  const name = typeof p?.area?.name === "string" ? p.area.name.trim() : "";
  if (!name || name.length > 100) throw bad("Name the place the responder serves.");
  return {
    area: { name, lat: within(p?.area?.lat, -90, 90, "Latitude must be between -90 and 90."), lon: within(p?.area?.lon, -180, 180, "Longitude must be between -180 and 180.") },
    radiusKm: within(p?.radiusKm, 1, 1000, "The service radius must be between 1 and 1,000 km."),
    capacityUsd: within(p?.capacityUsd, 1, 1_000_000, "Capacity per storm must be between $1 and $1,000,000."),
    utcOffsetMinutes: Math.round(within(p?.utcOffsetMinutes, -720, 840, "The time zone must be between UTC-12 and UTC+14.")),
  };
}

export function createResponders(db: SupabaseClient, audit: (entry: unknown) => Promise<void>, now = () => new Date()) {
  // ponytail: reads every responder and filters here. Fine for hundreds; filter on organisation->>status in SQL past that.
  const all = async () =>
    check(await db.from("levee_profiles").select("user_id,name,organisation,created_at").eq("role", "responder").order("created_at")) as Row[];

  return {
    /** Every responder, oldest first, with the email they log in with. */
    async list(): Promise<ResponderForReview[]> {
      return Promise.all(
        (await all()).map(async (r) => {
          const { data } = await db.auth.admin.getUserById(r.user_id);
          return { userId: r.user_id, name: r.name, email: data.user?.email ?? null, organisation: r.organisation, createdAt: r.created_at };
        }),
      );
    },

    /** Approves a responder with its partner details, or rejects it with a reason. A later decision replaces an earlier one. */
    async decide(userId: string, input: Decision, by: string) {
      if (!/^[0-9a-f-]{36}$/.test(userId)) throw bad("No responder with that id.", 404);
      const row = check(await db.from("levee_profiles").select("user_id,name,organisation,created_at").eq("user_id", userId).eq("role", "responder").maybeSingle<Row>());
      if (!row) throw bad("No responder with that id.", 404);
      const at = now().toISOString();
      // A new decision starts from what the responder sent, not from an earlier decision.
      const organisation: Organisation = { ...row.organisation };
      delete organisation.partner;
      delete organisation.review;
      let next: Organisation;
      if (input?.decision === "approve") {
        if (!REGION_IDS[organisation.region]) throw bad(`Levee doesn't pay responders in ${organisation.region} yet.`);
        next = { ...organisation, status: "approved", partner: checkPartner(input.partner), review: { by, at } };
      } else if (input?.decision === "reject") {
        const reason = typeof input.reason === "string" ? input.reason.trim() : "";
        if (!reason || reason.length > 500) throw bad("Give the responder a reason, in up to 500 characters.");
        next = { ...organisation, status: "rejected", review: { by, at, reason } };
      } else throw bad("decision must be approve or reject");

      check(await db.from("levee_profiles").update({ organisation: next }).eq("user_id", userId));
      // The public log names the organisation and the decision, not the person who made it.
      await audit({ kind: "responder_review", at, responder: row.name, decision: next.status, ...(next.review?.reason && { reason: next.review.reason }) });
      return { userId, name: row.name, organisation: next };
    },

    /** Approved responders as partners for real storms, paid at their PayPal email. */
    async approvedPartners(): Promise<LeveePartner[]> {
      return (await all())
        .filter((r) => r.organisation.status === "approved" && r.organisation.partner && REGION_IDS[r.organisation.region])
        .map(({ user_id, name, organisation: o }) => ({
          id: user_id,
          name,
          regionId: REGION_IDS[o.region],
          area: o.partner!.area,
          earlyActions: o.actions,
          households: o.households,
          capacityUsd: o.partner!.capacityUsd,
          committedUsd: 0, // Levee adds what it has already promised on other storms (agents/src/levee/tick.ts).
          email: o.payoutEmail,
          radiusKm: o.partner!.radiusKm,
          utcOffsetMinutes: o.partner!.utcOffsetMinutes,
        }));
    },
  };
}

export type Responders = ReturnType<typeof createResponders>;
