-- LiftLog v10 Manual Sync Schema
-- Run this in your Supabase SQL Editor.

create table if not exists liftlog_sync (
  sync_key_hash text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- For this first personal-use sync version, RLS is disabled by default.
-- Your private sync code is SHA-256 hashed before being sent to Supabase.
-- Do not use an obvious sync code.
alter table liftlog_sync disable row level security;
