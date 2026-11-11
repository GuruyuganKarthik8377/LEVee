"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Card, Label, Pill, ReplayHeader } from "@/components/app/ui";
import { jumpToProofWindow, submitProof, useDemo, type SubmittedProof } from "@/lib/demoStore";
import { guessKind, hashFile, KIND_LABEL, verify } from "@/lib/verifier";
import { DEMO_CHECKS, DEMO_PROOFS, PARTNERS, type PartnerId, type ProofCheck, type ProofFile } from "@/fixtures/helene";
import { usePartnerStorms } from "./LiveConsole";
import LiveProof from "./LiveProof";
import ProofArt from "./ProofArt";

const MB = 1024 * 1024;
const MAX_SIZE = 15 * MB;
const ACCEPT = "image/*,.pdf,.csv,.xls,.xlsx,.tsv";

const VERDICT = {
  pass: { title: "Verifier pass", body: "Tranche 2 is on its way to this partner.", tone: "green" as const },
  partial: { title: "Partial pass", body: "Something is missing, so ops will review this set before any money moves.", tone: "gold" as const },
  human: { title: "Sent to a human", body: "Tranche 2 stays locked until ops reviews this set.", tone: "red" as const },
};

function Mark({ state }: { state: ProofCheck["state"] }) {
  const style = state === "pass" ? "bg-[#2fbf71] text-white" : state === "fail" ? "bg-[#d93025] text-white" : "bg-ice text-[#5f6b7a]";
  return <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${style}`}>{state === "pass" ? "✓" : state === "fail" ? "!" : "?"}</span>;
}

function Result({ proof, onReplace }: { proof: SubmittedProof; onReplace: () => void }) {
  const verdict = VERDICT[proof.verdict];
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= proof.checks.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 420);
    return () => clearTimeout(id);
  }, [shown, proof.checks.length]);

  const finished = shown >= proof.checks.length;
  const flagged = proof.files.filter((f) => f.flagged);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[24px] text-ink">
          Verifier <span className="accent">checks</span>
        </h2>
        {finished && <Pill tone={verdict.tone}>{verdict.title}</Pill>}
      </div>
      <ul className="mt-3 divide-y divide-ice" aria-live="polite">
        {proof.checks.slice(0, shown).map((c) => (
          <motion.li key={c.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-3 py-3">
            <Mark state={c.state} />
            <div>
              <p className="text-[15px] font-semibold text-ink">{c.label}</p>
              <p className="text-[14px] leading-snug text-[#5f6b7a]">{c.note}</p>
            </div>
          </motion.li>
        ))}
      </ul>
      {!finished && <p className="mt-3 text-[14px] font-medium text-link">Checking the next item</p>}
      {finished && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {flagged.map((f) => (
            <div key={f.id} className="mt-4 rounded-2xl bg-[#fde8e6] p-4">
              <p className="text-[14px] font-semibold text-[#a8261b]">{f.flagged}</p>
              {f.art && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <figure>
                    <ProofArt art={f.art} className="w-full rounded-xl" />
                    <figcaption className="mt-1 text-[12px] text-[#7d2a22]">Uploaded for this replay</figcaption>
                  </figure>
                  <figure>
                    <ProofArt art={f.art} className="w-full rounded-xl" />
                    <figcaption className="mt-1 text-[12px] text-[#7d2a22]">Filed with an earlier storm</figcaption>
                  </figure>
                </div>
              )}
            </div>
          ))}
          <p className="mt-4 text-[15px] leading-relaxed text-body">{verdict.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={proof.verdict === "pass" ? "/responder" : "/ops"} className="inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087]">
              {proof.verdict === "pass" ? "See the payout" : "Open the ops review"}
            </Link>
            <button type="button" onClick={onReplace} className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice">
              Replace this proof
            </button>
          </div>
        </motion.div>
      )}
    </Card>
  );
}

/** A logged-in approved responder sends real proof; everyone else gets the Helene sandbox. */
export default function ProofUpload() {
  const storms = usePartnerStorms();
  if (storms === undefined) return <p className="text-[15px] text-body">Loading…</p>;
  return storms ? <LiveProof storms={storms} /> : (
    <>
      <ReplayHeader />
      <HeleneProof />
    </>
  );
}

function HeleneProof() {
  const demo = useDemo();
  const [partner, setPartner] = useState<PartnerId>("a");
  const [drafts, setDrafts] = useState<Partial<Record<PartnerId, ProofFile[]>>>({});
  const [usingDemo, setUsingDemo] = useState<Partial<Record<PartnerId, boolean>>>({});
  const [replacing, setReplacing] = useState<Partial<Record<PartnerId, boolean>>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const files = drafts[partner] ?? [];
  const submitted = replacing[partner] ? undefined : demo.proofs[partner];
  const windowOpen = demo.clock >= 0;

  const setFiles = (next: ProofFile[], isDemo = false) => {
    setDrafts((d) => ({ ...d, [partner]: next }));
    setUsingDemo((u) => ({ ...u, [partner]: isDemo }));
  };

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const accepted = [...list].filter((f) => f.size <= MAX_SIZE);
    if (accepted.length < list.length) setError("Files over 15 MB were left out.");
    setBusy(true);
    try {
      const added = await Promise.all(
        accepted.map(async (file, i): Promise<ProofFile> => {
          const id = `${Date.now()}-${i}`;
          if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            setPreviews((p) => ({ ...p, [id]: url }));
          }
          return { id, name: file.name, kind: guessKind(file), size: file.size, hash: await hashFile(file) };
        }),
      );
      setFiles([...(usingDemo[partner] ? [] : files), ...added]);
    } catch {
      setError("One of those files could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => setFiles(files.filter((f) => f.id !== id), usingDemo[partner]);

  const send = () => {
    const other = partner === "a" ? "b" : "a";
    const earlier = (demo.proofs[other]?.files ?? []).map((f) => f.hash);
    if (usingDemo[partner]) submitProof(partner, { files, checks: DEMO_CHECKS[partner], verdict: partner === "a" ? "pass" : "human" });
    else submitProof(partner, verify(files, earlier));
    setReplacing((r) => ({ ...r, [partner]: false }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <div className="space-y-4">
        <Card>
          <Label>Uploading as</Label>
          <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="Partner">
            {(Object.keys(PARTNERS) as PartnerId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={partner === id}
                onClick={() => setPartner(id)}
                className={`rounded-2xl p-4 text-left transition ${partner === id ? "bg-blue text-white" : "bg-paper text-ink ring-1 ring-inset ring-ice hover:bg-ice-soft"}`}
              >
                <span className="block text-[15px] font-semibold">{PARTNERS[id].label}</span>
                <span className="block text-[13px] opacity-80">{PARTNERS[id].org}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-body">
            <span className="font-semibold text-ink">The plan: </span>
            {PARTNERS[partner].plan}.
          </p>
        </Card>
        <Card>
          <Label>The Verifier checks</Label>
          <ul className="mt-3 space-y-2 text-[14px] text-body">
            {["Counts match the amounts paid", "Dates fall before landfall", "No duplicate or edited images", "Locations fit the plan"].map((c) => (
              <li key={c} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-relaxed text-[#5f6b7a]">
            Sandbox: your files stay in this browser. The duplicate check runs here for real, and the other checks need the live Verifier.
          </p>
        </Card>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!windowOpen ? (
          <motion.div key="closed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <h2 className="font-display text-[26px] text-ink">
                The proof window opens after <span className="accent">landfall</span>
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-body">The replay is still before landfall. You can keep watching, or jump ahead to the proof window.</p>
              <Label className="mt-6">Have these ready</Label>
              <ul className="mt-3 space-y-2">
                {[
                  ["Distribution list", "Who received what, as a CSV"],
                  ["Photos", "From the shelters and the handouts"],
                  ["Receipts", "For everything bought with tranche 1"],
                ].map(([title, note]) => (
                  <li key={title} className="rounded-xl bg-paper px-3.5 py-2.5 ring-1 ring-inset ring-ice">
                    <p className="text-[14px] font-semibold text-ink">{title}</p>
                    <p className="text-[13px] text-[#5f6b7a]">{note}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={jumpToProofWindow} className="inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087]">
                  Jump to the proof window
                </button>
                <Link href="/replay/helene" className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice">
                  Back to the replay
                </Link>
              </div>
            </Card>
          </motion.div>
        ) : submitted ? (
          <motion.div key={`result-${partner}-${submitted.at}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Result proof={submitted} onReplace={() => setReplacing((r) => ({ ...r, [partner]: true }))} />
          </motion.div>
        ) : (
          <motion.div key={`form-${partner}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  add(e.dataTransfer.files);
                }}
                className={`flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition ${dragging ? "border-blue bg-ice" : "border-ice-line bg-paper hover:bg-ice-soft"}`}
              >
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-link" aria-hidden>
                  <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="mt-3 text-[16px] font-semibold text-ink">Drop files here, or browse</span>
                <span className="mt-1 text-[13px] text-[#5f6b7a]">Photos, PDF receipts and CSV lists, up to 15 MB each</span>
              </button>
              <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => add(e.target.files)} aria-label="Choose proof files" />
              <button type="button" onClick={() => setFiles(DEMO_PROOFS[partner], true)} className="mt-3 text-[14px] font-semibold text-link hover:underline">
                Use the {PARTNERS[partner].label} demo set
              </button>
              {error && (
                <p role="alert" className="mt-2 text-[14px] font-medium text-[#a8261b]">
                  {error}
                </p>
              )}

              {files.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl bg-paper p-2 pr-3 ring-1 ring-inset ring-ice">
                      {f.art ? (
                        <ProofArt art={f.art} className="h-10 w-14 shrink-0 rounded-lg" />
                      ) : previews[f.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing for next/image to optimise
                        <img src={previews[f.id]} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg bg-ice text-[11px] font-semibold uppercase text-link">{f.name.split(".").pop()}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-ink">{f.name}</p>
                        <p className="text-[12px] text-[#5f6b7a]">
                          {KIND_LABEL[f.kind]} · {f.size >= MB ? `${(f.size / MB).toFixed(1)} MB` : `${Math.ceil(f.size / 1024)} KB`}
                        </p>
                      </div>
                      <button type="button" onClick={() => remove(f.id)} aria-label={`Remove ${f.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-[#5f6b7a] transition hover:bg-ice hover:text-ink">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={send}
                disabled={!files.length || busy}
                className="mt-5 flex h-12 w-full items-center justify-center rounded-full bg-blue text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:cursor-not-allowed disabled:bg-ice disabled:text-[#7c93b0]"
              >
                {busy ? "Reading files" : "Send to the Verifier"}
              </button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
