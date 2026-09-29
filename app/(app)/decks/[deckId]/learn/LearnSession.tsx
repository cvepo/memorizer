"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { MCQOption, OPTION_LABELS, type OptionState } from "@/components/MCQOption";
import { Button, ButtonLink, Card, MasteryBreakdown, ProgressBar, cn } from "@/components/ui";
import { recordAnswer } from "@/lib/actions/study";
import { generateChoices, maxAvailableChoices, type Choice } from "@/lib/distractors";
import {
  MASTERY_TARGET,
  applyAnswer,
  countsFor,
  createLearnState,
  isComplete,
  type LearnState,
} from "@/lib/learnAlgorithm";
import type { StudyQuestion } from "@/lib/types";

/** Keyboard shortcuts for the first four options. */
const KEY_TO_INDEX: Record<string, number | undefined> = {
  "1": 0,
  "2": 1,
  "3": 2,
  "4": 3,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
};

const AUTO_ADVANCE_MS = 700;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
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
  const byId = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);

  // The opening queue is shuffled, so building it during render would make the
  // server and the client disagree about which question comes first. Build it
  // after mount instead and show a placeholder for the first frame.
  const [state, setState] = useState<LearnState | null>(null);
  const [phase, setPhase] = useState<"answering" | "feedback">("answering");
  const [selected, setSelected] = useState<string | null>(null);
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  /** Bumped on every answer so a repeat showing of a question reshuffles. */
  const [presentation, setPresentation] = useState(0);
  const [presented, setPresented] = useState<{ key: string; choices: Choice[] } | null>(null);
  /** Question id whose answer failed to save, so the notice is never stale. */
  const [saveFailedFor, setSaveFailedFor] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(createLearnState(questions));
  }, [questions]);

  const currentId = state?.queue[0];
  const question = currentId ? byId.get(currentId) ?? null : null;
  const presentationKey = `${presentation}:${currentId ?? ""}`;

  // Choices are built in an effect, never during render: generateChoices is
  // random, so rendering it would reshuffle the options under the user and
  // produce different markup on the server than on the client. Deferring the
  // randomness to the client is the point, so the set-state-in-effect rule is
  // deliberately waived here.
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
        : { mastered: 0, learning: 0, unseen: questions.length, total: questions.length },
    [state, questions],
  );
  const available = useMemo(
    () => (question ? maxAvailableChoices(question, questions) : 4),
    [question, questions],
  );

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
    if (phase !== "feedback" || !question || wasCorrect === null) return;
    const questionId = question.id;
    const correct = wasCorrect;
    setState((previous) => (previous ? applyAnswer(previous, questionId, correct) : previous));
    setPresentation((n) => n + 1);
    setSelected(null);
    setWasCorrect(null);
    setPhase("answering");
    setSaveFailedFor(null);
  }, [phase, question, wasCorrect]);

  // A correct answer with nothing to read moves on by itself. Misses always
  // wait for the user.
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

  const restart = useCallback(() => {
    setState(createLearnState(questions));
    setPhase("answering");
    setSelected(null);
    setWasCorrect(null);
    setPresentation((n) => n + 1);
    setSaveFailedFor(null);
  }, [questions]);

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

  // First frame after mount, before the effect above has built the session.
  if (!state) {
    return (
      <div className="space-y-6">
        {breadcrumb}
        <div className="h-2 w-full rounded-full bg-sunken" />
        <div className="h-8 w-2/3 rounded-lg bg-sunken" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl border border-line bg-surface" />
          ))}
        </div>
        <span className="sr-only">Preparing your session…</span>
      </div>
    );
  }

  if (isComplete(state)) {
    const sessionAccuracy = state.answered > 0 ? Math.round((state.correct / state.answered) * 100) : 0;

    return (
      <div className="space-y-6">
        {breadcrumb}
        <Card className="space-y-6 py-10 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Deck Mastered</h1>
            <p className="text-success">
              {counts.total} / {counts.total} mastered
            </p>
          </div>
          <div className="space-y-1 text-sm text-muted">
            <p>Accuracy: {sessionAccuracy}%</p>
            <p>Questions answered: {state.answered}</p>
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

  return (
    <div className="space-y-6">
      {breadcrumb}

      <div className="sticky top-14 z-10 -mx-4 space-y-2 border-b border-line bg-bg px-4 pb-3 pt-2">
        <MasteryBreakdown mastered={counts.mastered} learning={counts.learning} unseen={counts.unseen} />
        <ProgressBar value={counts.mastered} total={counts.total} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-muted tabular-nums">
            {counts.mastered} / {counts.total} mastered
          </p>
          <p className="text-xs text-muted tabular-nums">Remaining in this round: {state.queue.length}</p>
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
              <p className={cn("font-medium", wasCorrect ? "text-success" : "text-danger")}>
                {wasCorrect ? "Correct" : "Incorrect"}
              </p>

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
