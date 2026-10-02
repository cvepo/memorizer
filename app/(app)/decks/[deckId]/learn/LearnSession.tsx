"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { KeyboardHints, type KeyHint } from "@/components/KeyboardHints";
import { MCQOption, OPTION_LABELS, type OptionState } from "@/components/MCQOption";
import { Mascot, type MascotState } from "@/components/Mascot";
import { RangeSlider } from "@/components/RangeSlider";
import { SaveStatus } from "@/components/SaveStatus";
import { StarButton } from "@/components/StarButton";
import { BadgeCelebration } from "@/components/BadgeCelebration";
import { Button, ButtonLink, Card, ProgressBar, Stat, cn } from "@/components/ui";
import { getPendingBadges } from "@/lib/actions/badges";
import { recordAnswers, resetDeckProgress } from "@/lib/actions/study";
import type { EarnedBadge } from "@/lib/badges";
import { AnswerQueue, newEventId, type QueueStatus } from "@/lib/answerQueue";
import { generateChoices, maxAvailableChoices, type Choice } from "@/lib/distractors";
import {
  CHECKPOINT_LIMITS,
  DEFAULT_CHECKPOINT_RANGE,
  MASTERY_MASTERED,
  applyAnswer,
  countsFor,
  createLearnState,
  isComplete,
  withCheckpointRange,
  type CheckpointRange,
  type Counts,
  type LearnState,
} from "@/lib/learnAlgorithm";
import type { StudyQuestion } from "@/lib/types";

const KEY_TO_INDEX: Record<string, number | undefined> = {
  "1": 0, "2": 1, "3": 2, "4": 3,
  a: 0, b: 1, c: 2, d: 3,
};

const AUTO_ADVANCE_MS = 700;

/** Built from the same table the handler uses, so the legend cannot describe a
 *  key that is not actually bound. */
function optionHints(count: number): KeyHint[] {
  return Array.from({ length: Math.min(count, 4) }, (_, i) => ({
    keys: [String(i + 1), (OPTION_LABELS[i] ?? "").toLowerCase()],
    label: `Answer ${OPTION_LABELS[i] ?? i + 1}`,
  }));
}

const NEXT_HINT: KeyHint = { keys: ["Enter", "Space", "→"], label: "Next question" };
const CELEBRATION_STREAK = 5;
const RANGE_STORAGE_KEY = "memorizer-checkpoint-range";
/** Stable reference so `useSyncExternalStore` does not loop before the queue exists. */
const IDLE_SAVE: QueueStatus = { kind: "idle" };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function readStoredRange(): CheckpointRange | null {
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckpointRange>;
    if (typeof parsed.min !== "number" || typeof parsed.max !== "number") return null;
    const min = Math.min(Math.max(parsed.min, CHECKPOINT_LIMITS.min), CHECKPOINT_LIMITS.max);
    const max = Math.min(Math.max(parsed.max, min), CHECKPOINT_LIMITS.max);
    return { min, max };
  } catch {
    return null;
  }
}

/** Small coloured tally of how the deck is spread across the four levels. */
function LevelCounts({ counts, className }: { counts: Counts; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-sm", className)}>
      <span className="text-success tabular-nums">{counts.mastered} mastered</span>
      <span className="text-accent tabular-nums">{counts.familiar} familiar</span>
      <span className="text-ink tabular-nums">{counts.learning} learning</span>
      <span className="text-muted tabular-nums">{counts.new} new</span>
    </div>
  );
}

type LearnSessionProps = {
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
  profileId: string;
  starredIds: string[];
  /** The caller picked these questions by id, so already-mastered ones belong in the pool. */
  focusedReview?: boolean;
};

/**
 * Wraps the session with the badge celebration. Badges waiting from earlier are
 * fetched when the session opens; new ones arrive with each saved answer. The
 * celebration owns showing each badge once and marking it seen.
 */
export function LearnSession(props: LearnSessionProps) {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);

  const addBadges = useCallback((incoming: EarnedBadge[]) => {
    setBadges((current) => {
      const known = new Set(current.map((b) => b.key));
      const added = incoming.filter((b) => !known.has(b.key));
      return added.length > 0 ? [...current, ...added] : current;
    });
  }, []);

  useEffect(() => {
    let active = true;
    getPendingBadges()
      .then((pending) => {
        if (active) addBadges(pending);
      })
      .catch(() => {
        // Badges are a bonus; a failed read must never get in the way of studying.
      });
    return () => {
      active = false;
    };
  }, [addBadges]);

  return (
    <>
      <LearnSessionView {...props} onBadges={addBadges} />
      <BadgeCelebration badges={badges} />
    </>
  );
}

function LearnSessionView({
  deckId,
  deckName,
  questions,
  profileId,
  starredIds,
  focusedReview = false,
  onBadges,
}: LearnSessionProps & { onBadges: (badges: EarnedBadge[]) => void }) {
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  /**
   * A server action — starring, for instance — makes Next re-render this
   * route's server components, which hands back a new `questions` array. That
   * new identity must not be allowed to retrigger choice generation, or the
   * options would reshuffle under the reader mid-question. The pool is read
   * through a ref so only the question actually on screen drives that effect.
   */
  const questionsRef = useRef(questions);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  // A focused review is explicitly about this handful of questions, so a
  // Mastered one is seeded a level short and rejoins the pool: one correct
  // answer clears it again. Only the seed is lowered — stored mastery is
  // untouched unless the question is actually missed.
  const seedQuestions = useMemo(() => {
    if (!focusedReview) return questions;
    return questions.map((question) => {
      const progress = question.progress;
      if (!progress || progress.mastery_count < MASTERY_MASTERED) return question;
      return { ...question, progress: { ...progress, mastery_count: MASTERY_MASTERED - 1 } };
    });
  }, [focusedReview, questions]);

  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  const queueRef = useRef<AnswerQueue | null>(null);
  const [starred, setStarred] = useState<Set<string>>(() => new Set(starredIds));
  const [range, setRange] = useState<CheckpointRange>(DEFAULT_CHECKPOINT_RANGE);
  const [state, setState] = useState<LearnState | null>(null);

  const [phase, setPhase] = useState<"answering" | "feedback" | "checkpoint" | "lap" | "done">("answering");
  const [selected, setSelected] = useState<string | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [presentation, setPresentation] = useState(0);
  const [presented, setPresented] = useState<{ key: string; choices: Choice[] } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  /** Counts captured when a checkpoint fired, so the panel is a snapshot. */
  const [checkpointCounts, setCheckpointCounts] = useState<Counts | null>(null);

  // The opening pool is shuffled within tiers, so it has to be built after
  // mount or the server and the client would disagree on the first question.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const saved = readStoredRange();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setRange(saved);
    setState(createLearnState(seedQuestions, saved ?? DEFAULT_CHECKPOINT_RANGE));
    setReady(true);
  }, [seedQuestions, profileId]);

  /**
   * The queue is created on demand rather than in a mount effect.
   *
   * React re-invokes mount effects in development, so a queue created in one
   * effect and destroyed by another can end up destroyed and never rebuilt —
   * and because `enqueue` is reached through an optional chain, every answer
   * after that point is silently dropped. Building it lazily means it cannot
   * be missing at the moment it is needed.
   */
  const getQueue = useCallback(() => {
    if (!queueRef.current) {
      const queue = new AnswerQueue(profileId, (answers) => recordAnswers(answers, "learn"), onBadges);
      queueRef.current = queue;
      // Answers stored before a refresh or a crash are still owed to the server.
      if (queue.pendingCount > 0) void queue.flush();
    }
    return queueRef.current;
  }, [profileId, onBadges]);

  useEffect(
    () => () => {
      queueRef.current?.destroy();
      queueRef.current = null;
    },
    [],
  );

  const subscribeSave = useCallback(
    (onChange: () => void) => {
      const queue = getQueue();
      const unsubscribe = queue.subscribe(onChange);
      // Pick up whatever state it already had, e.g. work restored from storage.
      onChange();
      return unsubscribe;
    },
    [getQueue],
  );
  const readSaveStatus = useCallback(() => queueRef.current?.getStatus() ?? IDLE_SAVE, []);
  const saveStatus = useSyncExternalStore(subscribeSave, readSaveStatus, () => IDLE_SAVE);
  const retrySave = useCallback(() => getQueue().retry(), [getQueue]);

  const toggleStar = useCallback((questionId: string, next: boolean) => {
    setStarred((previous) => {
      const updated = new Set(previous);
      if (next) updated.add(questionId);
      else updated.delete(questionId);
      return updated;
    });
  }, []);

  const currentId = state?.current ?? null;
  const question = currentId ? byId.get(currentId) ?? null : null;
  const presentationKey = `${presentation}:${currentId ?? ""}`;

  useEffect(() => {
    if (!currentId) return;
    const pool = questionsRef.current;
    const showing = pool.find((q) => q.id === currentId);
    if (!showing) return;
    // Deferred to an effect because generateChoices is random: running it
    // during render would disagree between server and client.
    setPresented({ key: presentationKey, choices: generateChoices(showing, pool) });
  }, [presentationKey, currentId]);

  const choices = presented && presented.key === presentationKey ? presented.choices : null;

  const counts = useMemo(
    () =>
      state
        ? countsFor(state, questions)
        : { new: questions.length, learning: 0, familiar: 0, mastered: 0, total: questions.length },
    [state, questions],
  );

  const available = useMemo(
    () => (question ? maxAvailableChoices(question, questions) : 4),
    [question, questions],
  );

  const updateRange = useCallback((next: CheckpointRange) => {
    setRange(next);
    setState((previous) => (previous ? withCheckpointRange(previous, next) : previous));
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Preference just will not persist.
    }
  }, []);

  const grade = useCallback(
    (choice: Choice) => {
      if (phase !== "answering" || !question) return;
      setSelected(choice.text);
      setWasCorrect(choice.isCorrect);
      setPhase("feedback");
      // Returns immediately: the queue owns durability, the UI never waits.
      getQueue().enqueue({
        eventId: newEventId(),
        questionId: question.id,
        wasCorrect: choice.isCorrect,
      });
    },
    [phase, question, getQueue],
  );

  const advance = useCallback(() => {
    if (phase !== "feedback" || !question || wasCorrect === null || !state) return;
    const outcome = applyAnswer(state, question.id, wasCorrect);
    setState(outcome.state);

    if (outcome.state.laps > state.laps) {
      // The deck has just been cleared. Endless review carries on underneath;
      // this is a milestone to acknowledge, not the end of the session.
      setCheckpointCounts(countsFor(outcome.state, questions));
      setPhase("lap");
    } else if (isComplete(outcome.state)) {
      setPhase("done");
    } else if (outcome.checkpoint) {
      setCheckpointCounts(countsFor(outcome.state, questions));
      setPhase("checkpoint");
    } else {
      setPhase("answering");
    }

    setPresentation((n) => n + 1);
    setSelected(null);
    setWasCorrect(null);
  }, [phase, question, wasCorrect, state, questions]);

  /** Clear stored progress, then start the session over from a clean slate. */
  const runReset = useCallback(() => {
    setResetting(true);
    setResetError(null);
    startTransition(async () => {
      try {
        await resetDeckProgress(deckId);
        const fresh = questions.map((q) => ({ ...q, progress: null }));
        setState(createLearnState(fresh, range));
        setCheckpointCounts(null);
        setPhase("answering");
        setSelected(null);
        setWasCorrect(null);
        setPresentation((n) => n + 1);
        setResetArmed(false);
      } catch (e) {
        setResetError(e instanceof Error ? e.message : "Could not reset progress.");
      } finally {
        setResetting(false);
      }
    });
  }, [deckId, questions, range]);

  const restart = useCallback(() => {
    setState(createLearnState(seedQuestions, range));
    setPhase("answering");
    setSelected(null);
    setWasCorrect(null);
    setCheckpointCounts(null);
    setPresentation((n) => n + 1);
  }, [seedQuestions, range]);

  // A correct answer with nothing to read moves on by itself. Misses wait.
  useEffect(() => {
    if (phase !== "feedback" || wasCorrect !== true || question?.explanation) return;
    const timer = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [phase, wasCorrect, question, advance]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      // Enter, Space or the right arrow all move on. The arrow matters most
      // after a miss, where the feedback panel is worth reading first and
      // reaching for Enter means leaving the arrow keys.
      if (phase === "feedback") {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
          event.preventDefault();
          advance();
        }
        return;
      }

      if (phase === "checkpoint" || phase === "lap") {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
          event.preventDefault();
          setPhase("answering");
        }
        return;
      }

      if (phase !== "answering") return;

      const index = KEY_TO_INDEX[event.key.toLowerCase()];
      if (index === undefined) return;
      const choice = choices?.[index];
      if (!choice) return;
      event.preventDefault();
      grade(choice);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, choices, advance, grade]);

  const breadcrumb = (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={`/decks/${deckId}`}
        aria-label={`Back to ${deckName}`}
        className="min-w-0 truncate text-sm text-muted transition-colors hover:text-ink"
      >
        ← {deckName}
      </Link>
      <ButtonLink href={`/decks/${deckId}`} variant="ghost" size="sm">
        Exit
      </ButtonLink>
    </div>
  );

  const accuracy = (answered: number, correct: number) =>
    answered > 0 ? Math.round((correct / answered) * 100) : 0;

  if (!ready || !state) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <div className="h-2 w-full rounded-full bg-sunken" />
        <div className="h-8 w-2/3 rounded-lg bg-sunken" />
        <span className="sr-only">Preparing your session…</span>
      </div>
    );
  }

  // ------------------------------------------------------------- finished ---

  if (phase === "done") {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-6 py-10 text-center">
          <div className="flex justify-center">
            <Mascot state="complete" size="lg" replayKey="done" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Deck Mastered</h1>
            <p className="tabular-nums text-success">
              {counts.total} / {counts.total} mastered
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            <Stat label="Accuracy" value={`${accuracy(state.answered, state.correct)}%`} />
            <Stat label="Questions answered" value={state.answered} tone="muted" />
            <Stat label="Best streak" value={state.bestStreak} tone="accent" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {state.missed.length > 0 ? (
              <ButtonLink href={`/decks/${deckId}/learn?ids=${state.missed.join(",")}`}>
                Review Missed
              </ButtonLink>
            ) : null}
            <Button variant="secondary" onClick={restart}>
              Study Again
            </Button>
            <ButtonLink href={`/decks/${deckId}/quiz`} variant="secondary">
              Take Quiz
            </ButtonLink>
            <ButtonLink href={`/decks/${deckId}`} variant="ghost">
              Back to Deck
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  // ----------------------------------------------------------- checkpoint ---

  if (phase === "lap" && checkpointCounts) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-6 py-10 text-center">
          <div className="flex justify-center">
            <Mascot state="complete" size="lg" replayKey={state.laps} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {state.laps > 1 ? `Deck mastered ×${state.laps}` : "Deck Mastered"}
            </h1>
            <p className="tabular-nums text-success">
              {checkpointCounts.total} / {checkpointCounts.total} mastered
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Learn keeps going from here, bringing back whichever questions you are weakest
              on rather than stopping.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            <Stat label="Accuracy" value={`${accuracy(state.answered, state.correct)}%`} />
            <Stat label="Questions answered" value={state.answered} tone="muted" />
            <Stat label="Best streak" value={state.bestStreak} tone="accent" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" autoFocus onClick={() => setPhase("answering")}>
              Keep practising
            </Button>
            {state.missed.length > 0 ? (
              <ButtonLink href={`/decks/${deckId}/learn?ids=${state.missed.join(",")}`} variant="secondary">
                Review missed
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/decks/${deckId}/quiz`} variant="secondary">
              Take Quiz
            </ButtonLink>
            <ButtonLink href={`/decks/${deckId}`} variant="ghost">
              Finish for now
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === "checkpoint" && checkpointCounts) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-6 py-8 text-center">
          <div className="flex justify-center">
            <Mascot state="checkpoint" size="lg" replayKey={checkpointCounts.mastered} />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {checkpointCounts.mastered} mastered
            </h1>
            <p className="text-sm text-muted">
              {accuracy(state.answered, state.correct)}% accuracy over {state.answered} answers
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            <Stat label="Mastered" value={checkpointCounts.mastered} tone="success" />
            <Stat label="Familiar" value={checkpointCounts.familiar} tone="accent" />
            <Stat label="Learning" value={checkpointCounts.learning} />
            <Stat label="Remaining" value={checkpointCounts.new} tone="muted" />
          </div>

          <ProgressBar value={checkpointCounts.mastered} total={checkpointCounts.total} />

          <div className="flex flex-wrap justify-center gap-2">
            <Button size="lg" autoFocus onClick={() => setPhase("answering")}>
              Keep going
            </Button>
            <ButtonLink href={`/decks/${deckId}`} variant="ghost">
              Finish for now
            </ButtonLink>
          </div>

          <div className="border-t border-line pt-4 text-left">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              aria-expanded={showSettings}
              className="flex w-full items-center justify-between gap-3 text-sm text-muted transition-colors hover:text-ink"
            >
              <span>
                Checkpoint every{" "}
                <span className="tabular-nums">
                  {range.min}–{range.max}
                </span>{" "}
                mastered
              </span>
              <span aria-hidden className="text-xs">
                {showSettings ? "Hide" : "Change"}
              </span>
            </button>
            {showSettings ? (
              <div className="mt-4 space-y-5">
                <RangeSlider
                  label="Questions mastered between checkpoints"
                  min={CHECKPOINT_LIMITS.min}
                  max={CHECKPOINT_LIMITS.max}
                  value={range}
                  onChange={updateRange}
                />

                <div className="space-y-2 border-t border-line pt-4">
                  <p className="text-sm font-medium">Reset this deck</p>
                  <p className="text-xs text-muted">
                    Sets every question in this deck back to New for you. Mastery, accuracy and
                    review flags are cleared; starred questions are kept.
                  </p>
                  {resetArmed ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="danger" size="sm" disabled={resetting} onClick={runReset}>
                        {resetting ? "Resetting…" : "Yes, reset everything"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setResetArmed(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setResetArmed(true)}>
                      Reset progress
                    </Button>
                  )}
                  {resetError ? <p className="text-xs text-danger">{resetError}</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <p className="text-xs text-muted">Your progress is saved as you go.</p>
            <SaveStatus status={saveStatus} onRetry={retrySave} />
          </div>
        </Card>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-4 py-10 text-center">
          <p className="font-medium">This session could not be continued</p>
          <p className="text-sm text-muted">The next question is no longer available.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={restart}>
              Study Again
            </Button>
            <ButtonLink href={`/decks/${deckId}`} variant="ghost">
              Back to Deck
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const optionState = (choice: Choice): OptionState => {
    if (phase === "answering") return "idle";
    if (choice.text === selected) return choice.isCorrect ? "correct" : "incorrect";
    if (choice.isCorrect) return "missed";
    return "idle";
  };

  const mascotState: MascotState =
    phase !== "feedback"
      ? "idle"
      : wasCorrect
        ? state.streak >= CELEBRATION_STREAK
          ? "celebrate"
          : "correct"
        : "wrong";

  const level = state.states[question.id]?.mastery ?? 0;

  return (
    <div className="space-y-6">
      {breadcrumb}

      {focusedReview ? (
        <p className="text-sm text-muted">
          Focused review — only these questions, including ones you have already mastered.
        </p>
      ) : null}

      <div className="sticky top-14 z-10 -mx-4 space-y-2 border-b border-line bg-bg px-4 pb-3 pt-2 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {/* The four-level breakdown is detail, not navigation: on a phone the
              header keeps mastered/total and the streak instead. */}
          <LevelCounts counts={counts} className="hidden sm:flex" />
          <div className="ml-auto flex items-center gap-2">
            <Mascot state={mascotState} size="sm" replayKey={state.answered} />
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors",
                state.streak >= 3 ? "tint-accent text-ink" : "border-line text-muted",
              )}
              aria-label={`Current streak: ${state.streak} correct in a row`}
            >
              Streak {state.streak}
              {state.bestStreak > state.streak ? (
                <span className="text-muted"> · best {state.bestStreak}</span>
              ) : null}
            </span>
          </div>
        </div>
        <ProgressBar value={counts.mastered} total={counts.total} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm tabular-nums text-muted">
            {counts.mastered} / {counts.total} mastered
          </p>
          <SaveStatus status={saveStatus} onRetry={retrySave} />
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2 className="break-words text-xl font-medium leading-snug sm:text-2xl">
              {question.question_text}
            </h2>
            <p className="text-xs text-muted">
              {question.topic ? `${question.topic} · ` : ""}
              {level === 0
                ? "New question"
                : `${MASTERY_MASTERED - level} more correct to master`}
            </p>
            {available < 4 ? (
              <p className="text-xs text-muted">
                This deck can only produce {available} unique choices for this question.
              </p>
            ) : null}
          </div>
          <StarButton
            key={question.id}
            questionId={question.id}
            starred={starred.has(question.id)}
            size="sm"
            onChange={(next) => toggleStar(question.id, next)}
          />
        </div>

        <div className="space-y-3">
          {(choices ?? []).map((choice, index) => (
            <MCQOption
              key={`${presentationKey}:${choice.text}`}
              label={OPTION_LABELS[index] ?? String(index + 1)}
              text={choice.text}
              state={optionState(choice)}
              onSelect={() => grade(choice)}
              disabled={phase === "feedback"}
            />
          ))}
        </div>

        <div aria-live="polite">
          {phase === "feedback" && wasCorrect !== null ? (
            <div className={cn("rounded-xl border p-4", wasCorrect ? "tint-success" : "tint-danger")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className={cn("font-medium", wasCorrect ? "text-success" : "text-danger")}>
                  {wasCorrect ? "Correct" : "Incorrect"}
                </p>
                {wasCorrect && state.streak >= 2 ? (
                  <p className="text-xs tabular-nums text-muted">{state.streak} in a row</p>
                ) : null}
              </div>

              {!wasCorrect ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-muted">Your answer: </span>
                    {selected}
                  </p>
                  <p>
                    <span className="text-muted">Correct answer: </span>
                    {question.correct_answer}
                  </p>
                </div>
              ) : null}

              {question.explanation ? (
                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-muted">Explanation</p>
                  <p className="mt-1 text-sm leading-relaxed">{question.explanation}</p>
                </div>
              ) : null}

              {/* On a phone Next lives in the bottom bar below, so it stays in
                  reach without covering the options or this panel. */}
              <div className="mt-4 hidden flex-wrap items-center gap-3 sm:flex">
                <Button autoFocus onClick={advance}>
                  Next
                </Button>
                <span className="text-xs text-muted">Enter, Space or → to continue</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {phase === "feedback" && wasCorrect !== null ? (
        <>
          <div aria-hidden className="h-24 sm:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg px-4 pt-3 pb-safe sm:hidden">
            <Button size="lg" className="w-full" onClick={advance}>
              Next
            </Button>
          </div>
        </>
      ) : null}

      <KeyboardHints hints={[...optionHints(choices?.length ?? 4), NEXT_HINT]} />
    </div>
  );
}
