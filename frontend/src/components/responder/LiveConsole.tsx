"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PartnerEvents } from "@/app/api/responder/route";
import { Card, Label, Pill, type Tone } from "@/components/app/ui";
import { usd } from "@/lib/ledger";

type Storm = PartnerEvents[number];

export const TRANCHE_STATUS: Record<Storm["tranches"][number]["status"], [Tone, string]> = {
  awaiting_approval: ["gold", "Waiting for ops approval"],
  notice_open: ["sky", "Donors notified"],
  charging: ["sky", "Collecting donations"],
  paying: ["sky", "Sending"],
  held_for_review: ["gold", "Held for review"],
  paid: ["green", "Paid"],
  payout_denied: ["red", "PayPal refused it, retrying"],
  no_funds: ["grey", "Nothing collected"],
  needs_review: ["gold", "Ops are checking a payment"],
};
export const VERDICT: Record<NonNullable<Storm["proof"]>["verdict"], [Tone, string]> = {
  pass: ["green", "Verifier pass"],
  partial: ["gold", "Partial pass"],
  human: ["red", "Sent to a person"],
};
const REVIEW: Record<NonNullable<Storm["review"]>["status"], [Tone, string]> = {
  open: ["gold", "Ops reviewing"],
  approved: ["green", "Approved by ops"],
  rejected: ["red", "Rejected by ops"],
};

/**
 * The logged-in partner's storms: undefined while asking, null when this browser isn't an approved responder (or the
 * server has no accounts), so the page shows the Helene recording instead.
 */
export function usePartnerStorms() {
  const [storms, setStorms] = useState<PartnerEvents | null>();
  useEffect(() => {
    let live = true;
    fetch("/api/responder", { cache: "no-store" })
      .then(async (res) => live && setStorms(res.ok ? await res.json() : null))
      .catch(() => live && setStorms(null));
    return () => {
      live = false;
    };
  }, []);
  return storms;
}

const dollars = (cents: number) => usd(cents / 100);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
const link = "inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087]";

function StormCard({ storm }: { storm: Storm }) {
  const proof = storm.proof;
  const review = storm.review;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="sky">{storm.landfall ? `Landfall ${when(storm.landfall)}` : "Before landfall"}</Pill>
        {proof && <Pill tone={VERDICT[proof.verdict][0]}>{VERDICT[proof.verdict][1]}</Pill>}
        {review && <Pill tone={REVIEW[review.status][0]}>{REVIEW[review.status][1]}</Pill>}
      </div>
      <h3 className="font-display mt-3 text-[26px] text-ink">{storm.name}</h3>

      <ul className="mt-4 divide-y divide-ice">
        {storm.tranches.map((t) => (
          <li key={t.tranche} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold text-ink">
                Tranche {t.tranche}
                {t.shareBps !== null && <span className="font-normal text-[#5f6b7a]"> · your share {t.shareBps / 100}%</span>}
              </p>
              <Pill tone={TRANCHE_STATUS[t.status][0]}>{TRANCHE_STATUS[t.status][1]}</Pill>
            </div>
            <p className="mt-1 text-[14px] text-body">
              Paid to you: <span className="font-semibold text-ink">{dollars(t.paidCents)}</span>
              {t.heldCents > 0 && <> · held until ops review your proof: <span className="font-semibold text-ink">{dollars(t.heldCents)}</span></>}
            </p>
            {t.rationale && (
              <p className="mt-1 text-[14px] leading-relaxed text-body">
                <span className="font-semibold text-ink">Why the Allocator chose this: </span>
                {t.rationale}
              </p>
            )}
          </li>
        ))}
      </ul>

      {proof && (
        <div className="mt-2 rounded-2xl bg-paper p-4 ring-1 ring-inset ring-ice">
          <Label>Your proof</Label>
          <p className="mt-2 text-[14px] leading-relaxed text-body">{proof.summary}</p>
          {proof.checks.some((c) => !c.passed) && (
            <ul className="mt-2 space-y-1 text-[14px] text-body">
              {proof.checks
                .filter((c) => !c.passed)
                .map((c) => (
                  <li key={c.rule}>
                    <span className="font-semibold text-[#a8261b]">{c.rule}:</span> needed {c.required}, found {c.actual}.
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {review?.note && (
        <p className="mt-3 text-[14px] text-body">
          <span className="font-semibold text-ink">Ops said: </span>
          {review.note}
        </p>
      )}

      {storm.proofOpen && (
        <div className="mt-4">
          <Link href={`/responder/proof?event=${encodeURIComponent(storm.eventKey)}`} className={link}>
            {proof ? "Replace your proof" : "Upload proof"}
          </Link>
        </div>
      )}
    </Card>
  );
}

/** A logged-in approved responder's own storms, from GET /api/responder. */
export default function LiveConsole({ storms }: { storms: PartnerEvents }) {
  const all = storms.flatMap((s) => s.tranches);
  const tiles = [
    { label: "Paid to you", value: dollars(all.reduce((sum, t) => sum + t.paidCents, 0)) },
    { label: "Held for review", value: dollars(all.reduce((sum, t) => sum + t.heldCents, 0)) },
    { label: "Storms", value: String(storms.length) },
    { label: "Proof still due", value: String(storms.filter((s) => s.proofOpen && !s.proof).length) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} pad="p-5">
            <Label>{t.label}</Label>
            <p className="font-display mt-2 text-[clamp(28px,3vw,38px)] leading-none text-ink">{t.value}</p>
          </Card>
        ))}
      </div>
      {storms.length ? (
        storms.map((s) => <StormCard key={s.eventKey} storm={s} />)
      ) : (
        <Card>
          <h2 className="font-display text-[24px] text-ink">
            No storms <span className="accent">yet</span>
          </h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-body">
            When a storm heading for your service area meets the playbook, the Allocator&apos;s share for you, and the reason for it, appear here. You upload proof after landfall.
          </p>
        </Card>
      )}
    </div>
  );
}
