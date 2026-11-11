import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { KeyValue } from "../../../backend/agents/src/levee.ts";
import type { Ledger, LedgerRow } from "../../../backend/payments/src/types.ts";

/**
 * Levee's three stores in one JSON file: the key-value table, the PayPal ledger and the audit log.
 * ponytail: one file on one server, rewritten on every change. Swap for Postgres (README "What to store") before running more than one server.
 */

type Data = { kv: Record<string, unknown>; ledger: LedgerRow[]; audit: unknown[] };

// The same copy-in, copy-out as memoryKeyValue, so nobody can change a stored record by holding on to it.
const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

export function fileStore(file: string) {
  // A damaged file throws rather than starting fresh: the ledger is a record of real PayPal money.
  const data: Data = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { kv: {}, ledger: [], audit: [] };

  // Written beside the file and then renamed, so a crash mid-write can't leave half a file.
  const save = () => {
    writeFileSync(`${file}.tmp`, JSON.stringify(data));
    renameSync(`${file}.tmp`, file);
  };

  const kv: KeyValue = {
    get: async <T>(key: string) => copy(data.kv[key]) as T | undefined,
    set: async (key, value) => {
      data.kv[key] = copy(value);
      save();
    },
    list: async <T>(prefix: string) => Object.entries(data.kv).filter(([key]) => key.startsWith(prefix)).map(([, value]) => copy(value) as T),
  };

  // Append-only, and PayPal resends webhooks, so a row already seen is ignored.
  const ledger: Ledger = {
    async record(row) {
      if (data.ledger.some((r) => r.kind === row.kind && r.paypalId === row.paypalId && r.status === row.status)) return;
      data.ledger.push(copy(row));
      save();
    },
  };

  return {
    kv,
    ledger,
    readLedger: async () => copy(data.ledger),
    audit: async (entry: unknown) => {
      data.audit.push(copy(entry));
      save();
    },
  };
}
