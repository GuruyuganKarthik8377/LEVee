// A fake Supabase database client for the tests: just the PostgREST calls Levee makes, on in-memory tables. No keys, no network.
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown> & { seq: number };

/** LIKE as Postgres reads it: % is any run, _ any one character, and a backslash makes the next character literal. */
function likeToRegExp(pattern: string) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else source += c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "s");
}

/**
 * Tables keep Postgres's identity column (seq), and the unique columns named in `unique` ({ table: [column] }): a write
 * that would repeat one fails with Postgres's code 23505. `failOn` makes every call on that table fail. `users` are the
 * logins auth.admin can look up, by id.
 */
export function fakeSupabase(failOn?: string, unique: Record<string, string[]> = {}, users: Record<string, string> = {}) {
  const tables: Record<string, Row[]> = {};
  const deletedUsers: string[] = [];
  let seq = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let columns: string | undefined;
    let orderBy: string | undefined;
    let window: [number, number] | undefined;
    let single = false;
    let write: (() => { message: string; code?: string } | void) | undefined;
    const clash = (value: Record<string, unknown>, self?: Row) =>
      (unique[table] ?? []).some((c) => value[c] != null && rows.some((r) => r !== self && r[c] === value[c]));
    const run = () => {
      if (failOn === table) return { data: null, error: { message: "connection refused" } };
      if (write) return { data: null, error: write() ?? null };
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (orderBy) out = [...out].sort((a, b) => (a[orderBy!] as number | string) < (b[orderBy!] as number | string) ? -1 : 1);
      if (window) out = out.slice(window[0], window[1] + 1);
      const pick = (r: Row) => (columns && columns !== "*" ? Object.fromEntries(columns.split(",").map((c) => [c, structuredClone(r[c])])) : structuredClone(r));
      if (single) return out.length > 1 ? { data: null, error: { message: "more than one row" } } : { data: out[0] ? pick(out[0]) : null, error: null };
      return { data: out.map(pick), error: null };
    };
    const duplicate = { message: "duplicate key value violates unique constraint", code: "23505" };
    const query = {
      select: (c: string) => ((columns = c), query),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), query),
      like: (c: string, pattern: string) => (filters.push((r) => likeToRegExp(pattern).test(String(r[c]))), query),
      order: (c: string) => ((orderBy = c), query),
      range: (a: number, z: number) => ((window = [a, z]), query),
      maybeSingle: () => ((single = true), query),
      upsert: (values: object | object[], options: { onConflict: string; ignoreDuplicates?: boolean }) => {
        write = () => {
          for (const value of [values].flat() as Record<string, unknown>[]) {
            const keys = options.onConflict.split(",");
            const existing = rows.find((r) => keys.every((k) => r[k] === value[k]));
            if (existing && options.ignoreDuplicates) continue;
            if (clash(value, existing)) return duplicate;
            if (!existing) rows.push({ ...structuredClone(value), seq: ++seq });
            else Object.assign(existing, structuredClone(value));
          }
        };
        return query;
      },
      insert: (values: object | object[]) => {
        write = () => {
          for (const value of [values].flat() as Record<string, unknown>[]) {
            if (clash(value)) return duplicate;
            rows.push({ ...structuredClone(value), seq: ++seq });
          }
        };
        return query;
      },
      update: (values: Record<string, unknown>) => {
        write = () => {
          for (const r of rows.filter((r) => filters.every((f) => f(r)))) Object.assign(r, structuredClone(values));
        };
        return query;
      },
      then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return query;
  };
  const auth = {
    admin: {
      deleteUser: async (id: string) => (deletedUsers.push(id), { data: {}, error: null }),
      getUserById: async (id: string) => ({ data: { user: users[id] ? { id, email: users[id] } : null }, error: null }),
    },
  };
  return { client: { from, auth } as unknown as SupabaseClient, tables, deletedUsers };
}
