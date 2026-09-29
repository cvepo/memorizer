"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, EmptyState, Input, cn } from "@/components/ui";
import { StarButton } from "@/components/StarButton";
import { MASTERY_LABELS, type MasteryLevel } from "@/lib/learnAlgorithm";
import type { QuestionSummary } from "@/lib/types";

const PAGE_SIZE = 25;

type FilterValue = "all" | "needsReview" | "starred";

function masteryLabel(masteryCount: number) {
  const level = Math.max(0, Math.min(3, masteryCount)) as MasteryLevel;
  return MASTERY_LABELS[level];
}

/** Mirrors `NEEDS_REVIEW_THRESHOLD` in `@/lib/data`, reimplemented here since
 * that module is server-only and this is a client component. */
function isNeedsReview(question: QuestionSummary) {
  return question.times_incorrect >= 2 && question.mastery_count < 3;
}

/**
 * Search + filter + paginate a deck's full question list. Self-contained:
 * fetches nothing, owns only local UI state, and renders 25 rows at a time so
 * a 200+ question deck never mounts every row at once.
 */
export function BrowseQuestions({ questions, deckId }: { questions: QuestionSummary[]; deckId: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => ({
      all: questions.length,
      needsReview: questions.filter(isNeedsReview).length,
      starred: questions.filter((question) => question.starred).length,
    }),
    [questions],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return questions.filter((question) => {
      if (filter === "needsReview" && !isNeedsReview(question)) return false;
      if (filter === "starred" && !question.starred) return false;
      if (!term) return true;
      return (
        question.question_text.toLowerCase().includes(term) ||
        question.correct_answer.toLowerCase().includes(term)
      );
    });
  }, [questions, filter, query]);

  const visible = filtered.slice(0, visibleCount);

  function handleQueryChange(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  function handleFilterChange(value: FilterValue) {
    setFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chips: { value: FilterValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "needsReview", label: "Needs review", count: counts.needsReview },
    { value: "starred", label: "Starred", count: counts.starred },
  ];

  return (
    <div className="space-y-4">
      <Input
        type="search"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder="Search questions or answers"
        aria-label="Search questions or answers"
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions">
        {chips.map((chip) => {
          const active = filter === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => handleFilterChange(chip.value)}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                active
                  ? "border-transparent bg-accent text-accent-fg"
                  : "border-line text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {chip.label}
              <span className={cn("tabular-nums", active ? "text-accent-fg/80" : "text-muted")}>
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No questions match"
          description="Try a different search term or filter."
        />
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((question) => {
              const isExpanded = expanded.has(question.id);
              return (
                <Card key={question.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium text-ink">
                      {question.question_text}
                    </p>
                    <StarButton
                      questionId={question.id}
                      starred={question.starred}
                      size="sm"
                      className="shrink-0"
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {isNeedsReview(question) ? (
                      <span className="text-danger">Missed {question.times_incorrect} times</span>
                    ) : null}
                    {question.topic ? <Badge>{question.topic}</Badge> : null}
                    <span>{masteryLabel(question.mastery_count)}</span>
                  </div>

                  {isExpanded ? (
                    <p className="mt-3 rounded-lg bg-sunken p-3 text-sm text-ink">
                      {question.correct_answer}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(question.id)}
                      aria-expanded={isExpanded}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
                    >
                      {isExpanded ? "Hide answer" : "Show answer"}
                    </button>
                    <Link
                      href={`/decks/${deckId}?q=${question.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-ink hover:text-accent hover:underline"
                    >
                      Open this question in flashcards →
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-3 text-sm text-muted">
            <p>
              Showing {visible.length} of {filtered.length}
            </p>
            {visible.length < filtered.length ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Show more
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
