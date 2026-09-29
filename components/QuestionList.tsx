"use client";

import Link from "next/link";

import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { StarButton } from "@/components/StarButton";
import { MASTERY_LABELS, type MasteryLevel } from "@/lib/learnAlgorithm";
import type { QuestionSummary } from "@/lib/types";

function masteryLabel(masteryCount: number) {
  const level = Math.max(0, Math.min(3, masteryCount)) as MasteryLevel;
  return MASTERY_LABELS[level];
}

/**
 * Shared row list for Needs review, Starred and any other question subset.
 * Self-contained: the deck page passes a plain question set plus copy and
 * decides what "practice these" link (if any) should point at.
 */
export function QuestionList({
  questions,
  deckId,
  emptyTitle,
  emptyDescription,
  practiceHref,
  practiceLabel,
  showReason,
}: {
  questions: QuestionSummary[];
  deckId: string;
  emptyTitle: string;
  emptyDescription?: string;
  practiceHref: string | null;
  practiceLabel: string;
  showReason: boolean;
}) {
  if (questions.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {practiceHref ? (
        <ButtonLink href={practiceHref} variant="primary">
          {practiceLabel}
        </ButtonLink>
      ) : null}

      <div className="space-y-2">
        {questions.map((question) => (
          <Card key={question.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-ink">
                {question.question_text}
              </p>
              <StarButton questionId={question.id} starred={question.starred} size="sm" className="shrink-0" />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              {showReason ? (
                <span className="text-danger">Missed {question.times_incorrect} times</span>
              ) : null}
              {question.topic ? <Badge>{question.topic}</Badge> : null}
              <span>{masteryLabel(question.mastery_count)}</span>
            </div>

            <Link
              href={`/decks/${deckId}?q=${question.id}`}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
            >
              Open this question in flashcards →
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
