-- ============================================================================
-- Study experience: ignored questions
--
-- Adds per-profile ignoring without changing shared questions or progress.
-- Existing tables and data are untouched. Safe to run more than once.
--
-- Run this in the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ignored_questions
-- A reversible, per-profile exclusion from study. Ignoring a question never
-- changes another profile's study pool or clears the question's progress.
-- ---------------------------------------------------------------------------
create table if not exists ignored_questions (
  profile_id  uuid not null references profiles (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, question_id)
);

create index if not exists ignored_questions_profile_idx
  on ignored_questions (profile_id, created_at desc);

alter table ignored_questions enable row level security;
