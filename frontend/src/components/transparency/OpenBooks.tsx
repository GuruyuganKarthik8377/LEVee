"use client";

import Link from "next/link";
import { Card, Label, Pill, type Tone } from "@/components/app/ui";
import { useDemo } from "@/lib/demoStore";
import { auditLog, dateText, funds, NO_FIGURE, usd, type AuditActor } from "@/lib/ledger";
import { dollars, RULES } from "@/lib/rules";
import { BRIEFS, STORM_SOURCES } from "@/fixtures/helene";

const ALERT_TONE: Record<string, Tone> = { Red: "red", Orange: "gold", Green: "green" };

const PUBLISHED: [string, string][] = [
  ["GDACS alert", RULES.alertLevels.join(" or ")],
  ["Forecast landfall", `${RULES.minLeadHours} to ${RULES.maxLeadHours} hours away`],
  ["Sentinel confidence", `${RULES.minConfidence} or more`],
  ["Forecast age", `${RULES.maxBriefAgeHours} hours old at most`],
  ["First charge", `${RULES.earlyShareBps / 100}% of an early donor's gift`],
  ["Time to skip", `${RULES.skipWindowMinutes} minutes after the notice`],
  ["A person approves above", dollars(RULES.opsLimitCents)],
  ["Most per partner, per tranche", dollars(RULES.maxPerPartnerCents)],
  ["Proof deadline", `${RULES.proofDeadlineHours} hours after landfall`],
  ["Refund window", `${RULES.refundWindowHours} hours after a charge`],
];

const ACTORS: { actor: AuditActor; canMove: boolean; role: string }[] = [
  { actor: "Sentinel", canMove: false, role: "Scores forecasts" },
  { actor: "Allocator", canMove: false, role: "Proposes a split" },
  { actor: "Verifier", canMove: false, role: "Checks proof" },
  { actor: "Narrator", canMove: false, role: "Tells donors" },
  { actor: "Ops", canMove: false, role: "Approves and reviews" },
  { actor: "Policy Engine", canMove: true, role: "Applies fixed rules" },
];

export default function OpenBooks() {
  const demo = useDemo();
  const money = funds(demo);
  const log = auditLog(demo);

  const stats = [
    { label: "Charged to donors", value: usd(money.captured) },
    { label: "PayPal's fees", value: usd(money.fees) },
    { label: "Corporate match", value: usd(money.match) },
    { label: "Paid to partners", value: usd(money.paid) },
    { label: "Held for proof", value: usd(money.held) },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} pad="p-5">
            <Label>{s.label}</Label>
            <p className="font-display mt-2 text-[28px] leading-none text-ink">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <h2 className="font-display text-[26px] text-ink">
            The <span className="accent">rules</span>, published
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-body">Set before any storm, and the same for every donor. No one can change them during one.</p>
          <dl className="mt-3 divide-y divide-ice text-[14px]">
            {PUBLISHED.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-[#5f6b7a]">{k}</dt>
                <dd className="text-right font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <h2 className="font-display text-[26px] text-ink">
            Who can <span className="accent">move</span> money
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-body">Five parts advise or approve. Only one sends money, and it follows the rules with no AI inside it.</p>
          <ul className="mt-3 divide-y divide-ice">
            {ACTORS.map(({ actor, canMove, role }) => (
              <li key={actor} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{actor}</span>
                  <span className="block text-[13px] text-[#5f6b7a]">
                    {role} · {log.filter((e) => e.actor === actor).length} decisions so far
                  </span>
                </span>
                <Pill tone={canMove ? "green" : "grey"}>{canMove ? "Moves money" : "Can't move money"}</Pill>
              </li>
            ))}
          </ul>
          <Link href="/audit" className="mt-3 inline-block text-[15px] font-semibold text-link hover:underline">
            Read every decision in the audit log
          </Link>
        </Card>
      </div>

      <Card className="mt-6" pad="p-0">
        <div className="p-6 pb-3">
          <h2 className="font-display text-[26px] text-ink">
            Every <span className="accent">forecast</span> it saw
          </h2>
          <p className="mt-1 text-[15px] leading-relaxed text-body">Each of Helene&apos;s GDACS advisories, as it stood at the time. Times are US Eastern.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[14px]">
            <thead>
              <tr className="border-y border-ice bg-paper text-[12px] uppercase tracking-[0.1em] text-[#5f6b7a]">
                <th scope="col" className="px-6 py-2 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">Alert</th>
                <th scope="col" className="px-3 py-2 font-semibold">Forecast</th>
                <th scope="col" className="px-6 py-2 text-right font-semibold">Sentinel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ice">
              {BRIEFS.map((b) => (
                <tr key={b.t}>
                  <td className="whitespace-nowrap px-6 py-2.5 text-[#5f6b7a]">{dateText(b.t)}</td>
                  <td className="px-3 py-2.5">{b.alert ? <Pill tone={ALERT_TONE[b.alert] ?? "grey"}>{b.alert}</Pill> : NO_FIGURE}</td>
                  <td className="px-3 py-2.5 font-semibold text-ink">{b.headline}</td>
                  <td className="px-6 py-2.5 text-right font-semibold text-ink">{b.confidence ?? NO_FIGURE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="p-6 pt-3 text-[13px] leading-relaxed text-[#5f6b7a]">{STORM_SOURCES}</p>
      </Card>
    </>
  );
}
