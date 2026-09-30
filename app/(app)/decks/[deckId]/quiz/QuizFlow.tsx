"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { KeyboardHints, type KeyHint } from "@/components/KeyboardHints";
import { MCQOption, OPTION_LABELS } from "@/components/MCQOption";
import { Button, ButtonLink, Card, PageHeader, ProgressBar, cn } from "@/components/ui";
import { touchStudyActivity } from "@/lib/actions/activity";
import { submitQuiz, type SubmittedQuizAnswer } from "@/lib/actions/study";
import { generateChoices, shuffle, type Choice } from "@/lib/distractors";
import {
  answerEventId,
  answeredCount,
  clearDraft,
  newAttemptId,
  pruneDraft,
  readDraft,
  validateDraft,
  writeDraft,
  type DraftConflict,
  type QuizDraft,
} from "@/lib/quizDraft";
import type { StudyQuestion } from "@/lib/types";

type Stage = "settings" | "running" | "results";
type Pool = "all" | "missed" | "unmastered" | "mastered";
type Feedback = "end" | "each";
type CountChoice = number | "all";

/** One question with the choices it was given when the quiz started. */
type QuizItem = { question: StudyQuestion; choices: Choice[] };

/** What the mount-time draft lookup found. `checked` gates the resume panel. */
type DraftState = { checked: boolean; draft: QuizDraft | null; conflict: DraftConflict | null };

/** What a confirmed discard should do next. */
type DiscardIntent = "dismiss" | "start";

const COUNT_OPTIONS = [10, 20, 30, 50];

const DRAFT_WRITE_DELAY_MS = 300;

const POOL_OPTIONS: { value: Pool; label: string }[] = [
  { value: "all", label: "All Questions" },
  { value: "missed", label: "Missed Questions" },
  { value: "unmastered", label: "Unmastered Questions" },
  { value: "mastered", label: "Mastered Questions" },
];

const matchesPool = (question: StudyQuestion, pool: Pool): boolean => {
  const progress = question.progress;
  switch (pool) {
    case "missed":
      return progress?.last_result === false;
    case "unmastered":
      return (progress?.mastery_count ?? 0) < 3;
    case "mastered":
      return (progress?.mastery_count ?? 0) >= 3;
    default:
      return true;
  }
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Built from OPTION_LABELS so the legend cannot list a key the handler does
 *  not accept, and only as many as the question actually offers. */
function optionHints(count: number): KeyHint[] {
  return Array.from({ length: Math.min(count, 4) }, (_, i) => ({
    keys: [String(i + 1), (OPTION_LABELS[i] ?? "").toLowerCase()],
    label: `Answer ${OPTION_LABELS[i] ?? i + 1}`,
  }));
}

export function QuizFlow({
  profileId,
  deckId,
  deckName,
  questions,
  topics,
}: {
  profileId: string;
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
  topics: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [stage, setStage] = useState<Stage>("settings");

  // Settings
  const [countChoice, setCountChoice] = useState<CountChoice>(questions.length >= 20 ? 20 : "all");
  const [pool, setPool] = useState<Pool>("all");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>("end");

  // Running
  const [attemptId, setAttemptId] = useState("");
  const [items, setItems] = useState<QuizItem[]>([]);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [revealedList, setRevealedList] = useState<boolean[]>([]);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft recovery
  const [draftState, setDraftState] = useState<DraftState>({
    checked: false,
    draft: null,
    conflict: null,
  });
  const [discardIntent, setDiscardIntent] = useState<DiscardIntent | null>(null);

  const lookedForDraft = useRef(false);
  const touchedActivity = useRef(false);
  const submitted = useRef(false);

  const topicFiltered = useMemo(
    () =>
      selectedTopics.length === 0
        ? questions
        : questions.filter((q) => q.topic && selectedTopics.includes(q.topic.trim())),
    [questions, selectedTopics],
  );

  const poolCounts = useMemo(() => {
    const counts = {} as Record<Pool, number>;
    for (const option of POOL_OPTIONS) {
      counts[option.value] = topicFiltered.filter((q) => matchesPool(q, option.value)).length;
    }
    return counts;
  }, [topicFiltered]);

  const resolvedPool = useMemo(
    () => topicFiltered.filter((q) => matchesPool(q, pool)),
    [topicFiltered, pool],
  );

  const poolSize = resolvedPool.length;
  const quizLength =
    countChoice === "all" ? poolSize : Math.min(countChoice, poolSize);
  const allSelected = countChoice === "all" || countChoice > poolSize;

  const toggleTopic = (topic: string) =>
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );

  // ---------------------------------------------------------------------------
  // Draft lookup. localStorage is client-only, so this cannot run during render.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (lookedForDraft.current) return;
    lookedForDraft.current = true;
    const found = readDraft(profileId, deckId);
    const conflict = found ? validateDraft(found, questions) : null;
    setDraftState({ checked: true, draft: found, conflict });
  }, [profileId, deckId, questions]);

  // ---------------------------------------------------------------------------
  // Draft persistence. Trailing-edge debounce: at most one write per 300ms of
  // answering, moving or revealing.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (stage !== "running" || items.length === 0 || !attemptId || submitted.current) return;

    const timer = setTimeout(() => {
      writeDraft({
        profileId,
        deckId,
        attemptId,
        items: items.map((item) => ({
          questionId: item.question.id,
          questionText: item.question.question_text,
          correctAnswer: item.question.correct_answer,
          choices: item.choices.map((choice) => ({ text: choice.text, isCorrect: choice.isCorrect })),
        })),
        answers,
        revealed: revealedList,
        index,
        settings: { countChoice, pool, selectedTopics, shuffleQuestions, shuffleChoices, feedback },
        startedAt,
      });
    }, DRAFT_WRITE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    stage,
    items,
    answers,
    revealedList,
    index,
    attemptId,
    startedAt,
    profileId,
    deckId,
    countChoice,
    pool,
    selectedTopics,
    shuffleQuestions,
    shuffleChoices,
    feedback,
  ]);

  const startQuiz = useCallback(() => {
    const ordered = shuffleQuestions ? shuffle(resolvedPool) : resolvedPool;
    const picked = ordered.slice(0, quizLength);

    const built = picked.map<QuizItem>((question) => {
      const choices = generateChoices(question, questions);
      return {
        question,
        // With shuffling off, a stable alphabetical order keeps the options in
        // the same place every time this question is shown.
        choices: shuffleChoices ? choices : [...choices].sort((a, b) => a.text.localeCompare(b.text)),
      };
    });

    submitted.current = false;
    touchedActivity.current = false;
    setAttemptId(newAttemptId());
    setItems(built);
    setAnswers(built.map(() => null));
    setRevealedList(built.map(() => false));
    setIndex(0);
    setStartedAt(new Date().toISOString());
    setConfirming(false);
    setError(null);
    setStage("running");
  }, [shuffleQuestions, resolvedPool, quizLength, questions, shuffleChoices]);

  /** Put an unfinished quiz back exactly as it was left. */
  const resume = useCallback(() => {
    const found = draftState.draft;
    if (!found) return;

    const usable = draftState.conflict ? pruneDraft(found, draftState.conflict) : found;
    const byId = new Map(questions.map((q) => [q.id, q]));

    const built: QuizItem[] = [];
    const restoredAnswers: (string | null)[] = [];
    const restoredRevealed: boolean[] = [];
    usable.items.forEach((item, i) => {
      const question = byId.get(item.questionId);
      if (!question) return;
      built.push({
        question,
        choices: item.choices.map((choice) => ({ text: choice.text, isCorrect: choice.isCorrect })),
      });
      restoredAnswers.push(usable.answers[i] ?? null);
      restoredRevealed.push(usable.revealed[i] ?? false);
    });

    if (built.length === 0) return;

    setCountChoice(usable.settings.countChoice);
    setPool(usable.settings.pool);
    setSelectedTopics(usable.settings.selectedTopics);
    setShuffleQuestions(usable.settings.shuffleQuestions);
    setShuffleChoices(usable.settings.shuffleChoices);
    setFeedback(usable.settings.feedback);

    submitted.current = false;
    touchedActivity.current = restoredAnswers.some((a) => a !== null);
    setAttemptId(usable.attemptId);
    setItems(built);
    setAnswers(restoredAnswers);
    setRevealedList(restoredRevealed);
    setIndex(Math.min(usable.index, built.length - 1));
    setStartedAt(usable.startedAt);
    setConfirming(false);
    setError(null);
    setDraftState({ checked: true, draft: null, conflict: null });
    setStage("running");
  }, [draftState, questions]);

  const confirmDiscard = () => {
    const intent = discardIntent;
    clearDraft(profileId, deckId);
    setDraftState({ checked: true, draft: null, conflict: null });
    setDiscardIntent(null);
    if (intent === "start") startQuiz();
  };

  const requestStart = () => {
    if (draftState.draft) {
      setDiscardIntent("start");
      return;
    }
    startQuiz();
  };

  const total = items.length;
  const current = items[index];
  const selected = answers[index] ?? null;
  const revealed = revealedList[index] ?? false;
  const unanswered = answers.filter((a) => a === null).length;
  const isLast = index === total - 1;

  const select = useCallback(
    (text: string) => {
      // In "after each question" mode an answered question is locked.
      if (feedback === "each" && answers[index] !== null) return;

      setAnswers((prev) => {
        const next = [...prev];
        next[index] = text;
        return next;
      });
      if (feedback === "each") {
        setRevealedList((prev) => {
          const next = [...prev];
          next[index] = true;
          return next;
        });
      }

      if (!touchedActivity.current) {
        touchedActivity.current = true;
        // Activity only — this never touches mastery, which submitQuiz owns.
        void touchStudyActivity(deckId, "quiz").catch(() => {});
      }
    },
    [feedback, answers, index, deckId],
  );

  const go = useCallback(
    (delta: number) =>
      setIndex((prev) => Math.min(Math.max(prev + delta, 0), Math.max(total - 1, 0))),
    [total],
  );

  const buildAnswers = (): SubmittedQuizAnswer[] =>
    items.map((item, i) => {
      const answer = answers[i] ?? null;
      const chosen = item.choices.find((choice) => choice.text === answer);
      return {
        // Derived from the attempt, so resubmitting the same attempt replays
        // the same ids and mastery is applied exactly once.
        eventId: answerEventId(attemptId, item.question.id),
        questionId: item.question.id,
        questionText: item.question.question_text,
        correctAnswer: item.question.correct_answer,
        explanation: item.question.explanation,
        selectedAnswer: answer,
        wasCorrect: chosen?.isCorrect ?? false,
      };
    });

  const doSubmit = () => {
    setConfirming(false);
    setError(null);
    const payload = buildAnswers();
    startTransition(async () => {
      try {
        const id = await submitQuiz(deckId, payload, startedAt, attemptId);
        // Only now is the work safely on the server.
        submitted.current = true;
        clearDraft(profileId, deckId);
        setStage("results");
        router.push(`/decks/${deckId}/quiz/${id}`);
      } catch (cause) {
        // The draft stays put, so this attempt survives a reload and a retry
        // reuses the same attempt id rather than creating a second one.
        setError(cause instanceof Error ? cause.message : "Could not save this quiz. Please try again.");
      }
    });
  };

  const requestSubmit = () => {
    if (unanswered > 0) {
      setConfirming(true);
      return;
    }
    doSubmit();
  };

  useEffect(() => {
    if (stage !== "running" || pending) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }
      // Enter, Space and the right arrow all move on, matching Learn. Submitting
      // is deliberately left to the button: it ends the attempt, and a stray
      // keypress should not do that.
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go(1);
        return;
      }

      const item = items[index];
      if (!item) return;
      const key = event.key.toUpperCase();
      const byNumber = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
      const byLetter = OPTION_LABELS.indexOf(key);
      const choiceIndex = byNumber >= 0 ? byNumber : byLetter;
      if (choiceIndex < 0 || choiceIndex >= item.choices.length) return;

      event.preventDefault();
      select(item.choices[choiceIndex].text);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, pending, items, index, go, select]);

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  if (stage === "settings") {
    const found = draftState.draft;
    const conflict = draftState.conflict;
    const affected = conflict ? conflict.missing.length + conflict.changed.length : 0;
    const recoverable = conflict ? conflict.valid.length : (found?.items.length ?? 0);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Quiz"
          subtitle={deckName}
          actions={
            <ButtonLink href={`/decks/${deckId}`} variant="ghost">
              Back to deck
            </ButtonLink>
          }
        />

        {found ? (
          <div className="space-y-3 rounded-2xl border tint-accent p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Unfinished quiz</h2>
              <p className="text-sm text-muted tabular-nums">
                {answeredCount(found)} of {found.items.length} answered
              </p>
            </div>

            {conflict ? (
              <p className="text-sm">
                {affected === 1
                  ? "1 question in this quiz has changed or been removed."
                  : `${affected} questions in this quiz have changed or been removed.`}{" "}
                {recoverable > 0
                  ? `You can carry on with the ${plural(recoverable, "question")} that still match this deck.`
                  : "None of its questions still match this deck, so it can only be started again."}
              </p>
            ) : null}

            {discardIntent === null ? (
              <div className="flex flex-wrap gap-2">
                {recoverable > 0 ? (
                  <Button onClick={resume}>
                    {conflict ? `Resume with ${plural(recoverable, "question")}` : "Resume quiz"}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => setDiscardIntent("dismiss")}
                >
                  Start a new quiz
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border tint-danger p-4">
                <p className="text-sm">This will discard your unfinished quiz.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" onClick={confirmDiscard}>
                    Discard
                  </Button>
                  <Button variant="secondary" onClick={() => setDiscardIntent(null)}>
                    Keep
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-sm font-medium">Number of questions</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Number of questions">
              {COUNT_OPTIONS.filter((n) => n <= questions.length).map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={!allSelected && countChoice === n ? "primary" : "secondary"}
                  aria-pressed={!allSelected && countChoice === n}
                  disabled={n > poolSize}
                  onClick={() => setCountChoice(n)}
                >
                  {n}
                </Button>
              ))}
              <Button
                size="sm"
                variant={allSelected ? "primary" : "secondary"}
                aria-pressed={allSelected}
                onClick={() => setCountChoice("all")}
              >
                All
              </Button>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-medium">Question pool</h2>
            <div className="space-y-2" role="group" aria-label="Question pool">
              {POOL_OPTIONS.map((option) => {
                const count = poolCounts[option.value];
                const active = pool === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPool(option.value)}
                    disabled={count === 0}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors duration-150",
                      "disabled:opacity-50 disabled:pointer-events-none",
                      active ? "tint-accent" : "border-line bg-surface hover:bg-sunken",
                    )}
                  >
                    <span>{option.label}</span>
                    <span className="text-xs text-muted tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {topics.length > 1 ? (
            <Card className="space-y-3">
              <h2 className="text-sm font-medium">Topics</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Topics">
                <Button
                  size="sm"
                  variant={selectedTopics.length === 0 ? "primary" : "secondary"}
                  aria-pressed={selectedTopics.length === 0}
                  onClick={() => setSelectedTopics([])}
                >
                  All Topics
                </Button>
                {topics.map((topic) => (
                  <Button
                    key={topic}
                    size="sm"
                    variant={selectedTopics.includes(topic) ? "primary" : "secondary"}
                    aria-pressed={selectedTopics.includes(topic)}
                    onClick={() => toggleTopic(topic)}
                  >
                    {topic}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted">Selecting no topic includes every topic.</p>
            </Card>
          ) : null}

          <Card className="space-y-4">
            <h2 className="text-sm font-medium">Options</h2>

            <div className="space-y-3">
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(event) => setShuffleQuestions(event.target.checked)}
                  className="size-4 shrink-0 accent-current text-accent"
                />
                <span>Shuffle questions</span>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={shuffleChoices}
                  onChange={(event) => setShuffleChoices(event.target.checked)}
                  className="size-4 shrink-0 accent-current text-accent"
                />
                <span>Shuffle answer choices</span>
              </label>
            </div>

            <fieldset className="space-y-3 border-0 p-0">
              <legend className="mb-1 text-sm font-medium">Feedback</legend>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="feedback"
                  value="end"
                  checked={feedback === "end"}
                  onChange={() => setFeedback("end")}
                  className="size-4 shrink-0 accent-current text-accent"
                />
                <span>Show answers at the end</span>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="feedback"
                  value="each"
                  checked={feedback === "each"}
                  onChange={() => setFeedback("each")}
                  className="size-4 shrink-0 accent-current text-accent"
                />
                <span>Show answers after each question</span>
              </label>
            </fieldset>
          </Card>
        </div>

        <div className="space-y-2">
          <Button size="lg" disabled={quizLength === 0} onClick={requestStart}>
            Start quiz
          </Button>
          <p className="text-sm text-muted">
            {quizLength === 0
              ? "No questions match these settings."
              : `This quiz will have ${plural(quizLength, "question")}.`}
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Results handoff — the review page is the results screen.
  // -------------------------------------------------------------------------

  if (stage === "results") {
    return (
      <Card className="text-center text-sm text-muted">Scoring your quiz…</Card>
    );
  }

  // -------------------------------------------------------------------------
  // Running
  // -------------------------------------------------------------------------

  if (!current) return null;

  const selectedIsCorrect = current.choices.find((c) => c.text === selected)?.isCorrect ?? false;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted tabular-nums">
            Question {index + 1} of {total}
          </p>
          <p className="text-sm text-muted">{deckName}</p>
        </div>
        <ProgressBar value={index + 1} total={total} tone="accent" />
      </div>

      <Card className="space-y-5">
        <h1 className="text-xl font-medium leading-snug sm:text-2xl">
          {current.question.question_text}
        </h1>

        <div className="space-y-3">
          {current.choices.map((choice, i) => {
            const isChosen = choice.text === selected;
            const state = !revealed
              ? isChosen
                ? "selected"
                : "idle"
              : isChosen
                ? choice.isCorrect
                  ? "correct"
                  : "incorrect"
                : choice.isCorrect
                  ? "missed"
                  : "idle";
            return (
              <MCQOption
                key={choice.text}
                label={OPTION_LABELS[i] ?? String(i + 1)}
                text={choice.text}
                state={state}
                disabled={revealed || pending}
                onSelect={() => select(choice.text)}
              />
            );
          })}
        </div>

        {revealed ? (
          <div
            className={cn(
              "space-y-2 rounded-xl border p-4 text-sm",
              selectedIsCorrect ? "tint-success" : "tint-danger",
            )}
          >
            <p className={cn("font-medium", selectedIsCorrect ? "text-success" : "text-danger")}>
              {selectedIsCorrect ? "Correct" : "Incorrect"}
            </p>
            <p>
              <span className="text-xs uppercase tracking-wide text-muted">Your answer</span>
              <br />
              {selected}
            </p>
            <p>
              <span className="text-xs uppercase tracking-wide text-muted">Correct answer</span>
              <br />
              <span className="text-success">{current.question.correct_answer}</span>
            </p>
            {current.question.explanation ? (
              <p>
                <span className="text-xs uppercase tracking-wide text-muted">Explanation</span>
                <br />
                {current.question.explanation}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {error ? (
        <div className="space-y-3 rounded-xl border tint-danger p-4 text-sm">
          <p className="text-danger">{error}</p>
          <p className="text-muted">
            Your answers are saved on this device. Try again, or come back to this deck later to
            finish submitting.
          </p>
          <Button variant="danger" onClick={doSubmit} disabled={pending}>
            {pending ? "Submitting…" : "Try again"}
          </Button>
        </div>
      ) : null}

      {confirming ? (
        <div className="space-y-3 rounded-xl border tint-danger p-4">
          <p className="text-sm">
            {unanswered === 1
              ? "1 question is unanswered. Submit anyway?"
              : `${unanswered} questions are unanswered. Submit anyway?`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={doSubmit} disabled={pending}>
              {pending ? "Submitting…" : "Submit anyway"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Keep working
            </Button>
          </div>
        </div>
      ) : null}

      {/* Sticky rather than fixed: it keeps its place in the flow, so it can
          never sit on top of the answers or the feedback panel. */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-bg pt-3 pb-safe">
        <Button variant="secondary" onClick={() => go(-1)} disabled={index === 0 || pending}>
          Previous
        </Button>
        {unanswered > 0 ? (
          <p className="text-xs text-muted tabular-nums">{unanswered} unanswered</p>
        ) : null}
        {isLast ? (
          <Button onClick={requestSubmit} disabled={pending}>
            {pending ? "Submitting…" : "Submit Quiz"}
          </Button>
        ) : (
          <Button onClick={() => go(1)} disabled={pending}>
            Next
          </Button>
        )}
      </div>

      <KeyboardHints
        hints={[
          ...optionHints(items[index]?.choices.length ?? 4),
          { keys: ["Enter", "Space", "→"], label: "Next question" },
          { keys: ["←"], label: "Previous question" },
        ]}
      />
    </div>
  );
}
