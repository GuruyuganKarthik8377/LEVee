"use client";

import { useRef, useState } from "react";
import type { AgGridReact } from "ag-grid-react";
import PillButton from "@/components/ui/PillButton";
import { Card, Label, Pill, ReplayHeader } from "@/components/app/ui";
import { useDemo } from "@/lib/demoStore";
import { allocations, clockText, funds, usd, whenText, type AllocationRow } from "@/lib/ledger";
import { PARTNERS, PLAYBOOK_HOUR } from "@/fixtures/helene";
import AllocationsGrid, { PAYOUT_TONE, PROOF_TONE } from "./AllocationsGrid";
import LiveConsole, { usePartnerStorms } from "./LiveConsole";

/** A logged-in approved responder sees its own storms; everyone else, the Helene recording. */
export default function ResponderConsole() {
  const storms = usePartnerStorms();
  if (storms === undefined) return <p className="text-[15px] text-body">Loading…</p>;
  return storms ? <LiveConsole storms={storms} /> : (
    <>
      <ReplayHeader />
      <HeleneConsole />
    </>
  );
}

function HeleneConsole() {
  const demo = useDemo();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<AllocationRow | null>(null);
  const grid = useRef<AgGridReact>(null);

  const rows = allocations(demo);
  const money = funds(demo);
  const selected = picked ? (rows.find((r) => r.id === picked.id) ?? null) : null;
  const waitingOnProof = rows.filter((r) => r.tranche === 2 && r.payout === "Locked").length;
  const underReview = rows.filter((r) => r.payout === "Under review" || r.payout === "Held").length;
  const needle = search.trim().toLowerCase();
  const matching = rows.filter((r) => `${r.partnerLabel} ${r.org} ${r.proof} ${r.payout}`.toLowerCase().includes(needle));

  const tiles = [
    { label: "Allocated", value: usd(money.allocated) },
    { label: "Paid out", value: usd(money.paid) },
    { label: "Proof still due", value: String(waitingOnProof) },
    { label: "Under review or held", value: String(underReview) },
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

      <Card pad="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[24px] text-ink">
              Helene replay <span className="accent">allocations</span>
            </h2>
            <Pill tone="sky">
              {demo.clock < 0 ? `${clockText(demo.clock)} to landfall` : whenText(demo.clock)}
            </Pill>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="grid-search" className="sr-only">
              Search allocations
            </label>
            <input
              id="grid-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="h-10 w-44 rounded-full bg-paper px-4 text-[14px] text-ink outline-none ring-1 ring-inset ring-ice placeholder:text-[#8c9bae] focus:ring-2 focus:ring-blue"
            />
            <button
              type="button"
              onClick={() => grid.current?.api.exportDataAsCsv({ fileName: "levee-helene-allocations.csv" })}
              disabled={!rows.length}
              className="inline-flex h-10 items-center rounded-full bg-ice-soft px-4 text-[14px] font-semibold text-link transition hover:bg-ice disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <div className="min-w-[860px]">
            <AllocationsGrid ref={grid} rows={rows} search={search} onPick={setPicked} />
          </div>
        </div>
        {/* six columns do not fit a phone, so the same rows stack here */}
        <ul className="space-y-2 sm:hidden">
          {matching.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={selected?.id === r.id}
                onClick={() => setPicked(r)}
                className={`w-full rounded-2xl p-3.5 text-left ring-1 ring-inset transition ${selected?.id === r.id ? "bg-ice ring-ice-line" : "bg-paper ring-ice"}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-ink">
                    {r.partnerLabel}, tranche {r.tranche}
                  </span>
                  <span className="text-[15px] font-semibold text-ink">{usd(r.amount)}</span>
                </span>
                <span className="block text-[13px] text-[#5f6b7a]">{r.org}</span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  <Pill tone={PROOF_TONE[r.proof]}>Proof: {r.proof.toLowerCase()}</Pill>
                  <Pill tone={PAYOUT_TONE[r.payout]}>{r.payout}</Pill>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!rows.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ice-soft p-4 sm:mt-4">
            <p className="max-w-[52ch] text-[14px] leading-relaxed text-body">
              {PLAYBOOK_HOUR === null ? "Allocations appear here once the Helene replay has been run." : `The playbook is met ${whenText(PLAYBOOK_HOUR)}. Run the replay to see allocations arrive here.`}
            </p>
            <PillButton href="/replay/helene">Open the replay</PillButton>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          {selected ? (
            <>
              <Label>{`${selected.partnerLabel} · tranche ${selected.tranche}`}</Label>
              <p className="font-display mt-2 text-[28px] text-ink">{selected.org}</p>
              <p className="mt-1 text-[14px] text-[#5f6b7a]">{selected.region}</p>
              <p className="mt-4 text-[15px] leading-relaxed text-body">
                <span className="font-semibold text-ink">Why the Allocator chose this: </span>
                {selected.rationale}
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-body">
                <span className="font-semibold text-ink">Early action plan: </span>
                {PARTNERS[selected.partner].plan}.
              </p>
            </>
          ) : (
            <>
              <Label>Allocation detail</Label>
              <p className="font-display mt-2 text-[24px] text-ink">Pick a row to see why</p>
              <p className="mt-2 text-[15px] leading-relaxed text-body">Every allocation carries the Allocator&apos;s reasoning and the partner&apos;s early action plan.</p>
            </>
          )}
        </Card>
        <div className="rounded-[24px] bg-blue-section p-6 text-white [--accent-color:#60cdff]">
          <h2 className="font-display text-[26px]">
            Money follows <span className="accent">proof</span>
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-white/85">Upload your distribution list, photos and receipts. Tranche 2 unlocks when the Verifier passes them.</p>
          <PillButton href="/responder/proof" variant="sky" className="mt-5">
            Upload proof
          </PillButton>
        </div>
      </div>
    </div>
  );
}
