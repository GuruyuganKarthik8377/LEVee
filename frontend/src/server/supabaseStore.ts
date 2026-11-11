import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { KeyValue } from "../../../backend/agents/src/levee.ts";
import type { Ledger, LedgerRow } from "../../../backend/payments/src/types.ts";
import type { Session } from "../lib/liveSession.ts";

/**
 * Levee's state in Supabase Postgres (supabase/migrations/0001_levee_store.sql), behind the same interface as the JSON
 * file in store.ts, so createLevee and the routes don't change. Used once SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */

export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const shared = globalThis as unknown as { __leveeSupabase?: SupabaseClient };

/** The server's own client. Its service-role key can read and write every Levee table, so it must never reach the browser. */
export const serverSupabase = () =>
  (shared.__leveeSupabase ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));

type Reply<T> = { data: T; error: { message: string } | null };

// A failed write throws rather than being skipped: the ledger is a record of real PayPal money.
export function check<T>({ data, error }: Reply<T>): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

// Supabase returns at most 1,000 rows a request, so long lists are read a page at a time.
const PAGE = 1000;
async function everyRow<T>(page: (from: number, to: number) => PromiseLike<Reply<T[] | null>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const batch = check(await page(from, from + PAGE - 1)) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

// A key prefix is matched literally, even if it contains a LIKE wildcard.
const startsWith = (prefix: string) => `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function supabaseStore(db: SupabaseClient) {
  const kv: KeyValue = {
    async get<T>(key: string) {
      const row = check(await db.from("levee_kv").select("value").eq("key", key).maybeSingle<{ value: T }>());
      return row ? row.value : undefined;
    },
    async set(key, value) {
      check(await db.from("levee_kv").upsert({ key, value: value ?? null }, { onConflict: "key" }));
    },
    async list<T>(prefix: string) {
      const rows = await everyRow<{ value: T }>((from, to) => db.from("levee_kv").select("value").like("key", startsWith(prefix)).order("seq").range(from, to));
      return rows.map((r) => r.value);
    },
  };

  const ledger: Ledger = {
    async record(row) {
      check(await db.from("levee_ledger").upsert({ kind: row.kind, paypal_id: row.paypalId, status: row.status, row }, { onConflict: "kind,paypal_id,status", ignoreDuplicates: true }));
    },
  };

  return {
    kv,
    ledger,
    readLedger: async () => (await everyRow<{ row: LedgerRow }>((from, to) => db.from("levee_ledger").select("row").order("seq").range(from, to))).map((r) => r.row),
    audit: async (entry: unknown) => {
      check(await db.from("levee_audit").insert({ entry }));
    },
  };
}

/** /run's browser sessions, one row each. */
export function supabaseSessions(db: SupabaseClient) {
  return {
    async load(id: string): Promise<Session | undefined> {
      const row = check(await db.from("levee_live_sessions").select("session").eq("id", id).maybeSingle<{ session: Session }>());
      return row?.session;
    },
    async save(sessions: Session[]) {
      if (!sessions.length) return;
      const at = new Date().toISOString();
      check(await db.from("levee_live_sessions").upsert(sessions.map((session) => ({ id: session.id, session, updated_at: at })), { onConflict: "id" }));
    },
  };
}
