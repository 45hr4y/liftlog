-- LiftLog v8 Supabase starter schema
-- Run this in Supabase SQL editor when ready for cloud sync.

create extension if not exists "uuid-ossp";

create table if not exists liftlog_profiles (
  id uuid primary key default uuid_generate_v4(),
  email text,
  created_at timestamptz default now()
);

create table if not exists liftlog_backup_snapshots (
  id uuid primary key default uuid_generate_v4(),
  user_label text,
  payload jsonb not null,
  created_at timestamptz default now()
);

-- Simple first cloud step:
-- export local JSON from LiftLog, then store it as a backup snapshot.
-- Full bidirectional table sync should be v9 because it needs auth rules and conflict resolution.
