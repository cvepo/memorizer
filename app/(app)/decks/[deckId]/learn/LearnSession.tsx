"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MCQOption, OPTION_LABELS, type OptionState } from "@/components/MCQOption";
import { RangeSlider } from "@/components/RangeSlider";
import { Button, ButtonLink, Card, MasteryBreakdown, ProgressBar, Stat, cn } from "@/components/ui";
import { recordAnswer } from "@/lib/actions/study";
import { generateChoices, maxAvailableChoices, type Choice } from "@/lib/distractors";
import {
  DEFAULT_ROUND_RANGE,
  MASTERY_TARGET,
  ROUND_LIMITS,
  applyAnswer,
  createLearnState,
  isComplete,
  nextRoundSize,
  pickRoundQuestions,
  remainingCount,
  type LearnState,
  type RoundRange,
} from "@/lib/learnAlgorithm";
import type { StudyQuestion } from "@/lib/types";

/** Keyboard shortcuts for the first four options. */
const KEY_TO_INDEX: Record<string, number | undefined> = {
  "1": 0, "2": 1, "3": 2, "4": 3,
  a: 0, b: 1, c: 2, d: 3,
};

const AUTO_ADVANCE_MS = 700;
const RANGE_STORAGE_KEY = "memorizer-round-range";

type Stage = "round" | "checkin" | "done";

type Totals = {
  answered: number;
  correct: number;
  bestStreak: number;
  missed: string[];
  seen: string[];
};

const EMPTY_TOTALS: Totals = { answered: 0, correct: 0, bestStreak: 0, missed: [], seen: [] };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function readStoredRange(): RoundRange | null {
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoundRange>;
    if (typeof parsed.min !== "number" || typeof parsed.max !== "number") return null;
    const min = Math.min(Math.max(parsed.min, ROUND_LIMITS.min), ROUND_LIMITS.max);
    const max = Math.min(Math.max(parsed.max, min), ROUND_LIMITS.max);
    return { min, max };
  } catch {
    return null;
  }
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

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
  /** React re-runs mount effects in development; building the session twice
   *  would discard the first round and start the learner on "Round 2". */
  const startedRef = useRef(false);
  const [stage, setStage] = useState<Stage>("round");
  const [showRoundSettings, setShowRoundSettings] = useState(false);
  const [range, setRange] = useState<RoundRange>(DEFAULT_ROUND_RANGE);

  /** Mastery carried between rounds, seeded from what the database already knows. */
  const [sessionMastery, setSessionMastery] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const q of questions) {
      seed[q.id] = Math.min(q.progress?.mastery_count ?? 0, MASTERY_TARGET - 1);
    }
    return seed;
  });

  const [roundQuestions, setRoundQuestions] = useState<StudyQuestion[]>([]);
  const [roundNumber, setRoundNumber] = useState(0);
  const [state, setState] = useState<LearnState | null>(null);
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);

  const [phase, setPhase] = useState<"answering" | "feedback">("answering");
  const [selected, setSelected] = useState<string | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [presentation, setPresentation] = useState(0);
  const [presented, setPresented] = useState<{ key: string; choices: Choice[] } | null>(null);
  const [saveFailedFor, setSaveFailedFor] = useState<string | null>(null);

  // Round selection shuffles, so nothing may run during render. The stored
  // round-length preference is read here too, for the same reason.
  const currentId = state?.queue[0];
  const question = currentId ? byId.get(currentId) ?? null : null;
  const presentationKey = `${presentation}:${currentId ?? ""}`;

  useEffect(() => {
    if (!question) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresented({ key: presentationKey, choices: generateChoices(question, questions) });
  }, [presentationKey, question, questions]);

  const choices = presented && presented.key === presentationKey ? presented.choices : null;

  /** Deck-wide mastery: what earlier rounds settled, overlaid with this round. */
  const liveMastery = useMemo(
    () => ({ ...sessionMastery, ...(state?.mastery ?? {}) }),
    [sessionMastery, state],
  );

  const overall = useMemo(() => {
    const seen = new Set([...totals.seen, ...(state?.seen ?? [])]);
    let mastered = 0;
    let learning = 0;
    let unseen = 0;
    for (const q of questions) {
      const level = liveMastery[q.id] ?? 0;
      if (level >= MASTERY_TARGET) mastered += 1;
      else if (level > 0 || seen.has(q.id) || (q.progress?.times_seen ?? 0) > 0) learning += 1;
      else unseen += 1;
    }
    return { mastered, learning, unseen, total: questions.length };
  }, [questions, liveMastery, totals.seen, state]);

  const remaining = remainingCount(questions, liveMastery);

  const available = useMemo(
    () => (question ? maxAvailableChoices(question, questions) : 4),
    [question, questions],
  );

  const beginRound = useCallback(
    (
      mastery: Record<string, number>,
      carriedStreak: number,
      carriedBest: number,
      useRange: RoundRange = range,
    ) => {
      const left = remainingCount(questions, mastery);
      if (left === 0) {
        setStage("done");
        return;
      }
      const size = nextRoundSize(useRange, left);
      const picked = pickRoundQuestions(questions, mastery, size);
      const next = createLearnState(picked, mastery);
      next.streak = carriedStreak;
      next.bestStreak = carriedBest;

      setRoundQuestions(picked);
      setState(next);
      setRoundNumber((n) => n + 1);
      setPhase("answering");
      setSelected(null);
      setWasCorrect(null);
      setSaveFailedFor(null);
      setPresentation((n) => n + 1);
      setStage("round");
    },
    [questions, range],
  );

  // Learn opens straight into the first round — no settings gate. The round
  // length is remembered from last time and adjustable at any check-in.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const saved = readStoredRange();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setRange(saved);
    setReady(true);
    beginRound(sessionMastery, 0, 0, saved ?? DEFAULT_ROUND_RANGE);
    // Mount only: re-running this would restart the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRange = useCallback((next: RoundRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Preference just will not persist.
    }
  }, []);

  const restartAll = useCallback(() => {
    const seed: Record<string, number> = {};
    for (const q of questions) seed[q.id] = 0;
    setSessionMastery(seed);
    setTotals(EMPTY_TOTALS);
    setRoundNumber(0);
    beginRound(seed, 0, 0);
  }, [questions, beginRound]);

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
    const next = applyAnswer(state, question.id, wasCorrect);

    if (isComplete(next)) {
      // Fold the round into the session, then stop for a check-in.
      const merged = { ...sessionMastery, ...next.mastery };
      setSessionMastery(merged);
      setTotals((t) => ({
        answered: t.answered + next.answered,
        correct: t.correct + next.correct,
        bestStreak: Math.max(t.bestStreak, next.bestStreak),
        missed: unique([...t.missed, ...next.missed]),
        seen: unique([...t.seen, ...next.seen]),
      }));
      setState(next);
      setStage(remainingCount(questions, merged) === 0 ? "done" : "checkin");
    } else {
      setState(next);
    }

    setPresentation((n) => n + 1);
    setSelected(null);
    setWasCorrect(null);
    setPhase("answering");
    setSaveFailedFor(null);
  }, [phase, question, wasCorrect, state, sessionMastery, questions]);

  // A correct answer with nothing to read moves on by itself. Misses wait.
  useEffect(() => {
    if (stage !== "round" || phase !== "feedback" || wasCorrect !== true || question?.explanation) return;
    const timer = setTimeout(advance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [stage, phase, wasCorrect, question, advance]);

  useEffect(() => {
    if (stage !== "round") return;
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

      const index = KEY_TO_INDEX[event.key.toLowerCase()];
      if (index === undefined) return;
      const choice = choices?.[index];
      if (!choice) return;
      event.preventDefault();
      grade(choice);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, phase, choices, advance, grade]);

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

  const sessionAccuracy = (answered: number, correct: number) =>
    answered > 0 ? Math.round((correct / answered) * 100) : 0;

  // ---------------------------------------------------------------- setup ---

  if (!ready) {
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

  if (stage === "done") {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-6 py-10 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Deck Mastered</h1>
            <p className="text-success tabular-nums">
              {overall.total} / {overall.total} mastered
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            <Stat label="Accuracy" value={`${sessionAccuracy(totals.answered, totals.correct)}%`} />
            <Stat label="Questions answered" value={totals.answered} tone="muted" />
            <Stat label="Best streak" value={totals.bestStreak} tone="accent" />
            <Stat label="Rounds" value={roundNumber} tone="muted" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {totals.missed.length > 0 ? (
              <ButtonLink href={`/decks/${deckId}/learn?ids=${totals.missed.join(",")}`}>
                Review Missed
              </ButtonLink>
            ) : null}
            <Button variant="secondary" onClick={restartAll}>
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

  // ------------------------------------------------------------- check-in ---

  if (stage === "checkin" && state) {
    const roundMastered = roundQuestions.filter(
      (q) => (state.mastery[q.id] ?? 0) >= MASTERY_TARGET,
    ).length;

    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-6 py-8 text-center">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Round {roundNumber} complete
            </h1>
            <p className="text-sm text-muted">
              {roundMastered} of {roundQuestions.length} mastered this round ·{" "}
              {sessionAccuracy(state.answered, state.correct)}% accuracy
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            <Stat label="Answered this round" value={state.answered} tone="muted" />
            <Stat label="Best streak" value={Math.max(totals.bestStreak, state.bestStreak)} tone="accent" />
            <Stat label="Left in the deck" value={remaining} tone="muted" />
          </div>

          <div className="space-y-2 text-left">
            <ProgressBar value={overall.mastered} total={overall.total} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MasteryBreakdown
                mastered={overall.mastered}
                learning={overall.learning}
                unseen={overall.unseen}
              />
              <span className="text-sm tabular-nums text-muted">
                {overall.mastered} / {overall.total} mastered
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="lg"
              autoFocus
              onClick={() => beginRound(sessionMastery, state.streak, Math.max(totals.bestStreak, state.bestStreak))}
            >
              Next round
            </Button>
            {state.missed.length > 0 ? (
              <ButtonLink
                href={`/decks/${deckId}/learn?ids=${state.missed.join(",")}`}
                variant="secondary"
              >
                Review this round&rsquo;s misses
              </ButtonLink>
            ) : null}
            <ButtonLink href={`/decks/${deckId}`} variant="ghost">
              Finish for now
            </ButtonLink>
          </div>

          <div className="border-t border-line pt-4 text-left">
            <button
              type="button"
              onClick={() => setShowRoundSettings((v) => !v)}
              aria-expanded={showRoundSettings}
              className="flex w-full items-center justify-between gap-3 text-sm text-muted transition-colors hover:text-ink"
            >
              <span>
                Round length ·{" "}
                <span className="tabular-nums">
                  {range.min}–{range.max}
                </span>{" "}
                questions
              </span>
              <span aria-hidden className="text-xs">
                {showRoundSettings ? "Hide" : "Change"}
              </span>
            </button>

            {showRoundSettings ? (
              <div className="mt-4">
                <RangeSlider
                  label="Questions per round"
                  min={ROUND_LIMITS.min}
                  max={ROUND_LIMITS.max}
                  value={range}
                  onChange={updateRange}
                />
                <p className="mt-3 text-xs text-muted">
                  Each round picks a random length inside this range. Applies from the next round.
                </p>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-muted">Your progress is saved as you go.</p>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------- round ---

  if (!state || !question) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-4 py-10 text-center">
          <p className="font-medium">This session could not be continued</p>
          <p className="text-sm text-muted">The next question is no longer available.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={restartAll}>
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

  // A question stays in the round until it is mastered, so "done" here means
  // mastered this round, not merely answered.
  const roundMastered = roundQuestions.filter(
    (q) => (state.mastery[q.id] ?? 0) >= MASTERY_TARGET,
  ).length;

  return (
    <div className="space-y-6">
      {breadcrumb}

      <div className="sticky top-14 z-10 -mx-4 space-y-2 border-b border-line bg-bg px-4 pb-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <MasteryBreakdown
            mastered={overall.mastered}
            learning={overall.learning}
            unseen={overall.unseen}
          />
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
        <ProgressBar value={overall.mastered} total={overall.total} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm tabular-nums text-muted">
            {overall.mastered} / {overall.total} mastered
          </p>
          <p className="text-xs tabular-nums text-muted">
            Round {roundNumber} · {roundMastered}/{roundQuestions.length} mastered
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <h2 className="text-xl font-medium leading-snug sm:text-2xl">{question.question_text}</h2>
          <p className="text-xs text-muted">
            {question.topic ? `${question.topic} · ` : ""}
            Answer correctly {MASTERY_TARGET} times to master a question.
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
                  <p className="text-xs text-muted tabular-nums">{state.streak} in a row</p>
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
