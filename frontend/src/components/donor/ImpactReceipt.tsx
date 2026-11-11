"use client";

import Link from "next/link";
import { Card, Label } from "@/components/app/ui";
import { dollars } from "@/lib/rules";
import type { LiveView } from "@/app/api/live/route";

type Run = LiveView["run"];
type Letter = "a" | "b";

const PARTNER: Record<Letter, { name: string; place: string }> = {
  a: { name: "Partner A", place: "Perry, FL" },
  b: { name: "Partner B", place: "Valdosta, GA" },
};

// What each sample partner's proof pack showed in the recorded Helene run (backend/agents/scripts/helene.ts):
// a distribution list, receipts and photos for 60 cases of water and 40 tarpaulins.
const DELIVERED = "60 cases of water and 40 tarps";

/** This donor's share of each partner's payout: their charge after PayPal's fee, split the way the payout was split. */
function shareOf(netCents: number, items: { partner: Letter; cents: number }[]) {
  const total = items.reduce((sum, i) => sum + i.cents, 0);
  const out: Partial<Record<Letter, number>> = {};
  if (!total || !netCents) return out;
  for (const i of items) out[i.partner] = (out[i.partner] ?? 0) + Math.round((netCents * i.cents) / total);
  return out;
}

/**
 * The end of the story for a donor: what their money did. How much reached responders and how early, how it split
 * between partners, and what each partner's checked proof showed. Only from this run's own PayPal results.
 */
export default function ImpactReceipt({ run }: { run: Run }) {
  const c1 = run.t1?.charge;
  const c2 = run.t2?.charge;
  if (run.stage !== "done" || (!c1 && !c2)) return null;

  const early = shareOf(c1?.netCents ?? 0, run.t1?.payout?.items ?? []);
  const later = shareOf(c2?.netCents ?? 0, [...(run.t2?.payout?.items ?? []), ...(run.t2?.release?.items ?? [])]);
  const charged = (c1?.grossCents ?? 0) + (c2?.grossCents ?? 0);
  const fees = (c1?.feeCents ?? 0) + (c2?.feeCents ?? 0);
  const reached = (c1?.netCents ?? 0) + (c2?.netCents ?? 0);
  const lead = run.t1?.leadHours;
  const rejected = run.t2?.decided === "reject";

  const partners = (["a", "b"] as Letter[]).filter((p) => early[p] || later[p]);

  return (
    <Card className="overflow-hidden" pad="p-0">
      <div className="bg-blue-section px-6 py-6 text-white [--accent-color:#60cdff] md:px-7">
        <Label className="text-sky-strong">What your {dollars(charged)} did</Label>
        {c1 && lead !== undefined ? (
          <p className="font-display mt-2 text-[clamp(26px,3vw,34px)] leading-tight">
            {dollars(c1.netCents)} reached responders <span className="accent">{Math.round(lead)} hours</span> before Helene made landfall
          </p>
        ) : (
          <p className="font-display mt-2 text-[clamp(26px,3vw,34px)] leading-tight">
            {dollars(reached)} reached responders whose proof <span className="accent">passed</span>
          </p>
        )}
        <p className="mt-2 text-[14px] text-white/80">
          Charged {dollars(charged)} · PayPal&apos;s fees {dollars(fees)} · {dollars(reached)} reached responders
        </p>
        {run.t1?.match?.payout && (
          <p className="mt-3 inline-flex rounded-full bg-white/12 px-3 py-1.5 text-[14px] font-semibold">
            {run.t1.match.sponsor} matched your early gift: {dollars(run.t1.match.cents)} more, before landfall
          </p>
        )}
      </div>

      <ul className="divide-y divide-ice px-6 md:px-7">
        {partners.map((p) => {
          const total = (early[p] ?? 0) + (later[p] ?? 0);
          const passed = p === "a";
          return (
            <li key={p} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-semibold text-ink">
                  {PARTNER[p].name}, {PARTNER[p].place}
                </p>
                <p className="text-[16px] font-semibold text-ink">{dollars(total)} of yours</p>
              </div>
              <p className="mt-0.5 text-[13px] text-[#5f6b7a]">
                {[early[p] && `${dollars(early[p]!)} before landfall`, later[p] && `${dollars(later[p]!)} ${passed || rejected ? "after proof" : "after a person's review"}`].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-body">
                {passed
                  ? `Handed out ${DELIVERED}. The Verifier checked its receipts, photos and distribution list.${rejected ? " It also received Partner B's held share." : ""}`
                  : rejected
                    ? "Its proof went to a person: one photo matched one filed after an earlier storm. It was rejected, so its held share went to Partner A."
                    : `Reported ${DELIVERED}. One photo matched one filed after an earlier storm, so a person reviewed its proof before the rest was paid.`}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-ice px-6 py-3 text-[13px] text-[#5f6b7a] md:px-7">
        Sample partners and a replay of a past storm, with real PayPal sandbox money.{" "}
        <Link href="/audit" className="font-semibold text-link hover:underline">
          See every decision
        </Link>
      </p>
    </Card>
  );
}
