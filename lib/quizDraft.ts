"use client";

/**
 * A localStorage-backed draft of an in-progress quiz.
 *
 * The draft holds everything needed to put the screen back exactly as it was:
 * the questions in the order they were shown, each question's choices in the
 * order they were shown, the selections, the position, which questions have
 * already revealed their feedback, and the settings the quiz was started with.
 *
 * It also carries the `attemptId` generated when the quiz started. Submission
 * reuses that id, so retrying a failed submit reuses one `quiz_attempts` row
 * and the per-answer event ids derived from it cannot apply mastery twice.
 *
 * Nothing here throws. A missing, corrupt or foreign-shaped draft reads as
 * absent, because a broken draft must never be able to break the quiz page.
 */

export const QUIZ_DRAFT_VERSION = 2;

const KEY_PREFIX = "memorizer-quiz-draft:";

export type QuizDraftPool = "all" | "missed" | "unmastered" | "mastered";
export type QuizDraftFeedback = "end" | "each";
export type QuizDraftCount = number | "all";

export type QuizDraftSettings = {
  countChoice: QuizDraftCount;
  pool: QuizDraftPool;
  selectedTopics: string[];
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  feedback: QuizDraftFeedback;
};

/** One question as it was displayed, with its choices in display order. */
export type QuizDraftItem = {
  questionId: string;
  /** Kept so a later edit to the question can be detected, not to render. */
  questionText: string;
  correctAnswer: string;
  choices: { text: string; isCorrect: boolean }[];
};

export type QuizDraft = {
  version: number;
  profileId: string;
  deckId: string;
  attemptId: string;
  /** Selected questions in display order. */
  items: QuizDraftItem[];
  /** Selected answer text per item, index-aligned with `items`. */
  answers: (string | null)[];
  /** Whether each item has already shown its feedback. */
  revealed: boolean[];
  index: number;
  settings: QuizDraftSettings;
  startedAt: string;
  savedAt: string;
};

export type QuizDraftInput = Omit<QuizDraft, "version" | "savedAt">;

export function draftKey(profileId: string, deckId: string): string {
  return `${KEY_PREFIX}${profileId}:${deckId}`;
}

/** A fresh attempt id. Falls back for browsers without `crypto.randomUUID`. */
export function newAttemptId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Some embedded browsers throw on crypto access over plain http.
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/** The event id submitted for one answer: stable across resubmissions. */
/**
 * A stable id for "this question, within this attempt".
 *
 * It has to be a real UUID — answer_events.id is a uuid column, and a composite
 * string is rejected by Postgres — and it has to be identical every time the
 * same attempt is submitted, or a retry would count the answer twice. XORing
 * the two UUIDs byte-wise gives both: deterministic, valid, and requiring
 * nothing to be stored or carried between attempts.
 */
export function answerEventId(attemptId: string, questionId: string): string {
  const hexOf = (id: string) => id.replace(/-/g, "");
  const a = hexOf(attemptId);
  const b = hexOf(questionId);

  // Anything that is not a pair of UUIDs cannot be combined this way; fall back
  // to a fresh id, which is still correct, just not stable across retries.
  if (a.length !== 32 || b.length !== 32 || !/^[0-9a-f]{32}$/i.test(a) || !/^[0-9a-f]{32}$/i.test(b)) {
    return newAttemptId();
  }

  let mixed = "";
  for (let i = 0; i < 32; i++) {
    mixed += (parseInt(a[i], 16) ^ parseInt(b[i], 16)).toString(16);
  }
  return `${mixed.slice(0, 8)}-${mixed.slice(8, 12)}-${mixed.slice(12, 16)}-${mixed.slice(16, 20)}-${mixed.slice(20)}`;
}

const isString = (value: unknown): value is string => typeof value === "string";

function parseSettings(value: unknown): QuizDraftSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const count = raw.countChoice;
  const countChoice: QuizDraftCount | null =
    count === "all" ? "all" : typeof count === "number" && Number.isFinite(count) ? count : null;
  if (countChoice === null) return null;

  const pool = raw.pool;
  if (pool !== "all" && pool !== "missed" && pool !== "unmastered" && pool !== "mastered") return null;

  const feedback = raw.feedback;
  if (feedback !== "end" && feedback !== "each") return null;

  if (!Array.isArray(raw.selectedTopics) || !raw.selectedTopics.every(isString)) return null;
  if (typeof raw.shuffleQuestions !== "boolean") return null;
  if (typeof raw.shuffleChoices !== "boolean") return null;

  return {
    countChoice,
    pool,
    selectedTopics: [...raw.selectedTopics],
    shuffleQuestions: raw.shuffleQuestions,
    shuffleChoices: raw.shuffleChoices,
    feedback,
  };
}

function parseItem(value: unknown): QuizDraftItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isString(raw.questionId) || !isString(raw.questionText) || !isString(raw.correctAnswer)) {
    return null;
  }
  if (!Array.isArray(raw.choices) || raw.choices.length === 0) return null;

  const choices: { text: string; isCorrect: boolean }[] = [];
  for (const choice of raw.choices) {
    if (typeof choice !== "object" || choice === null) return null;
    const c = choice as Record<string, unknown>;
    if (!isString(c.text) || typeof c.isCorrect !== "boolean") return null;
    choices.push({ text: c.text, isCorrect: c.isCorrect });
  }

  return {
    questionId: raw.questionId,
    questionText: raw.questionText,
    correctAnswer: raw.correctAnswer,
    choices,
  };
}

function parseDraft(value: unknown, profileId: string, deckId: string): QuizDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (raw.version !== QUIZ_DRAFT_VERSION) return null;
  if (raw.profileId !== profileId || raw.deckId !== deckId) return null;
  if (!isString(raw.attemptId) || !raw.attemptId) return null;
  if (!isString(raw.startedAt) || !isString(raw.savedAt)) return null;

  const settings = parseSettings(raw.settings);
  if (!settings) return null;

  if (!Array.isArray(raw.items) || raw.items.length === 0) return null;
  const items: QuizDraftItem[] = [];
  for (const entry of raw.items) {
    const item = parseItem(entry);
    if (!item) return null;
    items.push(item);
  }

  if (!Array.isArray(raw.answers) || raw.answers.length !== items.length) return null;
  if (!raw.answers.every((a) => a === null || isString(a))) return null;
  const answers = raw.answers as (string | null)[];

  if (!Array.isArray(raw.revealed) || raw.revealed.length !== items.length) return null;
  if (!raw.revealed.every((r) => typeof r === "boolean")) return null;
  const revealed = [...raw.revealed] as boolean[];

  const index = typeof raw.index === "number" && Number.isInteger(raw.index) ? raw.index : 0;

  return {
    version: QUIZ_DRAFT_VERSION,
    profileId,
    deckId,
    attemptId: raw.attemptId,
    items,
    answers,
    revealed,
    index: Math.min(Math.max(index, 0), items.length - 1),
    settings,
    startedAt: raw.startedAt,
    savedAt: raw.savedAt,
  };
}

/** The stored draft for this profile+deck, or null if there is none to trust. */
export function readDraft(profileId: string, deckId: string): QuizDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(profileId, deckId));
    if (!raw) return null;
    const draft = parseDraft(JSON.parse(raw), profileId, deckId);
    if (!draft) {
      // Unreadable drafts are cleared so they cannot shadow the next quiz.
      clearDraft(profileId, deckId);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft(draft: QuizDraftInput): void {
  try {
    const stored: QuizDraft = {
      ...draft,
      version: QUIZ_DRAFT_VERSION,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(draftKey(draft.profileId, draft.deckId), JSON.stringify(stored));
  } catch {
    // Private mode or a full quota: the quiz still works, it just cannot resume.
  }
}

export function clearDraft(profileId: string, deckId: string): void {
  try {
    localStorage.removeItem(draftKey(profileId, deckId));
  } catch {
    // Nothing to do — there is no draft we could have removed.
  }
}

/** How many of the draft's questions have an answer selected. */
export function answeredCount(draft: QuizDraft): number {
  return draft.answers.filter((a) => a !== null).length;
}

/**
 * What no longer lines up between a draft and the deck as it is now.
 * `missing` questions were deleted; `changed` ones had their text or correct
 * answer edited, so grading them against the stored choices would grade
 * different content than the student read.
 */
export type DraftConflict = {
  missing: string[];
  changed: string[];
  /** Question ids that are still safe to grade. */
  valid: string[];
};

export type DeckQuestionShape = {
  id: string;
  question_text: string;
  correct_answer: string;
};

/** Returns null when the draft still matches the deck exactly. */
export function validateDraft(
  draft: QuizDraft,
  deckQuestions: readonly DeckQuestionShape[],
): DraftConflict | null {
  const byId = new Map(deckQuestions.map((q) => [q.id, q]));
  const conflict: DraftConflict = { missing: [], changed: [], valid: [] };

  for (const item of draft.items) {
    const question = byId.get(item.questionId);
    if (!question) {
      conflict.missing.push(item.questionId);
      continue;
    }
    if (
      question.question_text !== item.questionText ||
      question.correct_answer !== item.correctAnswer
    ) {
      conflict.changed.push(item.questionId);
      continue;
    }
    conflict.valid.push(item.questionId);
  }

  if (conflict.missing.length === 0 && conflict.changed.length === 0) return null;
  return conflict;
}

/**
 * Drop the conflicting questions and keep the rest, with their answers and
 * order intact, so a student resumes the work that is still gradeable instead
 * of losing the whole attempt.
 */
export function pruneDraft(draft: QuizDraft, conflict: DraftConflict): QuizDraft {
  const keep = new Set(conflict.valid);
  const items: QuizDraftItem[] = [];
  const answers: (string | null)[] = [];
  const revealed: boolean[] = [];
  let keptBeforeIndex = 0;

  draft.items.forEach((item, i) => {
    if (!keep.has(item.questionId)) return;
    if (i < draft.index) keptBeforeIndex += 1;
    items.push(item);
    answers.push(draft.answers[i] ?? null);
    revealed.push(draft.revealed[i] ?? false);
  });

  return {
    ...draft,
    items,
    answers,
    revealed,
    index: Math.min(keptBeforeIndex, Math.max(items.length - 1, 0)),
  };
}
