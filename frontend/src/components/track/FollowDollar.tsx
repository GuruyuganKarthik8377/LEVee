"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Card, Label, Pill, type Tone } from "@/components/app/ui";
import { useDemo } from "@/lib/demoStore";
import { dateText, hoursText, whenText } from "@/lib/ledger";
import { dollars, giftCharges, RULES } from "@/lib/rules";
import { ADVISORY_COUNT, ALLOCATIONS, CAPTURE_HOUR, DEMO_DONOR, LANDFALL_TEXT, HELENE, NET_POOL, PARTNERS, PAYOUT_HOUR, PLAYBOOK_HOUR, PROOF_HOUR, REFS, REPLAY_START } from "@/fixtures/helene";

const { pledge } = DEMO_DONOR;
const FIRED_ADVISORY = 6;
const [first, second] = giftCharges(pledge.amount * 100);
const totalFee = first.feeCents + second.feeCents;
const totalNet = first.netCents + second.netCents;
const totalCents = pledge.amount * 100;

type Status = "done" | "next" | "pending" | "skipped";

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  done: { label: "Done", tone: "green" },
  next: { label: "Coming up", tone: "grey" },
  pending: { label: "Waiting for the replay run", tone: "gold" },
  skipped: { label: "Skipped", tone: "grey" },
};

type Step = { title: string; when?: string; body: string; status: Status; amount?: string };

const at = (hour: number | null, clock: number): Status => (hour === null ? "pending" : clock >= hour ? "done" : "next");
const whenAt = (hour: number | null) => (hour === null ? undefined : `${dateText(hour)} EDT · ${whenText(hour)}`);

function MoneyBar() {
  const parts = [
    { label: `Tranche 1 to responders`, cents: first.netCents, className: "bg-blue" },
    { label: `Tranche 2 to responders`, cents: second.netCents, className: "bg-sky-strong" },
    { label: "PayPal's fees", cents: totalFee, className: "bg-gold" },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>Out of {dollars(totalCents)}</Label>
          <p className="font-display mt-1 text-[clamp(36px,5vw,56px)] leading-none text-ink">{dollars(totalNet)}</p>
          <p className="mt-1 text-[15px] text-body">can reach responders after PayPal&apos;s fees</p>
        </div>
        <p className="max-w-[34ch] text-[13px] leading-relaxed text-[#5f6b7a]">Worked out at the rate measured in PayPal&apos;s sandbox, 3.49% + $0.49 per charge. Two charges mean two fixed fees, so bigger gifts lose less.</p>
      </div>
      <div className="mt-5 flex h-5 overflow-hidden rounded-full bg-ice" role="img" aria-label={parts.map((p) => `${p.label} ${dollars(p.cents)}`).join(", ")}>
        {parts.map((p, i) => (
          <motion.div key={p.label} className={p.className} initial={{ width: 0 }} whileInView={{ width: `${(p.cents / totalCents) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.2, ease: "easeOut" }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${p.className}`} />
            <span className="text-body">{p.label}</span>
            <span className="font-semibold text-ink">{dollars(p.cents)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function FollowDollar() {
  const demo = useDemo();
  const { clock, skippedAt, proofs, reviews } = demo;
  const skipped = skippedAt !== null;
  const charged = (status: Status): Status => (skipped ? "skipped" : status);

  const proofStates = (Object.keys(PARTNERS) as (keyof typeof PARTNERS)[]).map((id) => {
    const proof = proofs[id];
    const label = `${PARTNERS[id].label}, ${PARTNERS[id].region}`;
    if (!proof) return `${label}: no proof yet`;
    if (reviews[id]) return `${label}: ${reviews[id]!.outcome === "released" ? "cleared by a person" : "kept on hold by a person"}`;
    return `${label}: ${proof.verdict === "pass" ? "passed" : "sent to a person"}`;
  });
  const anyCleared = (Object.keys(PARTNERS) as (keyof typeof PARTNERS)[]).some((id) => proofs[id]?.verdict === "pass" || reviews[id]?.outcome === "released");
  const secondCharge: Status = charged(PROOF_HOUR !== null && anyCleared ? "done" : "next");

  const shares = (tranche: 1 | 2) =>
    ALLOCATIONS.filter((a) => a.tranche === tranche)
      .map((a) => `${dollars(Math.round(((a.amount ?? 0) / (tranche === 1 ? NET_POOL.t1 : NET_POOL.t2)) * (tranche === 1 ? first : second).netCents))} for ${PARTNERS[a.partner].label}`)
      .join(" and ");

  const steps: Step[] = [
    {
      title: "You make one pledge",
      body: `${dollars(totalCents)} per hurricane on the US Gulf Coast, up to $${pledge.cap} a year. PayPal keeps your payment details, and nothing is charged yet.`,
      status: "done",
    },
    {
      title: "Sentinel reads every forecast",
      when: whenAt(REPLAY_START),
      body: `GDACS issued ${ADVISORY_COUNT} advisories on Helene. Sentinel scores them, but it can't move money. It only reports.`,
      status: at(REPLAY_START, clock),
    },
    {
      title: "Fixed rules decide, not AI",
      when: whenAt(PLAYBOOK_HOUR),
      body: `An Orange or Red alert, landfall ${RULES.minLeadHours} to ${RULES.maxLeadHours} hours away, and Sentinel confidence of ${RULES.minConfidence} or more. All three first passed at GDACS advisory ${FIRED_ADVISORY}, with confidence ${HELENE.brief.confidence}.`,
      status: at(PLAYBOOK_HOUR, clock),
    },
    {
      title: "You hear first, and can skip",
      when: whenAt(PLAYBOOK_HOUR),
      body: `A notice says what will be charged and why. You have ${RULES.skipWindowMinutes} minutes to skip this storm with one tap.`,
      status: charged(at(PLAYBOOK_HOUR, clock)),
    },
    {
      title: "PayPal charges 40% of your gift",
      when: whenAt(CAPTURE_HOUR),
      amount: dollars(first.chargedCents),
      body: `PayPal keeps ${dollars(first.feeCents)}, leaving ${dollars(first.netCents)} in the pool. PayPal's sandbox reference: ${DEMO_DONOR.captureRef}.`,
      status: charged(at(CAPTURE_HOUR, clock)),
    },
    {
      title: "Responders get money before the storm",
      when: whenAt(PAYOUT_HOUR),
      amount: dollars(first.netCents),
      body: `One PayPal batch pays the sample partners ${PAYOUT_HOUR === null ? "before landfall" : `${hoursText(PAYOUT_HOUR)} before landfall`}. In proportion, that's ${shares(1)}. Your gift joins a shared pool, so it never buys one particular item. Batch ${REFS.t1Batch}.`,
      status: charged(at(PAYOUT_HOUR, clock)),
    },
    {
      title: "The storm lands",
      when: `${dateText(0)} EDT`,
      body: `Helene came ashore ${LANDFALL_TEXT}. A person confirms this from the National Hurricane Center before anything else happens.`,
      status: at(0, clock),
    },
    {
      title: "Responders have to prove the work",
      when: whenAt(PROOF_HOUR),
      body: `The Verifier checks their photos, receipts and lists, and flags anything reused from an earlier storm. ${proofStates.join(". ")}.`,
      status: at(PROOF_HOUR, clock),
    },
    {
      title: "The rest of your gift follows the proof",
      amount: dollars(second.chargedCents),
      body: `PayPal keeps ${dollars(second.feeCents)}, leaving ${dollars(second.netCents)}, which is ${shares(2)}. Only partners who passed are paid, and a flagged partner's share waits for a person to decide. Sandbox reference: ${DEMO_DONOR.captureRefT2}.`,
      status: secondCharge,
    },
  ];

  return (
    <>
      <MoneyBar />

      {skipped && (
        <Card className="mt-5">
          <Pill tone="sky">You skipped this storm</Pill>
          <p className="mt-2 text-[15px] text-body">Nothing was charged, and your pledge stays active for the next one.</p>
        </Card>
      )}

      <ol className="relative mt-8 space-y-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-0.5 before:bg-ice">
        {steps.map((step, i) => {
          const status = STATUS[step.status];
          return (
            <motion.li key={step.title} className="relative flex gap-4" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.35 }}>
              <span aria-hidden className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-bold ${step.status === "done" ? "bg-blue text-white" : "bg-white text-link ring-2 ring-inset ring-ice"}`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 rounded-[20px] bg-white p-4 ring-1 ring-ice md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-[20px] leading-snug text-ink">{step.title}</h2>
                  <span className="flex items-center gap-2">
                    {step.amount && <span className="font-display text-[20px] text-link">{step.amount}</span>}
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </span>
                </div>
                {step.when && <p className="mt-0.5 text-[13px] font-semibold text-[#5f6b7a]">{step.when}</p>}
                <p className="mt-1.5 text-[15px] leading-relaxed text-body">{step.body}</p>
              </div>
            </motion.li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-semibold text-link">
        <Link href="/replay/helene" className="hover:underline">
          Move the replay forward
        </Link>
        <Link href="/donor" className="hover:underline">
          See the donor&apos;s phone
        </Link>
        <Link href="/audit" className="hover:underline">
          Read every decision
        </Link>
      </div>
    </>
  );
}
