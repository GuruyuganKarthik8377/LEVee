"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Label, Pill } from "@/components/app/ui";

/** What GET /api/ops/responders sends: src/server/responders.ts. */
type Responder = {
  userId: string;
  name: string;
  email: string | null;
  createdAt: string;
  organisation: {
    region: string;
    actions: string[];
    households: number;
    payoutEmail: string;
    status: "pending_review" | "approved" | "rejected";
    partner?: { area: { name: string; lat: number; lon: number }; radiusKm: number; capacityUsd: number; utcOffsetMinutes: number };
    review?: { by: string; at: string; reason?: string };
  };
};

type Load = { state: "loading" } | { state: "out" } | { state: "off"; message: string } | { state: "ready"; list: Responder[] };

const primary = "inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:opacity-60";
const secondary = "inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice disabled:opacity-60";
const input = "h-10 w-full rounded-xl bg-paper px-3 text-[14px] text-ink ring-1 ring-inset ring-ice outline-none focus:bg-white focus:ring-2 focus:ring-blue";
const STATUS = { pending_review: ["gold", "Waiting for review"], approved: ["green", "Approved"], rejected: ["red", "Rejected"] } as const;

async function post(userId: string, body: unknown) {
  const res = await fetch(`/api/ops/responders/${userId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status < 500 && typeof data.error === "string" ? data.error : "Something went wrong. Try again.");
}

function Field({ id, label, value, onChange, type = "text", step }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; step?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-ink">
        {label}
      </label>
      <input id={id} type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  );
}

function ResponderCard({ r, onDecided }: { r: Responder; onDecided: () => void }) {
  const o = r.organisation;
  const p = o.partner;
  const [f, setF] = useState({
    place: p?.area.name ?? "",
    lat: p ? String(p.area.lat) : "",
    lon: p ? String(p.area.lon) : "",
    radius: String(p?.radiusKm ?? 150),
    capacity: p ? String(p.capacityUsd) : "",
    utc: String((p?.utcOffsetMinutes ?? -300) / 60),
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const id = (k: string) => `${r.userId}-${k}`;

  const decide = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await post(r.userId, body);
      onDecided();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const approve = () =>
    decide({
      decision: "approve",
      partner: { area: { name: f.place, lat: Number(f.lat), lon: Number(f.lon) }, radiusKm: Number(f.radius), capacityUsd: Number(f.capacity), utcOffsetMinutes: Math.round(Number(f.utc) * 60) },
    });

  const [tone, label] = STATUS[o.status];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={tone}>{label}</Pill>
        <Pill tone="sky">{o.region}</Pill>
      </div>
      <h3 className="font-display mt-3 text-[24px] text-ink">{r.name}</h3>
      <p className="mt-1 text-[14px] text-body">
        Logs in as {r.email ?? "an unknown email"}. Paid at {o.payoutEmail}. Reaches {o.households.toLocaleString("en-US")} households per storm.
      </p>
      <p className="mt-1 text-[14px] text-body">Early actions: {o.actions.join(", ")}.</p>
      {o.review && (
        <p className="mt-2 text-[13px] text-[#5f6b7a]">
          Decided by {o.review.by} on {new Date(o.review.at).toLocaleString("en-US")}
          {o.review.reason ? `: ${o.review.reason}` : "."}
        </p>
      )}

      <Label className="mt-5">What Levee pays it by</Label>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field id={id("place")} label="Place it serves" value={f.place} onChange={set("place")} />
        </div>
        <Field id={id("lat")} label="Latitude" type="number" step="any" value={f.lat} onChange={set("lat")} />
        <Field id={id("lon")} label="Longitude" type="number" step="any" value={f.lon} onChange={set("lon")} />
        <Field id={id("radius")} label="Radius (km)" type="number" value={f.radius} onChange={set("radius")} />
        <Field id={id("capacity")} label="Capacity per storm ($)" type="number" value={f.capacity} onChange={set("capacity")} />
        <Field id={id("utc")} label="Time zone (UTC hours)" type="number" step="0.5" value={f.utc} onChange={set("utc")} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={approve} className={primary}>
          {o.status === "approved" ? "Save changes" : "Approve"}
        </button>
      </div>

      <div className="mt-5">
        <label htmlFor={id("reason")} className="mb-1 block text-[12px] font-semibold text-ink">
          Or reject, with a reason the responder will see
        </label>
        <textarea id={id("reason")} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} h-auto py-2`} />
        <button type="button" disabled={busy} onClick={() => decide({ decision: "reject", reason })} className={`${secondary} mt-2`}>
          Reject
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[14px] font-medium text-[#d92d20]">
          {error}
        </p>
      )}
    </Card>
  );
}

/** Responders that signed up, for a logged-in ops person to approve or reject. */
export default function ResponderReview() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/ops/responders", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (res.status === 401) setLoad({ state: "out" });
        else if (!res.ok) setLoad({ state: "off", message: res.status === 503 && typeof data.error === "string" ? data.error : "Couldn't load the responders. Try again." });
        else setLoad({ state: "ready", list: data });
      })
      .catch(() => live && setLoad({ state: "off", message: "Couldn't reach LEVee. Check your connection and try again." }));
    return () => {
      live = false;
    };
  }, [tick]);

  const waiting = load.state === "ready" ? load.list.filter((r) => r.organisation.status === "pending_review").length : 0;
  return (
    <section className="mb-10 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[26px] text-ink">
          Responders to <span className="accent">review</span>
        </h2>
        {load.state === "ready" && <Pill tone={waiting ? "gold" : "green"}>{waiting ? `${waiting} waiting` : "All reviewed"}</Pill>}
      </div>
      {load.state === "loading" && <p className="text-[15px] text-body">Loading…</p>}
      {load.state === "out" && (
        <Card>
          <p className="text-[15px] text-body">
            Only ops can review responders.{" "}
            <Link href="/login" className="font-semibold text-link hover:underline">
              Log in with your ops account
            </Link>
            .
          </p>
        </Card>
      )}
      {load.state === "off" && (
        <Card>
          <p className="text-[15px] text-body">{load.message}</p>
        </Card>
      )}
      {load.state === "ready" && !load.list.length && (
        <Card>
          <p className="text-[15px] text-body">No responder has signed up yet.</p>
        </Card>
      )}
      {load.state === "ready" && load.list.map((r) => <ResponderCard key={`${r.userId}-${r.organisation.review?.at ?? ""}`} r={r} onDecided={() => setTick((t) => t + 1)} />)}
    </section>
  );
}
