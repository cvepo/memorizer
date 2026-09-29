-- ============================================================================
-- Memorizer — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per friend using the site. There are no real accounts: the shared
-- password grants access, the profile only partitions study progress.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_name_key on profiles (lower(name));

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists courses_set_updated_at on courses;
create trigger courses_set_updated_at
  before update on courses
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- decks
-- ---------------------------------------------------------------------------
create table if not exists decks (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists decks_course_id_idx on decks (course_id);

drop trigger if exists decks_set_updated_at on decks;
create trigger decks_set_updated_at
  before update on decks
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- questions
-- image_url is intentionally unused in V1 so image support needs no migration.
-- ---------------------------------------------------------------------------
create table if not exists questions (
  id             uuid primary key default gen_random_uuid(),
  deck_id        uuid not null references decks (id) on delete cascade,
  question_text  text not null,
  correct_answer text not null,
  explanation    text,
  topic          text,
  image_url      text,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists questions_deck_id_idx on questions (deck_id, position);
create index if not exists questions_topic_idx on questions (deck_id, topic);

drop trigger if exists questions_set_updated_at on questions;
create trigger questions_set_updated_at
  before update on questions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- answer_choices
-- Only choices that came from the spreadsheet (or the editor) live here.
-- "Other question" distractors are generated at runtime and never stored,
-- so Learn and Quiz can vary the combinations.
-- ---------------------------------------------------------------------------
create table if not exists answer_choices (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  answer_text text not null,
  is_correct  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists answer_choices_question_id_idx on answer_choices (question_id);

-- ---------------------------------------------------------------------------
-- question_progress
-- mastery_count: 0 = not yet correct, 1 = learning, 2+ = mastered.
-- Scoped per profile so each friend has their own mastery.
-- ---------------------------------------------------------------------------
create table if not exists question_progress (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles (id) on delete cascade,
  question_id     uuid not null references questions (id) on delete cascade,
  times_seen      integer not null default 0,
  times_correct   integer not null default 0,
  times_incorrect integer not null default 0,
  mastery_count   integer not null default 0,
  last_seen_at    timestamptz,
  last_result     boolean,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, question_id)
);

create index if not exists question_progress_question_idx on question_progress (question_id);
create index if not exists question_progress_profile_idx on question_progress (profile_id);

drop trigger if exists question_progress_set_updated_at on question_progress;
create trigger question_progress_set_updated_at
  before update on question_progress
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- quiz_attempts / quiz_answers
-- ---------------------------------------------------------------------------
create table if not exists quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  deck_id         uuid not null references decks (id) on delete cascade,
  profile_id      uuid references profiles (id) on delete set null,
  score           integer not null default 0,
  total_questions integer not null default 0,
  percentage      numeric(5, 2) not null default 0,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists quiz_attempts_deck_idx on quiz_attempts (deck_id, started_at desc);
create index if not exists quiz_attempts_profile_idx on quiz_attempts (profile_id, started_at desc);

create table if not exists quiz_answers (
  id              uuid primary key default gen_random_uuid(),
  quiz_attempt_id uuid not null references quiz_attempts (id) on delete cascade,
  question_id     uuid references questions (id) on delete set null,
  question_text   text,
  correct_answer  text,
  explanation     text,
  selected_answer text,
  was_correct     boolean not null default false,
  position        integer not null default 0
);

create index if not exists quiz_answers_attempt_idx on quiz_answers (quiz_attempt_id, position);

-- ---------------------------------------------------------------------------
-- deck_stats(profile)
-- One round trip for every deck's mastery breakdown and accuracy.
--   unseen   = never answered
--   learning = answered at least once but not yet mastered
--   mastered = mastery_count >= 2
-- A question missed after being mastered drops back to learning, not unseen.
-- ---------------------------------------------------------------------------
create or replace function deck_stats(p_profile_id uuid)
returns table (
  deck_id        uuid,
  total_questions bigint,
  mastered       bigint,
  learning       bigint,
  unseen         bigint,
  total_answers  bigint,
  total_correct  bigint
)
language sql
stable
as $$
  select
    d.id as deck_id,
    count(q.id) as total_questions,
    count(*) filter (
      where q.id is not null and coalesce(qp.mastery_count, 0) >= 2
    ) as mastered,
    count(*) filter (
      where q.id is not null
        and coalesce(qp.times_seen, 0) > 0
        and coalesce(qp.mastery_count, 0) < 2
    ) as learning,
    count(*) filter (
      where q.id is not null and coalesce(qp.times_seen, 0) = 0
    ) as unseen,
    coalesce(sum(coalesce(qp.times_correct, 0) + coalesce(qp.times_incorrect, 0)), 0) as total_answers,
    coalesce(sum(coalesce(qp.times_correct, 0)), 0) as total_correct
  from decks d
  left join questions q on q.deck_id = d.id
  left join question_progress qp
    on qp.question_id = q.id
   and qp.profile_id = p_profile_id
  group by d.id;
$$;

-- ---------------------------------------------------------------------------
-- topic_stats(deck, profile)
-- Powers the "accuracy by topic" table on the deck page.
-- ---------------------------------------------------------------------------
create or replace function topic_stats(p_deck_id uuid, p_profile_id uuid)
returns table (
  topic         text,
  total         bigint,
  mastered      bigint,
  total_answers bigint,
  total_correct bigint
)
language sql
stable
as $$
  select
    coalesce(nullif(trim(q.topic), ''), 'Untagged') as topic,
    count(q.id) as total,
    count(*) filter (where coalesce(qp.mastery_count, 0) >= 2) as mastered,
    coalesce(sum(coalesce(qp.times_correct, 0) + coalesce(qp.times_incorrect, 0)), 0) as total_answers,
    coalesce(sum(coalesce(qp.times_correct, 0)), 0) as total_correct
  from questions q
  left join question_progress qp
    on qp.question_id = q.id
   and qp.profile_id = p_profile_id
  where q.deck_id = p_deck_id
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- record_answer / record_answers
-- Atomic upsert of a single answer. Doing this in SQL rather than
-- read-modify-write in the app keeps two people studying at once from
-- clobbering each other's counters.
--   correct   -> mastery_count + 1
--   incorrect -> mastery_count resets to 0
-- Both Learn and Quiz use this, so the two modes agree on what "mastered"
-- and "missed" mean.
-- ---------------------------------------------------------------------------
create or replace function record_answer(
  p_profile_id  uuid,
  p_question_id uuid,
  p_correct     boolean
)
returns void
language sql
as $$
  insert into question_progress (
    profile_id, question_id, times_seen, times_correct, times_incorrect,
    mastery_count, last_seen_at, last_result
  )
  values (
    p_profile_id,
    p_question_id,
    1,
    case when p_correct then 1 else 0 end,
    case when p_correct then 0 else 1 end,
    case when p_correct then 1 else 0 end,
    now(),
    p_correct
  )
  on conflict (profile_id, question_id) do update set
    times_seen      = question_progress.times_seen + 1,
    times_correct   = question_progress.times_correct + case when p_correct then 1 else 0 end,
    times_incorrect = question_progress.times_incorrect + case when p_correct then 0 else 1 end,
    mastery_count   = case when p_correct then question_progress.mastery_count + 1 else 0 end,
    last_seen_at    = now(),
    last_result     = p_correct,
    updated_at      = now();
$$;

-- Batch form used when a quiz is submitted.
-- p_answers: [{"question_id": "...", "correct": true}, ...]
create or replace function record_answers(p_profile_id uuid, p_answers jsonb)
returns void
language plpgsql
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(p_answers)
  loop
    perform record_answer(
      p_profile_id,
      (item ->> 'question_id')::uuid,
      (item ->> 'correct')::boolean
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The app never talks to Supabase from the browser. Every read and write goes
-- through Next.js server code using the service role key, which bypasses RLS.
-- RLS is therefore enabled with NO policies: anyone who finds the project URL
-- and the anon key gets nothing.
-- ---------------------------------------------------------------------------
alter table profiles          enable row level security;
alter table courses           enable row level security;
alter table decks             enable row level security;
alter table questions         enable row level security;
alter table answer_choices    enable row level security;
alter table question_progress enable row level security;
alter table quiz_attempts     enable row level security;
alter table quiz_answers      enable row level security;

revoke all on function deck_stats(uuid) from anon, authenticated;
revoke all on function topic_stats(uuid, uuid) from anon, authenticated;
revoke all on function record_answer(uuid, uuid, boolean) from anon, authenticated;
revoke all on function record_answers(uuid, jsonb) from anon, authenticated;
