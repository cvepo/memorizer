import type { StudyQuestion } from "@/lib/types";

export type Choice = {
  text: string;
  isCorrect: boolean;
};

/** Fisher-Yates. Returns a new array. */
export function shuffle<T>(input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const normalize = (value: string) => value.trim().toLowerCase();

/** Case-insensitive dedupe that keeps the first spelling seen. */
function uniqueBy(values: readonly string[], exclude: readonly string[] = []): string[] {
  const seen = new Set(exclude.map(normalize));
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalize(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function sample<T>(values: readonly T[], count: number): T[] {
  return shuffle(values).slice(0, count);
}

/**
 * Pick distractors that are plausible next to `correct`: prefer answers of a
 * similar length, but sample from a pool rather than taking the top N so the
 * same question does not get the same three wrong answers every time.
 */
function pickDistractors(correct: string, candidates: readonly string[], count: number): string[] {
  const pool = uniqueBy(candidates, [correct]);
  if (pool.length <= count) return shuffle(pool);

  const byLengthSimilarity = [...pool].sort(
    (a, b) => Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length),
  );
  const shortlistSize = Math.min(pool.length, Math.max(count * 3, 8));
  return sample(byLengthSimilarity.slice(0, shortlistSize), count);
}

/**
 * Build the multiple-choice options for a question. Used by both Learn and
 * Quiz so the two modes behave identically.
 *
 * If the spreadsheet supplied wrong answers, those are used verbatim. If it
 * only supplied a correct answer, distractors are borrowed from the correct
 * answers of other questions — same topic first, then anywhere in the deck.
 * Generated distractors are never written to the database, so the combination
 * varies between sessions.
 */
export function generateChoices(
  question: StudyQuestion,
  deckQuestions: readonly StudyQuestion[],
  maxChoices = 4,
): Choice[] {
  const correct = question.correct_answer.trim();

  const importedDistractors = uniqueBy(
    question.choices.filter((c) => !c.is_correct).map((c) => c.answer_text),
    [correct],
  );

  if (importedDistractors.length > 0) {
    const kept = importedDistractors.slice(0, maxChoices - 1);
    return shuffle([
      { text: correct, isCorrect: true },
      ...kept.map((text) => ({ text, isCorrect: false })),
    ]);
  }

  const others = deckQuestions.filter((q) => q.id !== question.id);
  const questionTopic = question.topic?.trim().toLowerCase();

  const sameTopic = questionTopic
    ? others.filter((q) => q.topic?.trim().toLowerCase() === questionTopic).map((q) => q.correct_answer)
    : [];

  const wanted = maxChoices - 1;
  let distractors = pickDistractors(correct, sameTopic, wanted);

  if (distractors.length < wanted) {
    const rest = others.map((q) => q.correct_answer);
    const extra = pickDistractors(correct, uniqueBy(rest, [correct, ...distractors]), wanted - distractors.length);
    distractors = [...distractors, ...extra];
  }

  return shuffle([
    { text: correct, isCorrect: true },
    ...distractors.map((text) => ({ text, isCorrect: false })),
  ]);
}

/**
 * How many options the deck can actually produce for a question. The UI uses
 * this to warn that a deck is too small for four unique choices.
 */
export function maxAvailableChoices(
  question: StudyQuestion,
  deckQuestions: readonly StudyQuestion[],
): number {
  const correct = question.correct_answer.trim();
  const imported = uniqueBy(
    question.choices.filter((c) => !c.is_correct).map((c) => c.answer_text),
    [correct],
  );
  if (imported.length > 0) return Math.min(4, imported.length + 1);

  const pool = uniqueBy(
    deckQuestions.filter((q) => q.id !== question.id).map((q) => q.correct_answer),
    [correct],
  );
  return Math.min(4, pool.length + 1);
}
