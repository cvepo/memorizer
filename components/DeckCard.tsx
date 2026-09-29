import Link from "next/link";

import { MasteryBreakdown, ProgressBar } from "@/components/ui";
import type { DeckStats } from "@/lib/types";

/**
 * Deck summary tile used on Home, Courses and Decks. The whole card is one
 * link; study-mode buttons live on the deck page itself.
 */
export function DeckCard({
  deckId,
  name,
  courseName,
  description,
  stats,
}: {
  deckId: string;
  name: string;
  courseName?: string | null;
  description?: string | null;
  stats: DeckStats;
}) {
  const accuracy =
    stats.total_answers > 0 ? Math.round((stats.total_correct / stats.total_answers) * 100) : null;

  return (
    <Link
      href={`/decks/${deckId}`}
      className="block rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {courseName ? <p className="text-xs text-muted">{courseName}</p> : null}
          <h3 className="truncate font-medium">{name}</h3>
        </div>
        <p className="shrink-0 text-sm text-muted tabular-nums">
          {stats.total_questions} {stats.total_questions === 1 ? "question" : "questions"}
        </p>
      </div>

      {description ? <p className="mt-1.5 line-clamp-2 text-sm text-muted">{description}</p> : null}

      <div className="mt-4 space-y-2">
        <ProgressBar value={stats.mastered} total={stats.total_questions} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MasteryBreakdown
            mastered={stats.mastered}
            learning={stats.learning}
            unseen={stats.unseen}
          />
          {accuracy !== null ? <span className="text-sm text-muted">{accuracy}% accuracy</span> : null}
        </div>
      </div>
    </Link>
  );
}
