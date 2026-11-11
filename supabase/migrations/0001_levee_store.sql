-- Levee's state in Supabase Postgres: the same three stores as frontend/src/server/store.ts, plus /run's browser sessions.
-- Run it once in the Supabase SQL editor (or with `supabase db push`). It's safe to run again.
-- Only the website's server reads and writes these, with the service-role key. Row Level Security is on and no
-- policy lets anyone else in, so the public anon key can't read a donor's records or Levee's ledger.

-- Levee's key-value table. seq keeps the order keys were first written, which list() returns, as the JSON file did.
create table if not exists levee_kv (
  key text primary key,
  value jsonb,
  seq bigint generated always as identity
);
create index if not exists levee_kv_seq on levee_kv (seq);

-- Every PayPal event. Append-only, and PayPal resends webhooks, so (kind, paypal_id, status) is unique and a repeat is ignored.
create table if not exists levee_ledger (
  seq bigint generated always as identity primary key,
  kind text not null,
  paypal_id text not null,
  status text not null,
  row jsonb not null,
  unique (kind, paypal_id, status)
);

-- Every decision, for the public audit page. Append-only.
create table if not exists levee_audit (
  seq bigint generated always as identity primary key,
  entry jsonb not null,
  at timestamptz not null default now()
);

-- /run's record for each browser: its saved PayPal account, gifts and replay.
create table if not exists levee_live_sessions (
  id uuid primary key,
  session jsonb not null,
  updated_at timestamptz not null default now()
);

alter table levee_kv enable row level security;
alter table levee_ledger enable row level security;
alter table levee_audit enable row level security;
alter table levee_live_sessions enable row level security;
