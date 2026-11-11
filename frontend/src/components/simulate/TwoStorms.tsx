"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Card, Label, Pill } from "@/components/app/ui";
import { dollars, planAllocations, RULES, type Plan, type Proposal, type SimPartner } from "@/lib/rules";

/** Sample partners with the capacity their sample plans asked for. */
const PARTNERS = [
  { id: "a", label: "Partner A", region: "Perry, FL", capacityCents: 200_000 },
  { id: "b", label: "Partner B", region: "Valdosta, GA", capacityCents: 150_000 },
];

type Preset = "split" | "over" | "stranger" | "negative";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "split", label: "A normal split" },
  { id: "over", label: "Adds up to 120%" },
  { id: "stranger", label: "Pays an unvetted group" },
  { id: "negative", label: "Takes money from a partner" },
];

type StormInput = { poolDollars: number; shareA: number; preset: Preset };

function proposalFor({ shareA, preset }: StormInput): Proposal {
  if (preset === "over") return [{ partnerId: "a", shareBps: 8000 }, { partnerId: "b", shareBps: 4000 }];
  if (preset === "stranger") return [{ partnerId: "Unknown Group Ltd", shareBps: 6000 }, { partnerId: "b", shareBps: 4000 }];
  if (preset === "negative") return [{ partnerId: "a", shareBps: 12_000 }, { partnerId: "b", shareBps: -2000 }];
  return [{ partnerId: "a", shareBps: shareA * 100 }, { partnerId: "b", shareBps: (100 - shareA) * 100 }];
}

function StormPanel({
  title,
  tag,
  input,
  onChange,
  plan,
  room,
}: {
  title: string;
  tag: string;
  input: StormInput;
  onChange: (patch: Partial<StormInput>) => void;
  plan: Plan;
  room: SimPartner[];
}) {
  const poolCents = input.poolDollars * 100;
  const rejected = plan.proposalRejected;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[26px] text-ink">{title}</h2>
        <Pill tone="sky">{tag}</Pill>
      </div>

      <label className="mt-4 block text-[14px] font-semibold text-ink">
        Money collected: <span className="text-link">{dollars(poolCents)}</span>
        <input type="range" min={100} max={4000} step={50} value={input.poolDollars} onChange={(e) => onChange({ poolDollars: Number(e.target.value) })} className="mt-2 block w-full accent-[#0070e0]" />
      </label>

      <Label className="mt-5">The proposal</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={input.preset === p.id}
            onClick={() => onChange({ preset: p.id })}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${input.preset === p.id ? "bg-blue text-white" : "bg-ice-soft text-link hover:bg-ice"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {input.preset === "split" && (
        <label className="mt-4 block text-[14px] font-semibold text-ink">
          Partner A {input.shareA}%, Partner B {100 - input.shareA}%
          <input type="range" min={0} max={100} value={input.shareA} onChange={(e) => onChange({ shareA: Number(e.target.value) })} className="mt-2 block w-full accent-[#0070e0]" />
        </label>
      )}

      <div className={`mt-5 rounded-2xl p-3 text-[14px] ${rejected ? "bg-[#fde8e6] text-[#7d2a22]" : "bg-[#dff5e8] text-[#14613a]"}`} aria-live="polite">
        <p className="font-semibold">{rejected ? "Rejected by the rules" : "Accepted by the rules"}</p>
        <p className="mt-0.5">{rejected ? `${rejected}. The money still goes out, on an equal split.` : "The shares add up to 100%, and every name is a vetted partner."}</p>
      </div>

      <Label className="mt-5">What actually gets paid</Label>
      <ul className="mt-2 space-y-3">
        {PARTNERS.map((p) => {
          const cents = plan.allocations.find((a) => a.partnerId === p.id)?.cents ?? 0;
          const left = room.find((r) => r.id === p.id)!.capacityCents;
          return (
            <li key={p.id}>
              <div className="flex justify-between gap-3 text-[14px]">
                <span className="font-semibold text-ink">
                  {p.label}, {p.region}
                </span>
                <span className="font-semibold text-ink">{dollars(cents)}</span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ice">
                <motion.div className="h-full rounded-full bg-blue" initial={false} animate={{ width: `${poolCents ? (cents / poolCents) * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-[#5f6b7a]">{dollars(Math.max(left, 0))} of room before this storm</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-between gap-3 border-t border-ice pt-3 text-[14px]">
        <span className="text-[#5f6b7a]">Held because partners are full</span>
        <span className={`font-semibold ${plan.heldCents > 0 ? "text-[#a8261b]" : "text-ink"}`}>{dollars(plan.heldCents)}</span>
      </div>
    </Card>
  );
}

const START: [StormInput, StormInput] = [
  { poolDollars: 1200, shareA: 60, preset: "split" },
  { poolDollars: 1500, shareA: 70, preset: "split" },
];

export default function TwoStorms() {
  const [storms, setStorms] = useState(START);
  const update = (index: 0 | 1, patch: Partial<StormInput>) => setStorms((s) => (index === 0 ? [{ ...s[0], ...patch }, s[1]] : [s[0], { ...s[1], ...patch }]));

  const firstRoom: SimPartner[] = PARTNERS.map(({ id, capacityCents }) => ({ id, capacityCents }));
  const first = planAllocations(storms[0].poolDollars * 100, firstRoom, proposalFor(storms[0]));
  // Whatever the first storm has promised a partner comes off what it can take for the second.
  const secondRoom = firstRoom.map((p) => ({ ...p, capacityCents: p.capacityCents - (first.allocations.find((a) => a.partnerId === p.id)?.cents ?? 0) }));
  const second = planAllocations(storms[1].poolDollars * 100, secondRoom, proposalFor(storms[1]));

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <StormPanel title="Hurricane Helene" tag="Storm 1" input={storms[0]} onChange={(p) => update(0, p)} plan={first} room={firstRoom} />
        <StormPanel title="A second storm" tag="Storm 2, made up" input={storms[1]} onChange={(p) => update(1, p)} plan={second} room={secondRoom} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setStorms(START)} className="inline-flex h-11 items-center rounded-full bg-ice-soft px-5 text-[15px] font-semibold text-link transition hover:bg-ice">
          Reset
        </button>
        <p className="text-[13px] text-[#5f6b7a]">No real money or AI here. The amounts, partners and proposals are samples you set yourself.</p>
      </div>

      <Card className="mt-6">
        <h2 className="font-display text-[24px] text-ink">What you just saw</h2>
        <ul className="mt-3 grid gap-4 text-[15px] leading-relaxed text-body md:grid-cols-3">
          <li>
            <span className="block font-semibold text-ink">AI can only suggest</span>
            In the real system, the Allocator proposes shares. It can&apos;t pay anyone, and a bad proposal changes nothing but the split.
          </li>
          <li>
            <span className="block font-semibold text-ink">Aid doesn&apos;t wait</span>
            A rejected proposal doesn&apos;t stop the money. It goes out on an equal split, because a storm won&apos;t wait for a fix.
          </li>
          <li>
            <span className="block font-semibold text-ink">No partner is over-promised</span>
            What one storm gives a partner reduces its room for the next, up to {dollars(RULES.maxPerPartnerCents)} per tranche.
          </li>
        </ul>
      </Card>
    </>
  );
}
