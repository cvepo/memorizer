"use client";

import { StarButton } from "@/components/StarButton";
import { cn } from "@/components/ui";
import { OPTION_LABELS } from "@/components/MCQOption";
import type { Choice } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

/** Generous vertical padding leaves room for the label at the top and the hint
 * at the bottom without crowding long questions. */
const CARD =
  "flex min-h-64 w-full flex-col items-center justify-center gap-3 overflow-y-auto " +
  "rounded-2xl border px-6 py-16 text-center transition-colors duration-150 sm:min-h-80 sm:px-10";

export function EmbeddedFlashcard({
  question,
  revealed,
  onToggle,
  starred,
  index,
  total,
  choices,
  onStarChange,
}: {
  question: StudyQuestion;
  revealed: boolean;
  onToggle: () => void;
  starred: boolean;
  index: number;
  total: number;
  /** The four options, shown on the question face so the card reads like the
   *  multiple-choice question it actually is. Display only — picking one is
   *  what Learn and Quiz are for, so these are not interactive here. */
  choices: Choice[] | null;
  onStarChange?: (starred: boolean) => void;
}) {
  return (
    <div className="relative">
      {/* The card surface — border, background, size — never animates. Only the
          text inside is replaced, so moving between cards never reads as a flash. */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={
          revealed
            ? `Card ${index + 1} of ${total} — show the question`
            : `Card ${index + 1} of ${total} — reveal the answer`
        }
        className={cn(CARD, revealed ? "tint-accent" : "border-line bg-surface")}
      >
        <span
          className={cn(
            "absolute inset-x-0 top-5 text-[11px] font-semibold uppercase tracking-[0.14em]",
            revealed ? "text-accent" : "text-muted",
          )}
        >
          {revealed ? "Answer" : "Question"}
        </span>

        <span
          key={`${question.id}:${revealed ? "a" : "q"}`}
          data-card-enter
          className="flex w-full flex-col items-center gap-3"
        >
          {revealed ? (
            <>
              <span className="text-2xl font-semibold break-words sm:text-3xl">
                {question.correct_answer}
              </span>
              {choices && choices.length > 0 ? (
                <span className="text-xs tracking-wide text-muted uppercase">
                  Option {OPTION_LABELS[choices.findIndex((c) => c.isCorrect)] ?? "?"}
                </span>
              ) : null}
              {question.explanation ? (
                <span className="max-w-prose text-sm break-words text-muted">
                  {question.explanation}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-xl leading-snug font-medium break-words sm:text-2xl">
                {question.question_text}
              </span>
              {choices && choices.length > 0 ? (
                <span className="mt-2 flex w-full max-w-lg flex-col gap-2 text-left">
                  {choices.map((choice, i) => (
                    <span
                      key={choice.text}
                      className="flex items-start gap-2.5 rounded-lg border border-line px-3 py-2"
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong text-[11px] font-semibold text-muted"
                      >
                        {OPTION_LABELS[i] ?? i + 1}
                      </span>
                      <span className="text-sm break-words">{choice.text}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </>
          )}
        </span>

        {revealed ? null : (
          <span className="absolute inset-x-0 bottom-5 px-6 text-xs text-muted">
            <span className="sm:hidden">Tap to reveal answer</span>
            <span className="hidden sm:inline">Click or press Space to reveal</span>
          </span>
        )}
      </button>

      {/* Outside the reveal button: a button may not nest inside a button, and
          starring must never flip the card. */}
      <div className="absolute top-3 right-3">
        {/* StarButton seeds its state from the prop, so it has to remount when
            the card changes or it would show the previous question's star. */}
        <StarButton
          key={question.id}
          questionId={question.id}
          starred={starred}
          size="sm"
          onChange={onStarChange}
        />
      </div>
    </div>
  );
}
