-- What Levee keeps about each account. Supabase Auth keeps the email and password (auth.users); this keeps the rest.
-- Run it once in the Supabase SQL editor, after 0001. It's safe to run again.
-- Only the website's server reads and writes it, with the service-role key: Row Level Security is on and no policy lets anyone else in.

create table if not exists levee_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('donor', 'responder')),
  name text not null,
  -- A donor's id in the donor routes and /run. Unique, so one browser's /run pledge can't belong to two accounts.
  donor_id uuid unique,
  -- A donor's pledge terms: { amount, cap, timing }.
  pledge jsonb,
  -- A responder's organisation, with status pending_review until a person approves it.
  organisation jsonb,
  created_at timestamptz not null default now()
);

alter table levee_profiles enable row level security;
