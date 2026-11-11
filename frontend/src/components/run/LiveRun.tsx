"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Card, Label, Pill, type Tone } from "@/components/app/ui";
import PayPalSaveButton from "@/components/pledge/PayPalSaveButton";
import AskNarrator from "./AskNarrator";
import NoticeCard from "@/components/donor/NoticeCard";
import ImpactReceipt from "@/components/donor/ImpactReceipt";
import { dollars, giftCharges } from "@/lib/rules";
import type { Action, Activity, AiMode, Payout, RunStage } from "@/lib/liveStore";
import type { LiveView } from "@/app/api/live/route";
import { useAccount } from "@/lib/account";

const primary = "inline-flex h-11 items-center justify-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087] disabled:cursor-wait disabled:opacity-60";
const secondary = "inline-flex h-11 items-center justify-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice disabled:opacity-60";

const TONE: Record<Activity["tone"], { label: string; tone: Tone }> = {
  paypal: { label: "PayPal", tone: "blue" },
  rule: { label: "Rules", tone: "grey" },
  person: { label: "Person", tone: "gold" },
  error: { label: "Problem", tone: "red" },
  ai: { label: "Agent", tone: "sky" },
};

const usdAi = (usd: number) => `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3)}`;

/** The live agents' calls in one place, for anyone who wants to see what ran, how long it took and what it cost. */
function HowDecided({ run }: { run: LiveView["run"] }) {
  if (run.ai !== "live" || !run.aiSteps?.length) return null;
  return (
    <details className="mt-4 rounded-[20px] bg-white p-4 text-[14px] ring-1 ring-ice md:p-5">
      <summary className="cursor-pointer font-semibold text-link">How this run was decided</summary>
      <p className="mt-2 leading-relaxed text-body">
        Sentinel and the Allocator are AI agents on Claude Haiku. They advise, and the Policy Engine&apos;s fixed rules decide whether and where money moves.
      </p>
      <ul className="mt-3 divide-y divide-ice">
        {run.aiSteps.map((s, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
            <span>
              <span className="font-semibold text-ink">{s.agent}</span> <span className="text-body">{s.decided}</span>
            </span>
            <span className="text-[13px] text-[#5f6b7a]">
              {(s.ms / 1000).toFixed(1)} s · {usdAi(s.costUsd)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-[#5f6b7a]">In all: {usdAi(run.aiCostUsd ?? 0)} of Claude for this run.</p>
    </details>
  );
}

/** Saved results or live AI, chosen before the storm is triggered. */
function AiSwitch({ value, onChange, disabled }: { value: AiMode; onChange: (mode: AiMode) => void; disabled: boolean }) {
  const options: { mode: AiMode; title: string; detail: string }[] = [
    { mode: "saved", title: "Replay it as it happened", detail: "The recorded Helene run: the same reading of the storm, and the same split, every time." },
    { mode: "live", title: "Let LEVee decide again, now", detail: "Sentinel reads Helene's forecasts afresh and the Allocator proposes the split. The rules still decide. About half a minute." },
  ];
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How to replay Helene">
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={value === o.mode}
          disabled={disabled}
          onClick={() => onChange(o.mode)}
          className={`rounded-2xl p-3 text-left transition ${value === o.mode ? "bg-ice-soft ring-2 ring-blue" : "bg-white ring-1 ring-inset ring-ice hover:bg-paper"}`}
        >
          <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <span aria-hidden className={`grid h-4 w-4 place-items-center rounded-full ring-2 ${value === o.mode ? "ring-blue" : "ring-ice-line"}`}>
              {value === o.mode && <span className="h-2 w-2 rounded-full bg-blue" />}
            </span>
            {o.title}
          </span>
          <span className="mt-1 block text-[13px] leading-snug text-[#5f6b7a]">{o.detail}</span>
        </button>
      ))}
    </div>
  );
}

const ORDER: RunStage[] = ["idle", "notice", "t1_paid", "proof", "t2_paid", "done"];

function PayoutStatus({ payout }: { payout?: Payout }) {
  if (!payout) return null;
  const label = (p: "a" | "b") => (p === "a" ? "Partner A" : "Partner B");
  return (
    <ul className="mt-3 space-y-1.5 text-[14px]">
      {payout.items.map((i) => (
        <li key={i.partner} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2 ring-1 ring-inset ring-ice">
          <span className="font-semibold text-ink">
            {label(i.partner)} {dollars(i.cents)}
          </span>
          <Pill tone={i.status === "SUCCESS" ? "green" : i.status && i.status !== "PENDING" ? "red" : "gold"}>{i.status ?? payout.status ?? "Sending"}</Pill>
        </li>
      ))}
      {payout.batchId && <li className="break-all text-[12px] text-[#5f6b7a]">PayPal batch {payout.batchId}</li>}
    </ul>
  );
}

function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "now" | "later"; children?: React.ReactNode }) {
  return (
    <li className={`relative flex gap-4 ${state === "later" ? "opacity-50" : ""}`}>
      <span aria-hidden className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold ${state === "done" ? "bg-[#1b7a48] text-white" : state === "now" ? "bg-blue text-white" : "bg-white text-link ring-2 ring-inset ring-ice"}`}>
        {state === "done" ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 rounded-[20px] bg-white p-4 ring-1 ring-ice md:p-5">
        <h2 className="font-display text-[20px] leading-snug text-ink">{title}</h2>
        {state !== "later" && children && <div className="mt-1.5 text-[15px] leading-relaxed text-body">{children}</div>}
      </div>
    </li>
  );
}

export default function LiveRun() {
  const [data, setData] = useState<LiveView | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [amount, setAmount] = useState(10);
  const [failed, setFailed] = useState(false);
  // A logged-in donor saves with their account's terms, which the server reads itself.
  const account = useAccount();
  const terms = account?.role === "donor" ? account.pledge : undefined;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) throw new Error("unavailable");
      setData((await res.json()) as LiveView);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep asking PayPal while a batch is still settling.
  const payouts = [data?.run.t1?.payout, data?.run.t2?.payout, data?.run.t2?.release].filter(Boolean) as Payout[];
  const settling = payouts.some((p) => p.status !== "DENIED" && (p.status !== "SUCCESS" || p.items.some((i) => !i.status || i.status === "PENDING")));
  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [settling, load]);

  const [aiMode, setAiMode] = useState<AiMode>("saved");

  const act = async (action: Action, ai?: AiMode) => {
    setBusy(action);
    try {
      const res = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(ai && { ai }) }) });
      if (res.ok) setData((await res.json()) as LiveView);
      else setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(null);
  };

  if (!data) return <Card>{failed ? "We couldn't reach the server. Please reload." : "Loading the live demo…"}</Card>;

  const { run, pledge, reserveCents, activity, configured } = data;
  const at = ORDER.indexOf(run.stage === "skipped" ? "done" : run.stage);
  const state = (stage: RunStage) => {
    const i = ORDER.indexOf(stage);
    return at > i ? "done" : at === i ? "now" : "later";
  };
  const [first, second] = giftCharges(pledge?.amountCents ?? 1000);
  const ready = !!pledge || reserveCents > 0;
  const waits = pledge?.timing === "confirmed";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div>
        {!configured && (
          <Card className="mb-5">
            <Pill tone="gold">PayPal isn&apos;t connected</Pill>
            <p className="mt-2 text-[15px] text-body">Add the sandbox keys to <code className="font-mono">.env.local</code> to run this with real sandbox payments.</p>
          </Card>
        )}

        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Card pad="p-5">
            <Label>Your pledge</Label>
            {pledge ? (
              <>
                <p className="font-display mt-1 text-[26px] leading-tight text-ink">{dollars(pledge.amountCents)} per hurricane</p>
                <p className="text-[13px] text-[#5f6b7a]">
                  {dollars(pledge.chargedCents)} used of your {dollars(pledge.capCents)} yearly cap
                </p>
                {waits && <p className="text-[13px] text-[#5f6b7a]">Only once landfall is confirmed</p>}
              </>
            ) : (
              <p className="font-display mt-1 text-[26px] leading-tight text-ink">Not saved yet</p>
            )}
          </Card>
          <Card pad="p-5">
            <Label>The Reserve holds</Label>
            <p className="font-display mt-1 text-[26px] leading-tight text-ink">{dollars(reserveCents)}</p>
            <Link href="/give" className="text-[13px] font-semibold text-link hover:underline">
              Give to the Reserve
            </Link>
          </Card>
        </div>

        <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-0.5 before:bg-ice">
          <Step n={1} title="Save your PayPal account, or give to the Reserve" state={ready ? "done" : "now"}>
            {pledge ? (
              <p>PayPal has your account saved. It&apos;s only charged when a storm meets the rules, and you hear first.</p>
            ) : (
              <>
                {terms ? (
                  <p>
                    Your account&apos;s pledge: {dollars(terms.amount * 100)} per hurricane, up to {dollars(terms.cap * 100)} a year, {terms.timing === "confirmed" ? "only once landfall is confirmed" : "early tranche on"}. Approve it in PayPal&apos;s own window. You can use a sandbox personal account.
                  </p>
                ) : (
                  <>
                    <p>Choose a pledge, then approve it in PayPal&apos;s own window. You can use a sandbox personal account.</p>
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pledge per hurricane">
                      {[10, 25, 50].map((v) => (
                        <button key={v} type="button" aria-pressed={amount === v} onClick={() => setAmount(v)} className={`h-10 rounded-full px-4 text-[14px] font-semibold transition ${amount === v ? "bg-blue text-white" : "bg-ice-soft text-link hover:bg-ice"}`}>
                          ${v} per hurricane
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-3">
                  <PayPalSaveButton saving={false} requireLive {...(!terms && { pledge: { amount, cap: amount * 6 } })} onSaved={() => void load()} />
                </div>
              </>
            )}
          </Step>

          <Step n={2} title="A storm meets the fixed rules" state={!ready ? "later" : state("idle")}>
            {run.stage === "idle" ? (
              <>
                {run.belowLine ? (
                  <div className="rounded-2xl bg-[#fff7e0] p-4 text-ink ring-1 ring-inset ring-[#ffe08a]" role="status">
                    <p className="font-semibold">
                      Sentinel scored Helene {run.belowLine.confidence} this time. The rule needs 70, so no money moved.
                    </p>
                    <p className="mt-1 text-[14px] text-body">{run.belowLine.summary}</p>
                    <p className="mt-1 text-[13px] text-[#5f6b7a]">That&apos;s the rules doing their job: Sentinel advises, and fixed rules decide. Ask again, or carry on with the recorded run.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={primary} disabled={!!busy} onClick={() => act("fire", "live")}>
                        {busy === "fire" ? "Sentinel is reading Helene…" : "Ask Sentinel again"}
                      </button>
                      <button type="button" className={secondary} disabled={!!busy} onClick={() => act("fire", "saved")}>
                        Replay it as it happened
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>Replay Hurricane Helene&apos;s advisory 6, when the rules first passed: Orange alert, landfall forecast in 53 hours, and Sentinel confidence of 70.</p>
                    <AiSwitch value={aiMode} onChange={setAiMode} disabled={!!busy} />
                    <button type="button" className={`${primary} mt-3`} disabled={!!busy} onClick={() => act("fire", aiMode)}>
                      {busy === "fire" ? (aiMode === "live" ? "Sentinel is reading Helene's forecasts. Up to a minute…" : "Checking…") : "Trigger Hurricane Helene"}
                    </button>
                  </>
                )}
              </>
            ) : run.ai === "live" ? (
              <p>
                {run.advisory && run.advisory > 6
                  ? `Sentinel held back until advisory ${run.advisory}, when the forecasts agreed enough. Then all three rules passed, and the Allocator proposed the split.`
                  : "All three rules passed. Sentinel read Helene's forecasts again just now, and the Allocator proposed the split."}{" "}
                Their reasons are in the activity.
              </p>
            ) : (
              <p>All three rules passed, as they did in the recorded Helene run.</p>
            )}
          </Step>

          <Step n={3} title="PayPal charges you, then pays responders" state={run.stage === "skipped" ? "done" : state("notice")}>
            {run.stage === "notice" ? (
              <>
                {pledge ? (
                  <>
                    <p>Before any charge, your notice arrives. This is it, as it lands on your phone:</p>
                    <div className="mt-3 max-w-[420px]">
                      <NoticeCard text={activity.find((x) => (x.kind ?? (x.title === "Notice sent to you" ? "notice" : undefined)) === "notice")?.detail} amountCents={first.chargedCents} onSkip={() => void act("skip")} skipping={busy === "skip"} />
                    </div>
                    <p className="mt-3">
                      About {dollars(first.netCents)} reaches responders after PayPal&apos;s fee. The real window is 60 minutes, so here you close it yourself.
                    </p>
                  </>
                ) : (
                  <p>The Reserve&apos;s share goes straight to the partners.</p>
                )}
                {reserveCents > 0 && <p className="mt-1">The Reserve adds half its balance, {dollars(Math.min(Math.floor(reserveCents / 2), 50_000))}.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={primary} disabled={!!busy} onClick={() => act("charge1")}>
                    {busy === "charge1" ? "Talking to PayPal…" : pledge ? "Close the window and charge" : "Send the Reserve's share"}
                  </button>
                  {pledge && (
                    <button type="button" className={secondary} disabled={!!busy} onClick={() => act("skip")}>
                      Skip this storm
                    </button>
                  )}
                </div>
              </>
            ) : run.stage === "skipped" ? (
              <p>You skipped, so PayPal charged nothing.</p>
            ) : (
              run.t1 && (
                <>
                  {!run.t1.charge && waits && <p>You chose to give only once landfall is confirmed, so nothing was charged to you.</p>}
                  {run.t1.charge && (
                    <p>
                      PayPal charged {dollars(run.t1.charge.grossCents)} and kept {dollars(run.t1.charge.feeCents)}. Reference <span className="break-all font-mono text-[13px]">{run.t1.charge.captureId}</span>
                    </p>
                  )}
                  {run.t1.reserveCents > 0 && <p>The Reserve added {dollars(run.t1.reserveCents)}.</p>}
                  <PayoutStatus payout={run.t1.payout} />
                  {run.t1.match && (
                    <div className="mt-4 rounded-2xl bg-ice-soft p-4">
                      <p className="font-semibold text-ink">
                        {run.t1.match.sponsor} matched it: {dollars(run.t1.match.cents)} more
                      </p>
                      <p className="text-[14px]">
                        PayPal invoice {run.t1.match.invoiceNumber ?? run.t1.match.invoiceId} {run.t1.match.paid ? "paid by bank transfer" : "sent"}
                        {run.t1.match.payout ? ", and the match went straight on to the partners." : "."}
                      </p>
                      <PayoutStatus payout={run.t1.match.payout} />
                    </div>
                  )}
                </>
              )
            )}
          </Step>

          <Step n={4} title="The storm lands, and partners send proof" state={state("t1_paid")}>
            {run.stage === "t1_paid" ? (
              <>
                <p>
                  A person confirms landfall from the National Hurricane Center, then the Verifier checks each partner&apos;s proof. These results are saved from the replay
                  {run.ai === "live" ? ", even in live mode: the replay has no real photos to send. The Verifier runs live on the responder console." : "."}
                </p>
                <button type="button" className={`${primary} mt-3`} disabled={!!busy} onClick={() => act("proof")}>
                  Confirm landfall and check proof
                </button>
              </>
            ) : (
              <p>Partner A passed. Partner B reused a photo from an earlier storm, so it went to a person.</p>
            )}
          </Step>

          <Step n={5} title="The rest follows the proof" state={state("proof")}>
            {run.stage === "proof" ? (
              <>
                <p>{pledge ? `PayPal charges ${waits ? `your whole ${dollars(pledge.amountCents)}` : `the remaining ${dollars(second.chargedCents)}`}. Only the partner who passed gets paid now, and Partner B's share is held.` : "There's no pledge to charge for this tranche."}</p>
                <button type="button" className={`${primary} mt-3`} disabled={!!busy} onClick={() => act("charge2")}>
                  {busy === "charge2" ? "Talking to PayPal…" : pledge ? "Charge the rest and pay" : "Continue"}
                </button>
              </>
            ) : (
              run.t2 && (
                <>
                  {run.t2.charge && (
                    <p>
                      PayPal charged {dollars(run.t2.charge.grossCents)} and kept {dollars(run.t2.charge.feeCents)}. Reference <span className="break-all font-mono text-[13px]">{run.t2.charge.captureId}</span>
                    </p>
                  )}
                  <PayoutStatus payout={run.t2.payout} />
                </>
              )
            )}
          </Step>

          <Step n={6} title="A person decides on the flagged partner" state={state("t2_paid")}>
            {run.stage === "t2_paid" ? (
              <>
                <p>{dollars(run.t2?.heldCents ?? 0)} is held. Only a person can release it, and the rules then send it.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={primary} disabled={!!busy} onClick={() => act("reject")}>
                    {busy === "reject" ? "Talking to PayPal…" : "Reject, and pay Partner A"}
                  </button>
                  <button type="button" className={secondary} disabled={!!busy} onClick={() => act("approve")}>
                    {busy === "approve" ? "Talking to PayPal…" : "Clear, and pay Partner B"}
                  </button>
                </div>
              </>
            ) : run.t2?.release ? (
              <>
                <p>{run.t2.decided === "approve" ? "You cleared Partner B, so its share was released." : "You rejected the proof, so the share went to Partner A."}</p>
                <PayoutStatus payout={run.t2.release} />
              </>
            ) : (
              <p>Nothing was left to decide.</p>
            )}
          </Step>
        </ol>

        {run.stage === "done" && (
          <div className="mt-4">
            <ImpactReceipt run={run} />
          </div>
        )}

        <HowDecided run={run} />

        {run.error && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#fde8e6] p-3 text-[14px] font-medium text-[#7d2a22]">
            {run.error}
          </p>
        )}
        {failed && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#fde8e6] p-3 text-[14px] font-medium text-[#7d2a22]">
            We lost touch with the server. Nothing was charged twice, so you can try that step again.
          </p>
        )}
        {run.stage !== "idle" && (
          <button type="button" className={`${secondary} mt-4`} disabled={!!busy} onClick={() => act("reset")}>
            Run it again
          </button>
        )}
      </div>

      <div className="space-y-5 lg:sticky lg:top-28">
        <Card pad="p-0" className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
            <h2 className="font-display text-[22px] text-ink">
              Live <span className="accent">activity</span>
            </h2>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1b7a48]">
              <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-[#2fbf71]" />
              Live
            </span>
          </div>
          {activity.length === 0 ? (
            <p className="px-5 pb-5 text-[14px] text-[#5f6b7a]">Everything PayPal does will appear here, with its real reference.</p>
          ) : (
            <ul className="max-h-[520px] divide-y divide-ice overflow-y-auto border-t border-ice" aria-live="polite">
              <AnimatePresence initial={false}>
                {activity.map((a) => (
                  <motion.li key={`${a.at}-${a.title}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Pill tone={TONE[a.tone].tone}>{a.tone === "ai" && a.by ? a.by : TONE[a.tone].label}</Pill>
                      <time className="text-[12px] text-[#5f6b7a]">{new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                    </div>
                    <p className="mt-1.5 text-[14px] font-semibold leading-snug text-ink">{a.title}</p>
                    <p className="text-[13px] leading-snug text-[#5f6b7a]">{a.detail}</p>
                    {a.ref && <p className="mt-0.5 break-all font-mono text-[12px] text-link">{a.ref}</p>}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>

        <AskNarrator onUpdate={setData} />

        <Card pad="p-5">
          <h2 className="font-display text-[20px] text-ink">See it in PayPal yourself</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-body">
            Log in at{" "}
            <a href="https://www.sandbox.paypal.com" target="_blank" rel="noreferrer" className="font-semibold text-link hover:underline">
              sandbox.paypal.com
            </a>{" "}
            with your sandbox accounts, and match the references above:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-body">
            <li>The personal account shows each charge.</li>
            <li>LEVee&apos;s business account shows money in, fees and payouts out.</li>
            <li>Each partner&apos;s business account shows money received.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
