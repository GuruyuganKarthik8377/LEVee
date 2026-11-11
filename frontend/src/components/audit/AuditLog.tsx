"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BriefSummary } from "@/server/liveBrief";
import { AnimatePresence, motion } from "motion/react";
import { Card, Label, Pill, type Tone } from "@/components/app/ui";
import { useDemo } from "@/lib/demoStore";
import { auditLog, dateText, usd, funds, whenText, type AuditActor, type AuditEntry } from "@/lib/ledger";

const GROUPS: { id: string; label: string; actors: AuditActor[] }[] = [
  { id: "all", label: "Everything", actors: [] },
  { id: "ai", label: "AI agents", actors: ["Sentinel", "Allocator", "Verifier", "Narrator"] },
  { id: "rules", label: "Policy Engine", actors: ["Policy Engine"] },
  { id: "people", label: "Ops", actors: ["Ops"] },
  { id: "paypal", label: "PayPal", actors: ["PayPal webhook"] },
];

const ACTOR_TONE: Record<AuditActor, Tone> = {
  Sentinel: "sky",
  Allocator: "sky",
  Verifier: "sky",
  Narrator: "sky",
  "Policy Engine": "navy",
  Ops: "gold",
  "PayPal webhook": "blue",
};

const ACTOR_DOT: Record<AuditActor, string> = {
  Sentinel: "bg-sky-strong",
  Allocator: "bg-sky-strong",
  Verifier: "bg-sky-strong",
  Narrator: "bg-sky-strong",
  "Policy Engine": "bg-navy",
  Ops: "bg-gold",
  "PayPal webhook": "bg-blue",
};

const AGENTS: AuditActor[] = ["Sentinel", "Allocator", "Verifier", "Narrator"];

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
};

/** Real decisions, not the replay: Sentinel's latest brief on each storm someone asked about on the Storms page. */
function LiveDecisions() {
  const [briefs, setBriefs] = useState<BriefSummary[] | null>(null);
  useEffect(() => {
    fetch("/api/storms/briefs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then(setBriefs)
      .catch(() => setBriefs([]));
  }, []);
  if (!briefs?.length) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[24px] text-ink">
          Live from today&apos;s <span className="accent">storms</span>
        </h2>
        <Link href="/live" className="text-[14px] font-semibold text-link hover:underline">
          Open the storm map
        </Link>
      </div>
      <p className="mt-1 text-[14px] text-body">Sentinel&apos;s real briefs on current storms, written when someone asked. Reading a storm never moves money.</p>
      <ul className="mt-3 divide-y divide-ice">
        {briefs.map((b) => (
          <li key={b.eventId} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-ink">
                {b.name}: confidence {b.confidence}
              </p>
              <span className="text-[12px] text-[#5f6b7a]">{ago(b.at)}</span>
            </div>
            <p className="mt-0.5 text-[14px] leading-snug text-body">{b.summary}</p>
            <p className="mt-1 text-[12px] text-[#5f6b7a]">
              Sentinel on Claude Haiku · GDACS advisory {b.advisory} · {b.cited} {b.cited === 1 ? "source" : "sources"} cited · {b.tokens.toLocaleString("en-US")} tokens · $
              {b.costUsd.toFixed(4)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const hoursText = (at: number) => (Math.abs(at) < 0.01 ? "Landfall" : `${Number(Math.abs(at).toFixed(1))}h ${at < 0 ? "before" : "after"}`);

function Entry({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative md:grid md:grid-cols-[104px_1fr] md:gap-9">
      {/* on wider screens the time sits on a rail beside the card */}
      <div className="hidden pt-5 text-right md:block">
        <p className="text-[15px] font-semibold text-ink">{hoursText(entry.at)}</p>
        <p className="text-[12px] text-[#5f6b7a]">{dateText(entry.at)}</p>
      </div>
      <span className={`absolute left-[116px] top-6 hidden h-3.5 w-3.5 rounded-full ring-4 ring-paper md:block ${ACTOR_DOT[entry.actor]}`} aria-hidden />
      <Card pad="p-0">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-4 rounded-[24px] p-4 text-left transition hover:bg-ice-soft/50 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={ACTOR_TONE[entry.actor]}>{entry.actor}</Pill>
              <span className="text-[12px] font-medium text-[#5f6b7a] md:hidden">
                {whenText(entry.at)} · {dateText(entry.at)}
              </span>
            </div>
            <p className="mt-2 text-[16px] font-semibold text-ink">{entry.title}</p>
            <p className="text-[14px] leading-snug text-body">{entry.output}</p>
          </div>
          <svg viewBox="0 0 20 20" className={`mt-1 h-5 w-5 shrink-0 text-link transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid gap-5 border-t border-ice p-4 sm:p-5 md:grid-cols-2">
                <div>
                  <Label>Inputs</Label>
                  <dl className="mt-2 divide-y divide-ice text-[14px]">
                    {entry.inputs.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 py-1.5">
                        <dt className="text-[#5f6b7a]">{k}</dt>
                        <dd className="text-right font-semibold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <Label>Reasoning</Label>
                  <p className="mt-2 text-[14px] leading-relaxed text-body">{entry.reasoning}</p>
                  {AGENTS.includes(entry.actor) && (
                    <p className="mt-3 rounded-xl bg-ice-soft px-3 py-2 text-[13px] leading-snug text-body">
                      Made by {entry.actor}, an AI agent on Claude Haiku, recorded from the Helene run. It advises: only the Policy Engine&apos;s fixed rules move money.
                    </p>
                  )}
                  {entry.ref && (
                    <>
                      <Label className="mt-4">PayPal reference</Label>
                      <p className="mt-1 font-mono text-[13px] text-link">{entry.ref}</p>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </li>
  );
}

export default function AuditLog() {
  const demo = useDemo();
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const log = useMemo(() => auditLog(demo), [demo]);
  const money = funds(demo);

  const actors = GROUPS.find((g) => g.id === group)?.actors ?? [];
  const needle = query.trim().toLowerCase();
  const visible = log.filter(
    (e) => (!actors.length || actors.includes(e.actor)) && (!needle || `${e.actor} ${e.title} ${e.output} ${e.reasoning}`.toLowerCase().includes(needle)),
  );

  const tiles = [
    { label: "Decisions logged", value: String(log.length) },
    { label: "Made by AI", value: String(log.filter((e) => GROUPS[1].actors.includes(e.actor)).length) },
    { label: "Moved money", value: String(log.filter((e) => e.actor === "Policy Engine" && e.ref).length) },
    { label: "Paid to partners", value: usd(money.paid) },
  ];

  return (
    <div className="space-y-6">
      <LiveDecisions />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} pad="p-5">
            <Label>{t.label}</Label>
            <p className="font-display mt-2 text-[clamp(28px,3vw,38px)] leading-none text-ink">{t.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by who decided">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={group === g.id}
              onClick={() => setGroup(g.id)}
              className={`h-10 rounded-full px-4 text-[14px] font-semibold transition ${group === g.id ? "bg-blue text-white" : "bg-white text-link ring-1 ring-inset ring-ice hover:bg-ice-soft"}`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <label htmlFor="audit-search" className="sr-only">
          Search the log
        </label>
        <input
          id="audit-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the log"
          className="h-10 w-full rounded-full bg-white px-4 text-[14px] text-ink outline-none ring-1 ring-inset ring-ice placeholder:text-[#8c9bae] focus:ring-2 focus:ring-blue sm:w-56"
        />
      </div>

      {visible.length ? (
        <ol className="relative space-y-3 md:before:absolute md:before:bottom-6 md:before:left-[122px] md:before:top-6 md:before:w-0.5 md:before:bg-ice">
          {visible.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </ol>
      ) : (
        <Card>
          <p className="font-display text-[22px] text-ink">Nothing matches that</p>
          <p className="mt-1 text-[15px] text-body">Try another filter, or run the replay further.</p>
        </Card>
      )}

      <p className="text-[12px] text-[#5f6b7a]">Replay entries from Hurricane Helene, newest first, in the PayPal sandbox.</p>
    </div>
  );
}
