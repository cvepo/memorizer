import { shuffle } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

export const MASTERY_TARGET = 2;

/** How many other questions to put between a miss and its retry. */
const REINSERT_MIN = 3;
const REINSERT_MAX = 7;

/** Correct-but-not-yet-mastered questions come back a little later. */
const REVIEW_MIN = 5;
const REVIEW_MAX = 9;

export type LearnState = {
  /** question id -> mastery count, seeded from the database. */
  mastery: Record<string, number>;
  /** Upcoming question ids. The head is the question on screen. */
  queue: string[];
  answered: number;
  correct: number;
  /** Ids answered at least once this session. */
  seen: string[];
  /** Ids missed at any point this session, for "Review missed". */
  missed: string[];
};

function randomBetween(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Order the opening queue by how shaky each question is:
 * last answer was wrong -> never seen -> answered correctly once.
 * Questions are shuffled within each tier so the order is not the deck order.
 */
export function buildInitialQueue(questions: readonly StudyQuestion[]): string[] {
  const missed: StudyQuestion[] = [];
  const unseen: StudyQuestion[] = [];
  const learning: StudyQuestion[] = [];

  for (const question of questions) {
    const progress = question.progress;
    if (progress && progress.last_result === false) missed.push(question);
    else if (!progress || progress.times_seen === 0) unseen.push(question);
    else learning.push(question);
  }

  return [...shuffle(missed), ...shuffle(unseen), ...shuffle(learning)].map((q) => q.id);
}

export function createLearnState(questions: readonly StudyQuestion[]): LearnState {
  const mastery: Record<string, number> = {};
  for (const question of questions) {
    // A question already mastered in the database still has to be proven once
    // more this session, so a Learn run is never empty.
    mastery[question.id] = Math.min(question.progress?.mastery_count ?? 0, MASTERY_TARGET - 1);
  }
  return {
    mastery,
    queue: buildInitialQueue(questions),
    answered: 0,
    correct: 0,
    seen: [],
    missed: [],
  };
}

/**
 * Advance the session by one answer.
 *
 * Correct  -> mastery + 1. At the target the question leaves the queue, other-
 *             wise it is reinserted several questions later.
 * Incorrect-> mastery resets to 0 and the question comes back in 3-7 questions,
 *             far enough that short-term recall does not carry the answer.
 */
export function applyAnswer(state: LearnState, questionId: string, wasCorrect: boolean): LearnState {
  const rest = state.queue.filter((id, index) => !(index === 0 && id === questionId));
  const nextMastery = wasCorrect ? (state.mastery[questionId] ?? 0) + 1 : 0;

  const queue = [...rest];
  if (nextMastery < MASTERY_TARGET) {
    const [min, max] = wasCorrect ? [REVIEW_MIN, REVIEW_MAX] : [REINSERT_MIN, REINSERT_MAX];
    const offset = Math.min(queue.length, randomBetween(min, max));
    queue.splice(offset, 0, questionId);
  }

  return {
    mastery: { ...state.mastery, [questionId]: nextMastery },
    queue,
    answered: state.answered + 1,
    correct: state.correct + (wasCorrect ? 1 : 0),
    seen: state.seen.includes(questionId) ? state.seen : [...state.seen, questionId],
    missed: wasCorrect || state.missed.includes(questionId) ? state.missed : [...state.missed, questionId],
  };
}

export function isComplete(state: LearnState): boolean {
  return state.queue.length === 0;
}

export function countsFor(state: LearnState, questions: readonly StudyQuestion[]) {
  let mastered = 0;
  let learning = 0;
  let unseen = 0;
  const inQueue = new Set(state.queue);
  const seen = new Set(state.seen);

  for (const question of questions) {
    const level = state.mastery[question.id] ?? 0;
    if (!inQueue.has(question.id) || level >= MASTERY_TARGET) mastered += 1;
    else if (level > 0 || seen.has(question.id) || (question.progress?.times_seen ?? 0) > 0) learning += 1;
    else unseen += 1;
  }

  return { mastered, learning, unseen, total: questions.length };
}
