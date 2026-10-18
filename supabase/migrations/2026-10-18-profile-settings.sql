-- ============================================================================
-- Profile settings: Learn checkpoint preferences
--
-- Keeps Learn preferences with the profile so they follow it across devices.
-- Existing tables and data are untouched. Safe to run more than once.
--
-- Run this in the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profile_settings
-- A shared browser must not carry one person's preferences into another's
-- session, and a second device should use the same saved preferences.
-- ---------------------------------------------------------------------------
create table if not exists profile_settings (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  checkpoint_length int not null default 8 check (checkpoint_length >= 3),
  checkpoint_jitter int not null default 0 check (checkpoint_jitter between 0 and 10),
  updated_at        timestamptz not null default now()
);

-- Only the server's secret-key client may access profile preferences.
alter table profile_settings enable row level security;
