"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Label, Pill, type Tone } from "@/components/app/ui";
import { RULES } from "@/lib/rules";
import type { LiveBrief } from "@/server/liveBrief";

export type { LiveBrief };

const STEPS = ["Reading GDACS's advisories for this storm", "Comparing how the forecast track has moved", "Checking river readings and news", "Writing the brief, with a source for every claim"];

const AGREE: Record<string, { label: string; tone: Tone }> = {
  agree: { label: "Sources agree", tone: "green" },
  mixed: { label: "Sources mixed", tone: "gold" },
  conflict: { label: "Sources conflict", tone: "red" },
  insufficient: { label: "Too little evidence", tone: "grey" },
};

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
};

/** A storm's live brief: the one already written, and asking Sentinel for one. */
export function useLiveBrief(stormId: number) {
  const [brief, setBrief] = useState<LiveBrief | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBrief(null);
    setError(null);
    fetch(`/api/storms/${stormId}/brief`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { brief: LiveBrief | null } | null) => live && data?.brief && setBrief(data.brief))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [stormId]);

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      const res = await fetch(`/api/storms/${stormId}/brief`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { brief?: LiveBrief; error?: string };
      if (res.ok && data.brief) setBrief(data.brief);
      else setError(data.error && res.status < 500 ? data.error : data.error ?? "Sentinel couldn't finish just now. Please try again.");
    } catch {
      setError("Couldn't reach LEVee. Check your connection and try again.");
    }
    setAsking(false);
  };

  return { brief, asking, error, ask };
}

function Thinking() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-4 rounded-2xl bg-ice-soft p-4" role="status">
      <p className="flex items-center gap-2.5 text-[14px] font-semibold text-link">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ice border-t-blue" aria-hidden />
        Sentinel is reading the live data
      </p>
      <ol className="mt-3 space-y-1.5 text-[13px]">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 transition-colors ${i < step ? "text-[#1b7a48]" : i === step ? "font-semibold text-ink" : "text-[#8c9bae]"}`}>
            <span aria-hidden className="w-4 text-center">{i < step ? "✓" : i === step ? "•" : ""}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Each source id becomes a link to what it cites: the GDACS report, an advisory's geometry, a river's data, a news story. */
function Sources({ sources }: { sources: { id: string; label: string; url: string }[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noreferrer" title={s.label} className="max-w-[220px] truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-link ring-1 ring-inset ring-ice hover:bg-ice-soft">
          {s.label}
        </a>
      ))}
    </span>
  );
}

/** Sentinel's Threat Brief for a real, current storm, written on request by the AI from live GDACS data. */
export function SentinelBriefPanel({ brief, asking, error, ask }: ReturnType<typeof useLiveBrief>) {
  const b = brief?.brief;
  const passes = b ? b.confidence >= RULES.minConfidence : false;
  const cited = b ? new Set([...b.reasons, ...b.exposed].flatMap((r) => r.sources.map((s) => s.id))).size : 0;

  return (
    <div className="mt-5 rounded-[24px] bg-paper p-5 ring-1 ring-inset ring-ice">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[22px] text-ink">
          Sentinel&apos;s <span className="accent">Threat Brief</span>
        </h3>
      </div>

      {!b && !asking && (
        <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-body">
          Sentinel reads this storm&apos;s live GDACS advisories, river readings and news, then judges how sure we can be of a damaging landfall, citing a source for every claim. It takes about half a minute.
        </p>
      )}

      <AnimatePresence mode="wait">
        {asking ? (
          <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Thinking />
          </motion.div>
        ) : b ? (
          <motion.div key={brief!.at} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mt-4 grid gap-5 md:grid-cols-[200px_1fr]">
              <div>
                <Label>Confidence</Label>
                <p className="font-display mt-1 text-[48px] leading-none text-ink">{b.confidence}</p>
                <div className="relative mt-3 h-2.5 rounded-full bg-ice">
                  <motion.div className={`h-full rounded-full ${passes ? "bg-[#2fbf71]" : "bg-blue"}`} initial={{ width: 0 }} animate={{ width: `${b.confidence}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} />
                  <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-ink" style={{ left: `${RULES.minConfidence}%` }} aria-hidden />
                </div>
                <p className="mt-1.5 text-[12px] font-semibold text-[#5f6b7a]">LEVee&apos;s rule needs {RULES.minConfidence}</p>
                <div className="mt-3">
                  <Pill tone={AGREE[b.sourcesAgree]?.tone ?? "grey"}>{AGREE[b.sourcesAgree]?.label ?? b.sourcesAgree}</Pill>
                </div>
              </div>

              <div className="min-w-0">
                <p className="text-[16px] font-semibold leading-snug text-ink">{b.summary}</p>
                <p className="mt-1.5 text-[13px] text-[#5f6b7a]">
                  {b.landfall
                    ? `Forecast landfall on a LEVee coast in about ${Math.round(b.landfall.leadHours)} hours, worked out by code from the track.`
                    : "No forecast landfall on a LEVee coast, worked out by code from the track."}
                </p>

                <Label className="mt-4">Why</Label>
                <ul className="mt-2 space-y-2.5">
                  {b.reasons.map((r) => (
                    <li key={r.text} className="text-[14px] leading-snug text-body">
                      {r.text}
                      <Sources sources={r.sources} />
                    </li>
                  ))}
                </ul>

                {b.exposed.length > 0 && (
                  <>
                    <Label className="mt-4">Most exposed</Label>
                    <ul className="mt-2 space-y-2.5">
                      {b.exposed.map((e) => (
                        <li key={e.place} className="text-[14px] leading-snug text-body">
                          <span className="font-semibold text-ink">{e.place}:</span> {e.why}
                          <Sources sources={e.sources} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {b.caveats.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-ice pt-3 text-[12px] leading-snug text-[#5f6b7a]">
                    {b.caveats.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ice pt-3">
              <p className="text-[12px] text-[#5f6b7a]">
                Sentinel&apos;s read of GDACS advisory {brief!.advisory}, {ago(brief!.at)} · {cited} {cited === 1 ? "source" : "sources"} cited
              </p>
              <button type="button" onClick={() => void ask()} className="text-[13px] font-semibold text-link hover:underline">
                Check for a newer advisory
              </button>
            </div>
            <details className="mt-2 text-[12px] text-[#5f6b7a]">
              <summary className="cursor-pointer font-semibold text-link">How this brief was made</summary>
              <p className="mt-1.5 leading-relaxed">
                Sentinel is an AI agent on Claude Haiku. It read the latest GDACS advisories for this storm, with river readings and news where there were any, and
                had to cite a source for every claim. Lead time is worked out by code, never by the AI. This brief used{" "}
                {(brief!.usage.inputTokens + brief!.usage.outputTokens).toLocaleString("en-US")} tokens and cost ${brief!.costUsd.toFixed(4)}. It is kept for
                this advisory, so everyone sees the same one. It is also on the{" "}
                <a href="/audit" className="font-semibold text-link hover:underline">
                  audit log
                </a>
                .
              </p>
            </details>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!b && !asking && (
        <button
          type="button"
          onClick={() => void ask()}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-blue px-6 text-[15px] font-semibold text-white transition hover:bg-[#003087]"
        >
          Ask Sentinel about this storm
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[14px] font-medium text-[#a8261b]">
          {error}
        </p>
      )}
      <p className="mt-3 text-[12px] text-[#5f6b7a]">Reading a storm never moves money. Only the hourly check, with every rule met, can.</p>
    </div>
  );
}
