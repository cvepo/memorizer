import { shuffle } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

/**
 * Learn mode is a rolling active pool rather than a shuffled deck.
 *
 * A small working set (~7) is in play at any moment. Answering correctly moves a
 * question up one level and pushes its next appearance further out; missing it
 * knocks it back down and brings it round again soon, but never immediately. A
 * question only leaves the pool once it is Mastered, and a new one takes its
 * place — so the deck is introduced gradually instead of all at once.
 */

export const MASTERY_MASTERED = 3;
export const POOL_SIZE = 7;

export type MasteryLevel = 0 | 1 | 2 | 3;

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  0: "New",
  1: "Learning",
  2: "Familiar",
  3: "Mastered",
};

/** Answers to leave between a question and its next appearance. */
const SPACING: Record<"wrong" | "learning" | "familiar", [number, number]> = {
  wrong: [2, 4],
  learning: [4, 7],
  familiar: [7, 12],
};

export type CheckpointRange = { min: number; max: number };
export const CHECKPOINT_LIMITS = { min: 3, max: 25 } as const;
export const DEFAULT_CHECKPOINT_RANGE: CheckpointRange = { min: 5, max: 10 };

export type QuestionState = {
  mastery: MasteryLevel;
  wrongCount: number;
  /** Lifetime correct answers, seeded from the database. */
  correctCount: number;
  /** Answer index when this was last shown; -1 if never. */
  lastSeen: number;
  /** Earliest answer index at which it may be shown again. */
  dueAt: number;
  /** Whether it has been answered at least once, ever. */
  seen: boolean;
};

export type LearnState = {
  states: Record<string, QuestionState>;
  /** The active working set. */
  pool: string[];
  /** Ids not yet brought into the pool. */
  backlog: string[];
  current: string | null;
  answered: number;
  correct: number;
  streak: number;
  bestStreak: number;
  missed: string[];
  /** Newly mastered since the last checkpoint, and the target that triggers one. */
  masteredSinceCheckpoint: number;
  checkpointTarget: number;
  /** Carried in the state so every answer uses the same range without the
   *  caller having to remember to pass it. */
  checkpointRange: CheckpointRange;
  /** Ids that reached Mastered during this session. */
  masteredThisSession: string[];
  /**
   * Once the whole deck has been mastered the session does not end; it keeps
   * going, drawing the questions you are weakest on. Set the first time the
   * queue would otherwise have run dry.
   */
  endless: boolean;
  /** How many times the deck has been fully mastered this session. */
  laps: number;
};

export type Counts = { new: number; learning: number; familiar: number; mastered: number; total: number };

function randomBetween(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function checkpointTarget(range: CheckpointRange): number {
  const min = Math.max(1, Math.min(range.min, range.max));
  return randomBetween(min, Math.max(min, range.max));
}

const clampLevel = (n: number): MasteryLevel => Math.max(0, Math.min(MASTERY_MASTERED, n)) as MasteryLevel;

/**
 * Where a question sits in the queue for attention.
 * Wrong/weak > Learning > Familiar > New > Mastered.
 */
function tier(state: QuestionState): number {
  if (state.mastery >= MASTERY_MASTERED) return 4;
  if (state.wrongCount > 0 && state.mastery <= 1) return 0;
  if (state.mastery === 1) return 1;
  if (state.mastery === 2) return 2;
  return state.seen ? 1 : 3;
}

/** Mastery after a correct answer: 0→1→2→3, and 3 stays 3. */
export function levelUp(mastery: MasteryLevel): MasteryLevel {
  return clampLevel(mastery + 1);
}

/** Mastery after a miss: 3→1, 2→1, 1→0, 0→0. A slip costs progress, not everything. */
export function levelDown(mastery: MasteryLevel): MasteryLevel {
  if (mastery >= 2) return 1;
  return 0;
}

function spacingFor(mastery: MasteryLevel, wasCorrect: boolean): number {
  if (!wasCorrect) return randomBetween(...SPACING.wrong);
  if (mastery === 1) return randomBetween(...SPACING.learning);
  return randomBetween(...SPACING.familiar);
}

function initialState(question: StudyQuestion): QuestionState {
  const stored = question.progress;
  const mastery = clampLevel(stored?.mastery_count ?? 0);
  return {
    mastery,
    wrongCount: stored?.times_incorrect ?? 0,
    correctCount: stored?.times_correct ?? 0,
    lastSeen: -1,
    dueAt: 0,
    seen: (stored?.times_seen ?? 0) > 0,
  };
}

/**
 * How well a question is known, from 0 (always wrong) to 1 (always right).
 *
 * A Laplace prior keeps an unanswered question near the middle rather than at
 * zero, so "never seen" does not masquerade as "always wrong" and crowd out
 * questions you genuinely keep missing.
 */
export function strengthOf(state: QuestionState): number {
  return (state.correctCount + 1) / (state.correctCount + state.wrongCount + 2);
}

/** Order questions by how much attention they need, shuffled within each tier. */
function byNeed(questions: readonly StudyQuestion[], states: Record<string, QuestionState>): string[] {
  const tiers = new Map<number, StudyQuestion[]>();
  for (const question of questions) {
    const t = tier(states[question.id]);
    const bucket = tiers.get(t);
    if (bucket) bucket.push(question);
    else tiers.set(t, [question]);
  }
  return [...tiers.keys()]
    .sort((a, b) => a - b)
    .flatMap((t) => shuffle(tiers.get(t)!).map((q) => q.id));
}

/**
 * Sample `size` ids, favouring the ones you are weakest on.
 *
 * A shortlist of the N weakest was the obvious approach and is wrong: once the
 * shortlist is as wide as the deck — which it is for any small deck — every
 * question becomes equally likely and the ranking does nothing. Weighting each
 * question by how shaky it is keeps the bias at any deck size, while still
 * letting a well-known question come round occasionally.
 */
function sampleByWeakness(
  ids: readonly string[],
  states: Record<string, QuestionState>,
  size: number,
  exclude: string,
): string[] {
  const pool = ids.filter((id) => id !== exclude);
  if (pool.length <= size) return shuffle(pool);

  // Cubed so the difference between 60% and 90% known is felt, not merely noted.
  const weightOf = (id: string) => Math.max(0.02, (1 - strengthOf(states[id])) ** 3);

  const remaining = [...pool];
  const picked: string[] = [];
  while (picked.length < size && remaining.length > 0) {
    const total = remaining.reduce((sum, id) => sum + weightOf(id), 0);
    let target = Math.random() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      target -= weightOf(remaining[i]);
      if (target <= 0) { index = i; break; }
    }
    picked.push(remaining[index]);
    remaining.splice(index, 1);
  }
  return picked;
}

export function createLearnState(
  questions: readonly StudyQuestion[],
  range: CheckpointRange = DEFAULT_CHECKPOINT_RANGE,
): LearnState {
  const states: Record<string, QuestionState> = {};
  for (const question of questions) states[question.id] = initialState(question);

  const unmastered = questions.filter((q) => states[q.id].mastery < MASTERY_MASTERED);
  const ordered = byNeed(unmastered, states);
  let pool = ordered.slice(0, POOL_SIZE);
  let backlog = ordered.slice(POOL_SIZE);

  if (unmastered.length === 0 && questions.length > 0) {
    pool = sampleByWeakness(questions.map((q) => q.id), states, POOL_SIZE, "");
    backlog = [];
  }

  return {
    states,
    pool,
    backlog,
    current: pool[0] ?? null,
    answered: 0,
    correct: 0,
    streak: 0,
    bestStreak: 0,
    missed: [],
    masteredSinceCheckpoint: 0,
    checkpointTarget: checkpointTarget(range),
    checkpointRange: range,
    masteredThisSession: [],
    // A deck that is already fully mastered starts straight into review.
    endless: unmastered.length === 0,
    laps: 0,
  };
}

/**
 * Choose what to show next: the neediest question whose spacing has elapsed,
 * never the one just answered. Ties are broken randomly so a run of Learning
 * questions does not always come back in the same order.
 */
function pickNext(state: LearnState, justAnswered: string | null): string | null {
  if (state.pool.length === 0) return null;

  const eligible = state.pool.filter((id) => id !== justAnswered);
  const candidates = eligible.length > 0 ? eligible : state.pool;

  const due = candidates.filter((id) => state.states[id].dueAt <= state.answered);
  const from = due.length > 0 ? due : candidates;

  const sorted = [...from].sort((a, b) => {
    const byTier = tier(state.states[a]) - tier(state.states[b]);
    if (byTier !== 0) return byTier;
    return state.states[a].dueAt - state.states[b].dueAt;
  });

  const bestTier = tier(state.states[sorted[0]]);
  const topGroup = sorted.filter((id) => tier(state.states[id]) === bestTier);
  return topGroup[Math.floor(Math.random() * Math.min(topGroup.length, 3))];
}

export type AnswerOutcome = {
  state: LearnState;
  /** True when this answer took the question to Mastered. */
  mastered: boolean;
  /** True when enough questions have been mastered to pause for a checkpoint. */
  checkpoint: boolean;
};

export function applyAnswer(
  state: LearnState,
  questionId: string,
  wasCorrect: boolean,
): AnswerOutcome {
  const previous = state.states[questionId];
  if (!previous) return { state, mastered: false, checkpoint: false };

  const answered = state.answered + 1;
  const mastery = wasCorrect ? levelUp(previous.mastery) : levelDown(previous.mastery);
  const becameMastered = mastery >= MASTERY_MASTERED && previous.mastery < MASTERY_MASTERED;

  const updated: QuestionState = {
    mastery,
    wrongCount: previous.wrongCount + (wasCorrect ? 0 : 1),
    correctCount: previous.correctCount + (wasCorrect ? 1 : 0),
    lastSeen: answered,
    dueAt: answered + spacingFor(mastery, wasCorrect),
    seen: true,
  };

  const states = { ...state.states, [questionId]: updated };

  // A mastered question leaves the pool and a fresh one takes its place.
  let pool = state.pool;
  let backlog = state.backlog;
  if (mastery >= MASTERY_MASTERED) {
    pool = pool.filter((id) => id !== questionId);
    while (pool.length < POOL_SIZE && backlog.length > 0) {
      const [next, ...rest] = backlog;
      backlog = rest;
      pool = [...pool, next];
    }
  }

  // Nothing left to master: keep going with whatever is weakest rather than
  // ending the session.
  let endless = state.endless;
  let laps = state.laps;
  if (pool.length === 0 && backlog.length === 0) {
    const all = Object.keys(states);
    if (all.length > 0) {
      if (!endless) laps += 1;
      endless = true;
      pool = sampleByWeakness(all, states, POOL_SIZE, questionId);
    }
  }

  const masteredSinceCheckpoint = state.masteredSinceCheckpoint + (becameMastered ? 1 : 0);
  const reachedCheckpoint =
    becameMastered && masteredSinceCheckpoint >= state.checkpointTarget && pool.length > 0;

  const next: LearnState = {
    states,
    pool,
    backlog,
    current: null,
    answered,
    correct: state.correct + (wasCorrect ? 1 : 0),
    streak: wasCorrect ? state.streak + 1 : 0,
    bestStreak: wasCorrect ? Math.max(state.bestStreak, state.streak + 1) : state.bestStreak,
    missed: wasCorrect || state.missed.includes(questionId) ? state.missed : [...state.missed, questionId],
    masteredSinceCheckpoint: reachedCheckpoint ? 0 : masteredSinceCheckpoint,
    checkpointTarget: reachedCheckpoint
      ? checkpointTarget(state.checkpointRange)
      : state.checkpointTarget,
    checkpointRange: state.checkpointRange,
    masteredThisSession: becameMastered
      ? [...state.masteredThisSession, questionId]
      : state.masteredThisSession,
    endless,
    laps,
  };

  return {
    state: { ...next, current: pickNext(next, questionId) },
    mastered: becameMastered,
    checkpoint: reachedCheckpoint,
  };
}

/** Endless review never finishes; it only runs out if the deck is empty. */
export function isComplete(state: LearnState): boolean {
  return state.pool.length === 0 && state.backlog.length === 0;
}

export function countsFor(state: LearnState, questions: readonly StudyQuestion[]): Counts {
  const counts: Counts = { new: 0, learning: 0, familiar: 0, mastered: 0, total: questions.length };
  for (const question of questions) {
    const level = state.states[question.id]?.mastery ?? 0;
    if (level >= MASTERY_MASTERED) counts.mastered += 1;
    else if (level === 2) counts.familiar += 1;
    else if (level === 1) counts.learning += 1;
    else if (state.states[question.id]?.seen) counts.learning += 1;
    else counts.new += 1;
  }
  return counts;
}

export function remainingCount(state: LearnState): number {
  return state.pool.length + state.backlog.length;
}

/** Change how often checkpoints appear without disturbing the session. */
export function withCheckpointRange(state: LearnState, range: CheckpointRange): LearnState {
  return {
    ...state,
    checkpointRange: range,
    checkpointTarget: Math.max(1, Math.min(state.checkpointTarget, range.max)),
  };
}
