"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PartnerEvents } from "@/app/api/responder/route";
import { Card, Label, Pill } from "@/components/app/ui";
import { parseCsv } from "@/lib/csv";
import { VERDICT } from "./LiveConsole";

/** What POST /api/proofs sends back: the Verifier's result (backend/agents/src/verifier/agent.ts). */
type Result = {
  verdict: keyof typeof VERDICT;
  summary: string;
  checks: { rule: string; required: string; actual: string; passed: boolean }[];
  concerns: { text: string }[];
};
type Photo = { key: string; file: File; caption: string; preview: string };
type Receipt = { key: string; file: File | null; number: string; vendor: string; date: string; item: string; quantity: string; total: string; currency: string };
type Row = { beneficiaryId: string; item: string; quantity: number; date: string; location: string };

const MAX_SIZE = 15 * 1024 * 1024;
const COLUMNS = ["beneficiaryid", "item", "quantity", "date", "location"];
const input = "h-10 w-full rounded-xl bg-paper px-3 text-[14px] text-ink ring-1 ring-inset ring-ice outline-none focus:bg-white focus:ring-2 focus:ring-blue";
const primary = "inline-flex h-12 items-center justify-center rounded-full bg-blue px-6 text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:cursor-not-allowed disabled:bg-ice disabled:text-[#7c93b0]";
const secondary = "inline-flex h-10 items-center rounded-full bg-ice-soft px-4 text-[14px] font-semibold text-link transition hover:bg-ice";
let nextKey = 0;
const key = () => String(++nextKey);

/** The file as base64, which is how /api/proofs takes images. */
const base64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** The distribution list, or a message saying what's wrong with it. */
function rowsFrom(text: string): Row[] | string {
  const rows = parseCsv(text);
  if (!rows.length) return "The list has no rows.";
  const missing = COLUMNS.filter((c) => !(c in rows[0]));
  if (missing.length) return `The list needs the columns beneficiaryId, item, quantity, date and location. Missing: ${missing.join(", ")}.`;
  const bad = rows.findIndex((r) => COLUMNS.some((c) => !r[c]) || !(Number(r.quantity) >= 0));
  if (bad >= 0) return `Row ${bad + 2} of the list is missing something, or its quantity isn't a number.`;
  return rows.map((r) => ({ beneficiaryId: r.beneficiaryid, item: r.item, quantity: Number(r.quantity), date: r.date, location: r.location }));
}

function Field({ id, label, value, onChange, type = "text" }: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-ink">
        {label}
      </label>
      <input id={id} type={type} step={type === "number" ? "any" : undefined} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  );
}

function ResultCard({ result, onReplace }: { result: Result; onReplace: () => void }) {
  const [tone, label] = VERDICT[result.verdict];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[24px] text-ink">
          Verifier <span className="accent">checks</span>
        </h2>
        <Pill tone={tone}>{label}</Pill>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-body">{result.summary}</p>
      <ul className="mt-3 divide-y divide-ice">
        {result.checks.map((c) => (
          <li key={c.rule} className="flex items-start gap-3 py-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${c.passed ? "bg-[#2fbf71]" : "bg-[#d93025]"}`}>{c.passed ? "✓" : "!"}</span>
            <div>
              <p className="text-[15px] font-semibold text-ink">{c.rule}</p>
              <p className="text-[14px] leading-snug text-[#5f6b7a]">
                Needed {c.required}, found {c.actual}.
              </p>
            </div>
          </li>
        ))}
      </ul>
      {result.concerns.map((c) => (
        <p key={c.text} className="mt-2 rounded-2xl bg-[#fde8e6] p-3 text-[14px] text-[#a8261b]">
          {c.text}
        </p>
      ))}
      <p className="mt-4 text-[15px] leading-relaxed text-body">
        {result.verdict === "pass" ? "Tranche 2 reaches you when it's paid." : "Ops will review this set before tranche 2 reaches you."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/responder" className="inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087]">
          Back to your console
        </Link>
        <button type="button" onClick={onReplace} className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice">
          Replace this proof
        </button>
      </div>
    </Card>
  );
}

/** A logged-in approved responder's proof for one storm, sent to the Verifier through POST /api/proofs. */
export default function LiveProof({ storms }: { storms: PartnerEvents }) {
  const open = storms.filter((s) => s.proofOpen);
  const [eventKey, setEventKey] = useState(open[0]?.eventKey ?? "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [rows, setRows] = useState<{ name: string; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // /responder/proof?event=… opens on that storm.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("event");
    if (asked && open.some((s) => s.eventKey === asked)) setEventKey(asked);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, []);

  if (!open.length)
    return (
      <Card>
        <h2 className="font-display text-[26px] text-ink">
          No proof is due <span className="accent">yet</span>
        </h2>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-body">Proof opens once landfall is confirmed, for a storm where you were paid tranche 1. It will appear here then.</p>
        <Link href="/responder" className={`${secondary} mt-5`}>
          Back to your console
        </Link>
      </Card>
    );
  if (result) return <ResultCard result={result} onReplace={() => setResult(null)} />;

  const tooBig = (files: File[]) => {
    const kept = files.filter((f) => f.size <= MAX_SIZE);
    setError(kept.length < files.length ? "Files over 15 MB were left out." : null);
    return kept;
  };
  const addPhotos = (list: FileList | null) =>
    setPhotos((p) => [...p, ...tooBig([...(list ?? [])]).map((file) => ({ key: key(), file, caption: "", preview: URL.createObjectURL(file) }))]);
  const setReceipt = (k: string, field: keyof Receipt) => (value: string | File | null) => setReceipts((list) => list.map((r) => (r.key === k ? { ...r, [field]: value } : r)));
  const readList = async (file: File | undefined) => {
    if (!file) return;
    const parsed = rowsFrom(await file.text());
    setError(typeof parsed === "string" ? parsed : null);
    setRows(typeof parsed === "string" ? null : { name: file.name, rows: parsed });
  };

  const ready = rows && (photos.length || receipts.length);
  const send = async () => {
    if (receipts.some((r) => !r.file)) return setError("Add the image for every receipt.");
    setBusy(true);
    setError(null);
    try {
      const body = {
        eventKey,
        photos: await Promise.all(photos.map(async (p, i) => ({ id: `photo-${i + 1}`, caption: p.caption, bytes: await base64(p.file) }))),
        receipts: await Promise.all(
          receipts.map(async (r, i) => ({ id: `receipt-${i + 1}`, number: r.number, vendor: r.vendor, date: r.date, item: r.item, quantity: Number(r.quantity), total: Number(r.total), currency: r.currency.toUpperCase(), image: await base64(r.file!) })),
        ),
        distribution: rows!.rows,
      };
      const res = await fetch("/api/proofs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setResult(data);
      else setError(res.status < 500 && typeof data.error === "string" ? data.error : "The Verifier couldn't check this set right now. Try again later.");
    } catch {
      setError("Couldn't send your proof. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-4">
        <Card>
          <label htmlFor="proof-storm" className="block">
            <Label>Proof for</Label>
          </label>
          <select id="proof-storm" value={eventKey} onChange={(e) => setEventKey(e.target.value)} className={`${input} mt-3`}>
            {open.map((s) => (
              <option key={s.eventKey} value={s.eventKey}>
                {s.name}
              </option>
            ))}
          </select>
        </Card>
        <Card>
          <Label>The Verifier checks</Label>
          <ul className="mt-3 space-y-2 text-[14px] text-body">
            {["Counts match the amounts paid", "Dates fall in the storm window", "No duplicate or edited images", "Photos were taken in your service area"].map((c) => (
              <li key={c} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-[#5f6b7a]">Amounts, dates and your service area come from Levee&apos;s records, not from this form. Beneficiaries are ids only: leave names out of the list.</p>
        </Card>
      </div>

      <Card>
        <Label>Distribution list</Label>
        <p className="mt-2 text-[14px] text-body">A CSV with the columns beneficiaryId, item, quantity, date and location.</p>
        <input type="file" accept=".csv,text/csv" aria-label="Choose the distribution list" onChange={(e) => readList(e.target.files?.[0])} className="mt-3 block text-[14px] text-body" />
        {rows && (
          <p className="mt-2 text-[13px] text-[#1b7a48]">
            {rows.name}: {rows.rows.length} rows, {new Set(rows.rows.map((r) => r.beneficiaryId)).size} households.
          </p>
        )}

        <Label className="mt-6">Photos</Label>
        <input type="file" accept="image/*" multiple aria-label="Choose photos" onChange={(e) => addPhotos(e.target.files)} className="mt-3 block text-[14px] text-body" />
        {photos.length > 0 && (
          <ul className="mt-3 space-y-2">
            {photos.map((p) => (
              <li key={p.key} className="flex items-center gap-3 rounded-xl bg-paper p-2 ring-1 ring-inset ring-ice">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing for next/image to optimise */}
                <img src={p.preview} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                <input
                  aria-label={`Caption for ${p.file.name}`}
                  placeholder="What it shows"
                  value={p.caption}
                  onChange={(e) => setPhotos((list) => list.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))}
                  className={input}
                />
                <button type="button" onClick={() => {
                    URL.revokeObjectURL(p.preview);
                    setPhotos((list) => list.filter((x) => x.key !== p.key));
                  }} aria-label={`Remove ${p.file.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5f6b7a] hover:bg-ice">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <Label className="mt-6">Receipts</Label>
        <div className="mt-3 space-y-3">
          {receipts.map((r, i) => {
            const id = (f: string) => `receipt-${r.key}-${f}`;
            return (
              <fieldset key={r.key} className="rounded-2xl bg-paper p-3 ring-1 ring-inset ring-ice">
                <legend className="sr-only">Receipt {i + 1}</legend>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink">Receipt {i + 1}</p>
                  <button type="button" onClick={() => setReceipts((list) => list.filter((x) => x.key !== r.key))} className="text-[13px] font-semibold text-link hover:underline">
                    Remove
                  </button>
                </div>
                <input type="file" accept="image/*" aria-label={`Image of receipt ${i + 1}`} onChange={(e) => setReceipt(r.key, "file")(tooBig([...(e.target.files ?? [])])[0] ?? null)} className="mt-2 block text-[14px] text-body" />
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Field id={id("number")} label="Receipt number" value={r.number} onChange={setReceipt(r.key, "number")} />
                  <Field id={id("vendor")} label="Vendor" value={r.vendor} onChange={setReceipt(r.key, "vendor")} />
                  <Field id={id("date")} label="Date" type="date" value={r.date} onChange={setReceipt(r.key, "date")} />
                  <Field id={id("item")} label="Item" value={r.item} onChange={setReceipt(r.key, "item")} />
                  <Field id={id("quantity")} label="Quantity" type="number" value={r.quantity} onChange={setReceipt(r.key, "quantity")} />
                  <Field id={id("total")} label="Total" type="number" value={r.total} onChange={setReceipt(r.key, "total")} />
                  <Field id={id("currency")} label="Currency" value={r.currency} onChange={setReceipt(r.key, "currency")} />
                </div>
              </fieldset>
            );
          })}
          <button type="button" onClick={() => setReceipts((list) => [...list, { key: key(), file: null, number: "", vendor: "", date: "", item: "", quantity: "", total: "", currency: "USD" }])} className={secondary}>
            Add a receipt
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[14px] font-medium text-[#a8261b]">
            {error}
          </p>
        )}
        <button type="button" onClick={send} disabled={!ready || busy} className={`${primary} mt-5 w-full`}>
          {busy ? "Checking your proof" : "Send to the Verifier"}
        </button>
        {!ready && <p className="mt-2 text-center text-[13px] text-[#5f6b7a]">Add the distribution list and at least one photo or receipt.</p>}
      </Card>
    </div>
  );
}
