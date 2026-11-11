import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cookies } from "next/headers";
import { serverSupabase, supabaseConfigured, supabaseSessions } from "../server/supabaseStore.ts";

/**
 * What the live sandbox demo remembers on the server: one record per browser, with its saved PayPal account, gifts and replay.
 * The Reserve and every PayPal movement are in the backend's ledger (src/server/store.ts), and each replay's engine state in its table.
 * With Supabase set up, each browser's record is a row in levee_live_sessions. Without it, all of them are in one JSON file on one server.
 */

export * from "./liveSession.ts";
import type { Session } from "./liveSession.ts";
import { newRun } from "./liveSession.ts";

type Store = {
  sessions: Record<string, Session>;
  /** With Supabase, sessions are read one at a time, when a request first needs them. */
  load?: (id: string) => Promise<Session | undefined>;
};

const FILE = process.env.LEVEE_LIVE_STORE ?? join(tmpdir(), "levee-live-demo.json");

const shared = globalThis as unknown as { __leveeStore?: Store; __leveeQueue?: Promise<unknown> };

function load(): Store {
  if (shared.__leveeStore) return shared.__leveeStore;
  let store: Store = { sessions: {} };
  try {
    if (existsSync(FILE)) store = JSON.parse(readFileSync(FILE, "utf8")) as Store;
  } catch {
    // a damaged demo file just means a fresh start
  }
  shared.__leveeStore = store;
  return store;
}

/** Runs one change at a time, so a double click can't start two charges. Results are saved even if the change then fails. */
export function withStore<T>(change: (store: Store) => Promise<T> | T): Promise<T> {
  // ponytail: changes queue up on this server only. Two servers sharing Supabase could both change one browser's record at once; lock its row if that matters.
  const run = supabaseConfigured() ? withRows(change) : async () => {
    const store = load();
    try {
      return await change(store);
    } finally {
      writeFileSync(FILE, JSON.stringify(store));
    }
  };
  const result = (shared.__leveeQueue ?? Promise.resolve()).then(run, run);
  shared.__leveeQueue = result.catch(() => undefined);
  return result;
}

/** One change on Supabase rows: the sessions it touches are read when needed, and written back even if the change then fails. */
function withRows<T>(change: (store: Store) => Promise<T> | T) {
  return async () => {
    const rows = supabaseSessions(serverSupabase());
    const store: Store = { sessions: {}, load: rows.load };
    try {
      return await change(store);
    } finally {
      await rows.save(Object.values(store.sessions));
    }
  };
}

const COOKIE = "levee_demo";
const UUID = /^[0-9a-f-]{36}$/;

/** The browser's own record. The id lives in a cookie page scripts can't read, so nobody can act on someone else's saved account. */
export async function sessionFor(store: Store): Promise<Session> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id || !UUID.test(id)) {
    id = randomUUID();
    jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
  }
  return (store.sessions[id] ??= (await store.load?.(id)) ?? { id, gifts: [], run: newRun(), activity: [] });
}
