"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Card, Label, Pill } from "@/components/app/ui";
import PledgeCard from "@/components/pledge/PledgeCard";
import AskNarrator from "@/components/run/AskNarrator";
import NoticeCard from "./NoticeCard";
import ImpactReceipt from "./ImpactReceipt";
import PillButton from "@/components/ui/PillButton";
import { dollars, giftCharges } from "@/lib/rules";
import type { Activity, Payout } from "@/lib/liveStore";
import type { LiveView } from "@/app/api/live/route";

const PARTNER = { a: "Partner A, Perry, FL", b: "Partner B, Valdosta, GA" } as const;

/** What an entry is, for entries saved before they were tagged. */
const kindOf = (a: Activity) =>
  a.kind ??
  (a.title === "Notice sent to you" ? "notice" : a.title === "LEVee told you what your money did" ? "story" : a.title === "Receipt sent to you" ? "receipt" : a.title.startsWith("PayPal charged") ? "charge" : undefined);

const when = (iso: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="font-display text-[26px] text-ink">
        {title} <span className="accent">{accent}</span>
      </h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Payouts({ label, payout }: { label: string; payout?: Payout }) {
  if (!payout) return null;
  return (
    <div className="py-3">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#5f6b7a]">{label}</p>
      <ul className="mt-2 space-y-1.5">
        {payout.items.map((i) => (
          <li key={i.partner} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="text-ink">
              <span className="font-semibold">{dollars(i.cents)}</span> to {PARTNER[i.partner]}
            </span>
            <Pill tone={i.status === "SUCCESS" ? "green" : i.status && i.status !== "PENDING" ? "red" : "gold"}>{i.status === "SUCCESS" ? "In their PayPal" : (i.status ?? "Sending")}</Pill>
          </li>
        ))}
      </ul>
      {payout.batchId && <p className="mt-1 break-all font-mono text-[12px] text-[#5f6b7a]">PayPal batch {payout.batchId}</p>}
    </div>
  );
}

/**
 * The logged-in donor's own LEVee: their pledge, the notices before each charge, PayPal's receipts, where the money went,
 * and questions about it. All from their own records on the server, the same ones /run moves.
 */
export default function MyMoney() {
  const [data, setData] = useState<LiveView | null>(null);
  const [failed, setFailed] = useState(false);
  const [skipping, setSkipping] = useState(false);

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

  const skip = async () => {
    setSkipping(true);
    const res = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip" }) }).catch(() => null);
    if (res?.ok) setData((await res.json()) as LiveView);
    setSkipping(false);
  };

  if (!data) return <Card>{failed ? "We couldn't load your account just now. Please reload." : "Loading your pledge…"}</Card>;

  const { pledge, gifts, run, activity } = data;
  const notices = activity.filter((a) => kindOf(a) === "notice");
  const charges = activity.filter((a) => kindOf(a) === "charge");
  const story = activity.find((a) => kindOf(a) === "story");
  const paidGifts = gifts.filter((g) => g.status !== "created");
  const capPct = pledge ? Math.min(100, (pledge.chargedCents / Math.max(pledge.capCents, 1)) * 100) : 0;
  const anyPayout = run.t1?.payout || run.t2?.payout || run.t2?.release;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {pledge ? (
          <>
            <PledgeCard
              className=""
              pledge={{ hazards: ["Hurricanes"], regions: ["US Gulf Coast"], amount: pledge.amountCents / 100, cap: pledge.capCents / 100, timing: pledge.timing === "confirmed" ? "confirmed" : "early" }}
            />
            <Card pad="p-5">
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="font-semibold text-ink">Yearly cap used</span>
                <span className="text-[#5f6b7a]">
                  {dollars(pledge.chargedCents)} of {dollars(pledge.capCents)}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-ice">
                <motion.div className="h-2 rounded-full bg-blue" initial={false} animate={{ width: `${Math.max(capPct, 2)}%` }} />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[#5f6b7a]">Saved with PayPal. We stop at your cap, always.</p>
            </Card>
          </>
        ) : (
          <Card>
            <Label>Your pledge</Label>
            <h2 className="font-display mt-2 text-[28px] text-ink">You haven&apos;t pledged yet</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-body">Pledge once, and LEVee only charges when a storm meets the published rules, always with a notice first. Or give once, right now.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <PillButton href="/pledge">Make a pledge</PillButton>
              <PillButton href="/give" variant="light">
                Give once
              </PillButton>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        {run.stage === "notice" && pledge ? (
          <Card>
            <Label>Right now</Label>
            <h2 className="font-display mt-2 text-[28px] text-ink">
              A notice before your <span className="accent">charge</span>
            </h2>
            <div className="mt-4">
              <NoticeCard text={notices[0]?.detail} amountCents={giftCharges(pledge.amountCents)[0].chargedCents} onSkip={() => void skip()} skipping={skipping} />
            </div>
            <Link href="/run" className="mt-3 inline-block text-[14px] font-semibold text-link hover:underline">
              Or carry on in the live demo
            </Link>
          </Card>
        ) : run.stage === "skipped" ? (
          <Card>
            <Pill tone="sky">Skipped</Pill>
            <h2 className="font-display mt-3 text-[28px] text-ink">You skipped Hurricane Helene</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-body">Nothing was charged, and your cap is untouched. Your pledge stays on for the next storm.</p>
          </Card>
        ) : !charges.length && !paidGifts.length ? (
          <Card>
            <Label>Right now</Label>
            <h2 className="font-display mt-2 text-[28px] text-ink">Nothing charged yet</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-body">
              When a storm meets your pledge&apos;s rules, your notice arrives here first, with a one-tap skip. See it happen with Hurricane Helene, using sandbox money.
            </p>
            <PillButton href="/run" variant="light" className="mt-4">
              Open the live demo
            </PillButton>
          </Card>
        ) : null}

        {notices.length > 0 && (
          <Section title="Your" accent="notices">
            <ul className="divide-y divide-ice">
              {notices.map((n) => (
                <li key={n.at + n.detail} className="py-3 first:pt-0">
                  <p className="text-[12px] font-semibold text-[#5f6b7a]">{when(n.at)}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-body">{n.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(charges.length > 0 || paidGifts.length > 0) && (
          <Section title="Your" accent="receipts">
            <ul className="divide-y divide-ice">
              {charges.map((c) => (
                <li key={c.at + (c.ref ?? "")} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{c.title.replace(" from your saved account", "")}</p>
                    <span className="text-[12px] text-[#5f6b7a]">{when(c.at)}</span>
                  </div>
                  <p className="text-[14px] text-body">{c.detail.replace(/^Status COMPLETED\. /, "")}</p>
                  {c.ref && <p className="mt-0.5 break-all font-mono text-[12px] text-link">PayPal reference {c.ref}</p>}
                </li>
              ))}
              {paidGifts.map((g) => (
                <li key={g.id} className="py-3 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">One-time gift of {dollars(g.cents)}</p>
                    <Pill tone={g.status === "refunded" ? "grey" : "green"}>{g.status === "refunded" ? "Refunded" : "In the Reserve"}</Pill>
                  </div>
                  {g.netCents !== undefined && (
                    <p className="text-[14px] text-body">
                      PayPal&apos;s fee {dollars(g.feeCents ?? 0)}, leaving {dollars(g.netCents)}
                    </p>
                  )}
                  {g.captureId && <p className="mt-0.5 break-all font-mono text-[12px] text-link">PayPal reference {g.captureId}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {anyPayout && (
          <Section title="Where it" accent="went">
            <p className="text-[14px] leading-relaxed text-[#5f6b7a]">Your money went out in these PayPal payouts, together with the Reserve&apos;s share.</p>
            <div className="divide-y divide-ice">
              <Payouts label="Before landfall" payout={run.t1?.payout} />
              <Payouts label={`${run.t1?.match?.sponsor ?? "A sponsor"}'s match, before landfall`} payout={run.t1?.match?.payout} />
              <Payouts label="After proof" payout={run.t2?.payout} />
              <Payouts label="After a person's review" payout={run.t2?.release} />
            </div>
            {!!run.t2?.heldCents && !run.t2.release && (
              <p className="mt-2 text-[14px] text-body">{dollars(run.t2.heldCents)} is held while a person reviews Partner B&apos;s proof.</p>
            )}
          </Section>
        )}

        <ImpactReceipt run={run} />

        {story && (
          <Section title="What your money" accent="did">
            <p className="text-[15px] leading-relaxed text-body">{story.detail}</p>
          </Section>
        )}

        <AskNarrator onUpdate={setData} />
      </div>
    </div>
  );
}
