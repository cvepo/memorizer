-- ============================================================================
-- Multi-select questions
--
-- Adds a per-question answer mode. In 'single' mode the question keeps its
-- existing shape: questions.correct_answer is the truth and answer_choices
-- holds exactly one is_correct row. In 'multi' mode answer_choices is the
-- truth — several rows may be is_correct — and correct_answer degrades to a
-- human-readable summary used in review screens and quiz history.
--
-- Additive and backwards compatible: every existing row becomes 'single',
-- which is what the app already assumed. Safe to run more than once.
--
-- Run this in the Supabase SQL editor.
-- ============================================================================

alter table questions
  add column if not exists answer_mode text not null default 'single';

-- Added separately so re-running does not fail on an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_answer_mode_check'
  ) then
    alter table questions
      add constraint questions_answer_mode_check
      check (answer_mode in ('single', 'multi'));
  end if;
end $$;

-- A multi-select question is unanswerable without its stored choices, since
-- runtime-generated distractors cannot know which combination is right. The
-- partial index keeps the "does this question have stored choices?" lookup
-- cheap for the import and editor validation paths.
create index if not exists answer_choices_correct_idx
  on answer_choices (question_id)
  where is_correct;
