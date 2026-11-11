"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Card, Label, Pill } from "@/components/app/ui";
import { approveAllocation, decideReview, useDemo, type DemoState, type SubmittedProof } from "@/lib/demoStore";
import { allocations, auditLog, needsApproval, overOpsLimit, pendingReviews, trancheOneTotal, usd, whenText } from "@/lib/ledger";
import { ALLOCATIONS, CHARGES, OPS_LIMIT, PARTNERS, type PartnerId } from "@/fixtures/helene";
import ProofArt from "@/components/responder/ProofArt";

const motionProps = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: 24 }, layout: true };

const primary = "inline-flex h-11 items-center rounded-full bg-blue px-5 text-[15px] font-semibold text-white transition hover:bg-[#003087]";
const secondary = "inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice";

function ApprovalCard() {
  const rows = ALLOCATIONS.filter((a) => a.tranche === 1);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="gold">Approval</Pill>
        <Pill tone="sky">Allocator</Pill>
      </div>
      <h2 className="font-display mt-3 text-[26px] text-ink">
        Approve {usd(trancheOneTotal)} for this replay
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-body">{overOpsLimit && `Its ${usd(CHARGES.t1)} of charges is over the ${usd(OPS_LIMIT)} limit. `}The Policy Engine has already rechecked the sums and donor caps.</p>
      <ul className="mt-4 space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="rounded-xl bg-paper p-3 ring-1 ring-inset ring-ice">
            <div className="flex justify-between gap-3 text-[15px] font-semibold text-ink">
              <span>{PARTNERS[a.partner].org}</span>
              <span>{usd(a.amount)}</span>
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-[#5f6b7a]">{a.rationale}</p>
          </li>
        ))}
      </ul>
      <button type="button" onClick={approveAllocation} className={`${primary} mt-4`}>
        Approve in one click
      </button>
    </Card>
  );
}

function ReviewCard({ partner, proof, state }: { partner: PartnerId; proof: SubmittedProof; state: DemoState }) {
  const p = PARTNERS[partner];
  const amount = allocations(state).find((r) => r.partner === partner && r.tranche === 2)?.amount ?? null;
  const failed = proof.checks.filter((c) => c.state === "fail");
  const flagged = proof.files.find((f) => f.flagged);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={proof.verdict === "human" ? "red" : "gold"}>{proof.verdict === "human" ? "Human review" : "Partial pass"}</Pill>
        <Pill tone="sky">Verifier</Pill>
      </div>
      <h2 className="font-display mt-3 text-[26px] text-ink">
        {p.label}, {p.region}: {usd(amount)} on hold
      </h2>
      <ul className="mt-3 space-y-2">
        {failed.map((c) => (
          <li key={c.label} className="rounded-xl bg-[#fde8e6] p-3 text-[14px]">
            <p className="font-semibold text-[#a8261b]">{c.label}</p>
            <p className="text-[#7d2a22]">{c.note}</p>
          </li>
        ))}
      </ul>
      {flagged?.art && (
        <div className="mt-3 grid max-w-[420px] grid-cols-2 gap-3">
          <figure>
            <ProofArt art={flagged.art} className="w-full rounded-xl" />
            <figcaption className="mt-1 text-[12px] text-[#5f6b7a]">Uploaded for this replay</figcaption>
          </figure>
          <figure>
            <ProofArt art={flagged.art} className="w-full rounded-xl" />
            <figcaption className="mt-1 text-[12px] text-[#5f6b7a]">Filed with an earlier storm</figcaption>
          </figure>
        </div>
      )}
      <p className="mt-3 text-[14px] text-[#5f6b7a]">
        {proof.files.length} files checked. {proof.checks.filter((c) => c.state === "pass").length} of {proof.checks.length} checks passed.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => decideReview(partner, "held")} className={primary}>
          Keep on hold
        </button>
        <button type="button" onClick={() => decideReview(partner, "released")} className={secondary}>
          Clear and release {usd(amount)}
        </button>
      </div>
    </Card>
  );
}

export default function OpsScreen() {
  const demo = useDemo();
  const approval = needsApproval(demo);
  const reviews = pendingReviews(demo);
  const open = (approval ? 1 : 0) + reviews.length;
  const decided = auditLog(demo).filter((e) => e.actor === "Ops");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[26px] text-ink">
            Needs a <span className="accent">person</span>
          </h2>
          <Pill tone={open ? "gold" : "green"}>{open ? `${open} open` : "All clear"}</Pill>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {approval && (
            <motion.div key="approval" {...motionProps}>
              <ApprovalCard />
            </motion.div>
          )}
          {reviews.map((id) => (
            <motion.div key={id} {...motionProps}>
              <ReviewCard partner={id} proof={demo.proofs[id]!} state={demo} />
            </motion.div>
          ))}
          {!open && (
            <motion.div key="empty" {...motionProps}>
              <Card>
                <p className="font-display text-[24px] text-ink">Nothing waiting on you</p>
                <p className="mt-1 text-[15px] leading-relaxed text-body">Approvals appear when the Allocator goes over the limit. Reviews appear when the Verifier returns a partial or human verdict.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/replay/helene" className={secondary}>
                    Open the replay
                  </Link>
                  <Link href="/responder/proof" className={secondary}>
                    Upload proof
                  </Link>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-4">
        <div className="rounded-[24px] bg-blue-section p-6 text-white [--accent-color:#60cdff]">
          <h2 className="font-display text-[24px]">
            What ops <span className="accent">cannot</span> do
          </h2>
          <ul className="mt-3 space-y-2.5 text-[14px] leading-snug text-white/85">
            {["Change an amount or a playbook rule", "Send money directly, because only the Policy Engine can", "Remove a decision from the audit log"].map((item) => (
              <li key={item} className="flex gap-2.5">
                <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-sky-strong" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Card>
          <Label>Your decisions</Label>
          {decided.length ? (
            <ul className="mt-2 divide-y divide-ice">
              {decided.map((e) => (
                <li key={e.id} className="py-2.5">
                  <p className="text-[14px] font-semibold text-ink">{e.title}</p>
                  <p className="text-[13px] text-[#5f6b7a]">
                    {e.output} · {whenText(e.at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-body">No decisions yet.</p>
          )}
          <Link href="/audit" className="mt-3 inline-block text-[13px] font-semibold text-link hover:underline">
            Full audit log
          </Link>
        </Card>
      </div>
    </div>
  );
}
