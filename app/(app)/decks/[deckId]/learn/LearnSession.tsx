"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MCQOption, OPTION_LABELS, type OptionState } from "@/components/MCQOption";
import { Mascot, type MascotState } from "@/components/Mascot";
import { RangeSlider } from "@/components/RangeSlider";
import { Button, ButtonLink, Card, ProgressBar, Stat, cn } from "@/components/ui";
import { recordAnswer } from "@/lib/actions/study";
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
const CELEBRATION_STREAK = 5;
const RANGE_STORAGE_KEY = "memorizer-checkpoint-range";

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
function LevelCounts({ counts }: { counts: Counts }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span className="text-success tabular-nums">{counts.mastered} mastered</span>
      <span className="text-accent tabular-nums">{counts.familiar} familiar</span>
      <span className="text-ink tabular-nums">{counts.learning} learning</span>
      <span className="text-muted tabular-nums">{counts.new} new</span>
    </div>
  );
}

export function LearnSession({
  deckId,
  deckName,
  questions,
}: {
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
}) {
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  const [range, setRange] = useState<CheckpointRange>(DEFAULT_CHECKPOINT_RANGE);
  const [state, setState] = useState<LearnState | null>(null);

  const [phase, setPhase] = useState<"answering" | "feedback" | "checkpoint" | "done">("answering");
  const [selected, setSelected] = useState<string | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [presentation, setPresentation] = useState(0);
  const [presented, setPresented] = useState<{ key: string; choices: Choice[] } | null>(null);
  const [saveFailedFor, setSaveFailedFor] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
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
    setState(createLearnState(questions, saved ?? DEFAULT_CHECKPOINT_RANGE));
    setReady(true);
  }, [questions]);

  const currentId = state?.current ?? null;
  const question = currentId ? byId.get(currentId) ?? null : null;
  const presentationKey = `${presentation}:${currentId ?? ""}`;

  useEffect(() => {
    if (!question) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresented({ key: presentationKey, choices: generateChoices(question, questions) });
  }, [presentationKey, question, questions]);

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
      const questionId = question.id;
      setSelected(choice.text);
      setWasCorrect(choice.isCorrect);
      setPhase("feedback");
      startTransition(async () => {
        try {
          await recordAnswer(questionId, choice.isCorrect);
        } catch {
          setSaveFailedFor(questionId);
        }
      });
    },
    [phase, question],
  );

  const advance = useCallback(() => {
    if (phase !== "feedback" || !question || wasCorrect === null || !state) return;
    const outcome = applyAnswer(state, question.id, wasCorrect);
    setState(outcome.state);

    if (isComplete(outcome.state)) {
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
    setSaveFailedFor(null);
  }, [phase, question, wasCorrect, state, questions]);

  const restart = useCallback(() => {
    setState(createLearnState(questions, range));
    setPhase("answering");
    setSelected(null);
    setWasCorrect(null);
    setCheckpointCounts(null);
    setPresentation((n) => n + 1);
  }, [questions, range]);

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

      if (phase === "feedback") {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          advance();
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
              <div className="mt-4">
                <RangeSlider
                  label="Questions mastered between checkpoints"
                  min={CHECKPOINT_LIMITS.min}
                  max={CHECKPOINT_LIMITS.max}
                  value={range}
                  onChange={updateRange}
                />
              </div>
            ) : null}
          </div>

          <p className="text-xs text-muted">Your progress is saved as you go.</p>
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

      <div className="sticky top-14 z-10 -mx-4 space-y-2 border-b border-line bg-bg px-4 pb-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <LevelCounts counts={counts} />
          <div className="flex items-center gap-2">
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
        <p className="text-sm tabular-nums text-muted">
          {counts.mastered} / {counts.total} mastered
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <h2 className="text-xl font-medium leading-snug sm:text-2xl">{question.question_text}</h2>
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

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button autoFocus onClick={advance}>
                  Next
                </Button>
                {saveFailedFor === question.id ? (
                  <span className="text-xs text-muted">Progress could not be saved.</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
