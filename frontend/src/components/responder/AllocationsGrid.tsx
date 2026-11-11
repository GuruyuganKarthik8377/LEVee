"use client";

import { forwardRef, useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { Pill, type Tone } from "@/components/app/ui";
import { usd, type AllocationRow, type PayoutStatus, type ProofStatus } from "@/lib/ledger";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#0070e0",
  borderColor: "#dcebfa",
  browserColorScheme: "light",
  fontFamily: "inherit",
  fontSize: 14,
  foregroundColor: "#2c2e2f",
  headerBackgroundColor: "#edf5fd",
  headerFontWeight: 600,
  headerTextColor: "#001c64",
  rowHoverColor: "#edf5fd",
  selectedRowBackgroundColor: "#dcebfa",
  wrapperBorderRadius: 20,
});

export const PROOF_TONE: Record<ProofStatus, Tone> = {
  "Not due": "grey",
  Waiting: "gold",
  Verified: "green",
  Partial: "gold",
  "Human review": "red",
  Reviewed: "green",
  Rejected: "red",
};

export const PAYOUT_TONE: Record<PayoutStatus, Tone> = {
  "Needs approval": "gold",
  Approved: "blue",
  Sent: "green",
  Locked: "grey",
  "Under review": "gold",
  Held: "red",
};

type Row = AllocationRow & { total?: boolean };
type Cell<V> = ICellRendererParams<Row, V>;

const COLUMNS: ColDef<Row>[] = [
  {
    headerName: "Partner",
    field: "partnerLabel",
    minWidth: 220,
    flex: 1.5,
    filter: true,
    cellRenderer: ({ data, value }: Cell<string>) =>
      data?.total ? (
        <span className="font-semibold text-ink">{value}</span>
      ) : (
        <span className="flex h-full flex-col justify-center">
          <span className="font-semibold leading-tight text-ink">{value}</span>
          <span className="text-[12px] leading-tight text-[#5f6b7a]">{data?.org}</span>
        </span>
      ),
  },
  { headerName: "Tranche", field: "tranche", width: 124, valueFormatter: ({ value, data }) => (data?.total ? "" : `Tranche ${value}`) },
  {
    headerName: "Amount",
    field: "amount",
    width: 112,
    type: "rightAligned",
    valueFormatter: ({ value }) => usd(value ?? null),
    cellClass: "font-semibold",
  },
  {
    headerName: "Proof",
    field: "proof",
    width: 142,
    filter: true,
    cellRenderer: ({ value, data }: Cell<ProofStatus>) => (data?.total || !value ? null : <Pill tone={PROOF_TONE[value]}>{value}</Pill>),
  },
  {
    headerName: "Payout",
    field: "payout",
    width: 150,
    filter: true,
    cellRenderer: ({ value, data }: Cell<PayoutStatus>) => (data?.total || !value ? null : <Pill tone={PAYOUT_TONE[value]}>{value}</Pill>),
  },
  { headerName: "PayPal reference", field: "ref", minWidth: 190, flex: 1, valueFormatter: ({ value, data }) => (data?.total ? "" : (value ?? "None yet")) },
];

const DEFAULTS: ColDef<Row> = { sortable: true, resizable: true };

type Props = { rows: AllocationRow[]; search: string; onPick: (row: AllocationRow | null) => void };

/** The allocation table: sorting, column filters, quick search, a pinned total and CSV export. */
const AllocationsGrid = forwardRef<AgGridReact<Row>, Props>(function AllocationsGrid({ rows, search, onPick }, ref) {
  const totals = useMemo<Row[]>(
    () => [{ id: "total", partnerLabel: "Total allocated", amount: rows.some((r) => r.amount === null) ? null : rows.reduce((sum, r) => sum + (r.amount ?? 0), 0), total: true } as Row],
    [rows],
  );

  return (
    <AgGridReact<Row>
      ref={ref}
      theme={theme}
      rowData={rows}
      columnDefs={COLUMNS}
      defaultColDef={DEFAULTS}
      getRowId={({ data }) => data.id}
      pinnedBottomRowData={rows.length ? totals : undefined}
      quickFilterText={search}
      domLayout="autoHeight"
      rowHeight={60}
      rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
      onSelectionChanged={({ api }) => onPick(api.getSelectedRows()[0] ?? null)}
      overlayNoRowsTemplate="No allocations yet. The Allocator proposes one when the playbook is met."
    />
  );
});

export default AllocationsGrid;
