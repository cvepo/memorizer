"use client";

import { StarButton } from "@/components/StarButton";
import { cn } from "@/components/ui";
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
  onStarChange,
}: {
  question: StudyQuestion;
  revealed: boolean;
  onToggle: () => void;
  starred: boolean;
  index: number;
  total: number;
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
              {question.explanation ? (
                <span className="max-w-prose text-sm break-words text-muted">
                  {question.explanation}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xl leading-snug font-medium break-words sm:text-2xl">
              {question.question_text}
            </span>
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
