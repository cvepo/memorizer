-- ============================================================================
-- Study experience: starred questions, study activity, idempotent saving
--
-- Adds three tables and makes answer recording safe to retry. Existing tables
-- and data are untouched. Safe to run more than once.
--
-- Run this in the Supabase SQL editor.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- starred_questions
-- A manual, per-profile bookmark. Independent of mastery and of the automatic
-- "needs review" flag: mastering a question never clears its star.
-- ---------------------------------------------------------------------------
create table if not exists starred_questions (
  profile_id  uuid not null references profiles (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, question_id)
);

create index if not exists starred_questions_profile_idx
  on starred_questions (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- study_activity
-- When a profile last actually studied a deck, and in which mode. Written on
-- real study events (revealing or advancing a flashcard, answering in Learn,
-- choosing a quiz answer) and never on merely opening a page, importing, or
-- editing. This is what "Continue studying" and "Recent decks" sort by.
-- ---------------------------------------------------------------------------
create table if not exists study_activity (
  profile_id      uuid not null references profiles (id) on delete cascade,
  deck_id         uuid not null references decks (id) on delete cascade,
  last_mode       text not null default 'flashcards',
  last_studied_at timestamptz not null default now(),
  primary key (profile_id, deck_id)
);

create index if not exists study_activity_recent_idx
  on study_activity (profile_id, last_studied_at desc);

-- ---------------------------------------------------------------------------
-- answer_events
-- One row per graded answer, keyed by an id the client generates before it
-- sends anything. A retry carries the same id, so an answer can never be
-- counted twice no matter how many times the network fails.
-- ---------------------------------------------------------------------------
create table if not exists answer_events (
  id          uuid primary key,
  profile_id  uuid not null references profiles (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  was_correct boolean not null,
  source      text not null default 'learn',
  created_at  timestamptz not null default now()
);

create index if not exists answer_events_profile_idx
  on answer_events (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- record_answer_once(event_id, profile, question, correct, source)
--
-- The idempotent form of record_answer. Inserting the event is the guard: if
-- the id is already present the insert does nothing and progress is left
-- alone, so replaying a queued answer after a failed request is harmless.
--
-- Returns true when the answer actually counted, false when it was a replay.
-- ---------------------------------------------------------------------------
create or replace function record_answer_once(
  p_event_id    uuid,
  p_profile_id  uuid,
  p_question_id uuid,
  p_correct     boolean,
  p_source      text default 'learn'
)
returns boolean
language plpgsql
as $$
declare
  inserted boolean := false;
begin
  insert into answer_events (id, profile_id, question_id, was_correct, source)
  values (p_event_id, p_profile_id, p_question_id, p_correct, p_source)
  on conflict (id) do nothing;

  get diagnostics inserted = row_count;
  if not inserted then
    return false;
  end if;

  perform record_answer(p_profile_id, p_question_id, p_correct);

  -- Answering is study activity; flashcard browsing records its own separately.
  insert into study_activity (profile_id, deck_id, last_mode, last_studied_at)
  select p_profile_id, q.deck_id, p_source, now()
  from questions q
  where q.id = p_question_id
  on conflict (profile_id, deck_id) do update set
    last_mode = excluded.last_mode,
    last_studied_at = greatest(study_activity.last_studied_at, excluded.last_studied_at);

  return true;
end;
$$;

-- Batch form for quiz submission. p_answers:
--   [{"event_id": "...", "question_id": "...", "correct": true}, ...]
create or replace function record_answers_once(
  p_profile_id uuid,
  p_answers    jsonb,
  p_source     text default 'quiz'
)
returns void
language plpgsql
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(p_answers)
  loop
    perform record_answer_once(
      (item ->> 'event_id')::uuid,
      p_profile_id,
      (item ->> 'question_id')::uuid,
      (item ->> 'correct')::boolean,
      p_source
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- touch_study_activity
-- Records study activity without touching mastery — used by flashcards, which
-- must never affect accuracy or mastery counts.
-- ---------------------------------------------------------------------------
create or replace function touch_study_activity(
  p_profile_id uuid,
  p_deck_id    uuid,
  p_mode       text default 'flashcards'
)
returns void
language sql
as $$
  insert into study_activity (profile_id, deck_id, last_mode, last_studied_at)
  values (p_profile_id, p_deck_id, p_mode, now())
  on conflict (profile_id, deck_id) do update set
    last_mode = excluded.last_mode,
    last_studied_at = greatest(study_activity.last_studied_at, excluded.last_studied_at);
$$;

-- ---------------------------------------------------------------------------
-- deck_review_counts(profile)
-- Per deck: how many questions need review, and how many are starred.
--
-- "Needs review" is derived rather than stored: a question qualifies once it
-- has two or more incorrect graded answers and is not currently Mastered.
-- Mastering it drops it off the list while preserving the mistake history, and
-- a later miss brings it back, exactly as the resolution rule describes.
-- ---------------------------------------------------------------------------
create or replace function deck_review_counts(p_profile_id uuid)
returns table (
  deck_id       uuid,
  needs_review  bigint,
  starred       bigint
)
language sql
stable
as $$
  select
    d.id as deck_id,
    count(*) filter (
      where coalesce(qp.times_incorrect, 0) >= 2
        and coalesce(qp.mastery_count, 0) < 3
    ) as needs_review,
    count(*) filter (where s.question_id is not null) as starred
  from decks d
  left join questions q on q.deck_id = d.id
  left join question_progress qp
    on qp.question_id = q.id
   and qp.profile_id = p_profile_id
  left join starred_questions s
    on s.question_id = q.id
   and s.profile_id = p_profile_id
  group by d.id;
$$;

alter table starred_questions enable row level security;
alter table study_activity    enable row level security;
alter table answer_events     enable row level security;

revoke all on function record_answer_once(uuid, uuid, uuid, boolean, text) from anon, authenticated;
revoke all on function record_answers_once(uuid, jsonb, text) from anon, authenticated;
revoke all on function touch_study_activity(uuid, uuid, text) from anon, authenticated;
revoke all on function deck_review_counts(uuid) from anon, authenticated;
