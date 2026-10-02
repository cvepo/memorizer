-- ============================================================================
-- Achievement badges
--
-- A badge is earned at 50, 100, 200, 500, 1,000 and 2,500 correct answers.
--
--   profile_stats   one lifetime correct counter per profile. It is its own
--                   number, not a live sum of question_progress, so deleting a
--                   question or resetting a deck can never lower it.
--   achievements    one row per badge per profile. acknowledged_at stays empty
--                   until the person has actually seen the celebration, so a
--                   lost response cannot lose one.
--
-- The counter goes up inside record_answer_once, in the same transaction that
-- records the answer. That function ignores replays, so a retried answer never
-- counts twice, while answering the same question again does.
--
-- Run this in the Supabase SQL editor after the study-experience migration.
-- Re-running it is safe: tables use "if not exists", functions are replaced,
-- and the backfill never overwrites an existing counter or badge.
-- ============================================================================

create table if not exists profile_stats (
  profile_id       uuid primary key references profiles (id) on delete cascade,
  lifetime_correct bigint not null default 0,
  updated_at       timestamptz not null default now()
);

create table if not exists achievements (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles (id) on delete cascade,
  badge_key       text not null,
  earned_at       timestamptz not null default now(),
  acknowledged_at timestamptz,
  -- Awarded by the launch backfill rather than earned live; the real date
  -- cannot be reconstructed, so the UI shows "before badges existed".
  backfilled      boolean not null default false,
  unique (profile_id, badge_key)
);

create index if not exists achievements_pending_idx
  on achievements (profile_id) where acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- award_badges(profile, total, backfilled)
-- Gives every tier the total has reached. The unique constraint makes this
-- safe to call repeatedly and from concurrent transactions.
-- Keep the tier list in step with lib/badges.ts.
-- ---------------------------------------------------------------------------
create or replace function award_badges(
  p_profile_id uuid,
  p_total      bigint,
  p_backfilled boolean default false
)
returns void
language sql
as $$
  insert into achievements (profile_id, badge_key, backfilled)
  select p_profile_id, 'correct_' || tier, p_backfilled
  from unnest(array[50, 100, 200, 500, 1000, 2500]) as tier
  where tier <= p_total
  on conflict (profile_id, badge_key) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- record_answer_once: unchanged except that a correct, non-replayed answer
-- now bumps the lifetime counter and awards any tier it reaches.
-- The counter row is locked by the upsert, so concurrent answers from two
-- tabs are applied one after the other and no tier is skipped or doubled.
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
  new_total bigint;
begin
  insert into answer_events (id, profile_id, question_id, was_correct, source)
  values (p_event_id, p_profile_id, p_question_id, p_correct, p_source)
  on conflict (id) do nothing;

  get diagnostics inserted = row_count;
  if not inserted then
    return false;
  end if;

  perform record_answer(p_profile_id, p_question_id, p_correct);

  if p_correct then
    insert into profile_stats (profile_id, lifetime_correct)
    values (p_profile_id, 1)
    on conflict (profile_id) do update set
      lifetime_correct = profile_stats.lifetime_correct + 1,
      updated_at = now()
    returning lifetime_correct into new_total;

    perform award_badges(p_profile_id, new_total, false);
  end if;

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

-- ---------------------------------------------------------------------------
-- Launch backfill
-- Start every existing profile's counter at the correct answers already on
-- record, then award the tiers that already satisfies. Those badges are left
-- unacknowledged so each person sees one combined message on their next visit.
-- ---------------------------------------------------------------------------
insert into profile_stats (profile_id, lifetime_correct)
select p.id, coalesce(sum(qp.times_correct), 0)
from profiles p
left join question_progress qp on qp.profile_id = p.id
group by p.id
on conflict (profile_id) do nothing;

insert into achievements (profile_id, badge_key, backfilled)
select s.profile_id, 'correct_' || tier, true
from profile_stats s
cross join unnest(array[50, 100, 200, 500, 1000, 2500]) as tier
where tier <= s.lifetime_correct
on conflict (profile_id, badge_key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security: all access is server-side with the service key.
-- ---------------------------------------------------------------------------
alter table profile_stats enable row level security;
alter table achievements  enable row level security;

revoke all on function award_badges(uuid, bigint, boolean) from anon, authenticated;
revoke all on function record_answer_once(uuid, uuid, uuid, boolean, text) from anon, authenticated;
