-- ============================================================================
-- Learn mode: four mastery levels instead of two
--
-- 0 = New, 1 = Learning, 2 = Familiar, 3 = Mastered.
-- Correct steps up to a cap of 3; a miss steps down (3->1, 2->1, 1->0) rather
-- than resetting to zero.
--
-- Run this in the Supabase SQL editor. It only replaces functions — no table
-- changes and no data is touched. Re-running it is safe.
-- ============================================================================

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
    mastery_count   = case
                        when p_correct then least(question_progress.mastery_count + 1, 3)
                        when question_progress.mastery_count >= 2 then 1
                        else 0
                      end,
    last_seen_at    = now(),
    last_result     = p_correct,
    updated_at      = now();
$$;

create or replace function deck_stats(p_profile_id uuid)
returns table (
  deck_id         uuid,
  total_questions bigint,
  mastered        bigint,
  learning        bigint,
  unseen          bigint,
  total_answers   bigint,
  total_correct   bigint
)
language sql
stable
as $$
  select
    d.id as deck_id,
    count(q.id) as total_questions,
    count(*) filter (
      where q.id is not null and coalesce(qp.mastery_count, 0) >= 3
    ) as mastered,
    count(*) filter (
      where q.id is not null
        and coalesce(qp.times_seen, 0) > 0
        and coalesce(qp.mastery_count, 0) < 3
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
    count(*) filter (where coalesce(qp.mastery_count, 0) >= 3) as mastered,
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

revoke all on function record_answer(uuid, uuid, boolean) from anon, authenticated;
revoke all on function deck_stats(uuid) from anon, authenticated;
revoke all on function topic_stats(uuid, uuid) from anon, authenticated;
