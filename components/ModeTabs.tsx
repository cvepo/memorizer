import Link from "next/link";

import { cn } from "@/components/ui";
import type { StudyMode } from "@/lib/types";

const MODES: { value: StudyMode; label: string; blurb: string; href: (id: string) => string }[] = [
  {
    value: "flashcards",
    label: "Flashcards",
    blurb: "Reveal answers and review at your own pace.",
    href: (id) => `/decks/${id}`,
  },
  {
    value: "learn",
    label: "Learn",
    blurb: "Practice questions and revisit the ones you miss.",
    href: (id) => `/decks/${id}/learn`,
  },
  {
    value: "quiz",
    label: "Quiz",
    blurb: "Test yourself and review your results.",
    href: (id) => `/decks/${id}/quiz`,
  },
];

/**
 * The three study modes. Rendered as links so each mode is its own URL and the
 * selected one is obvious without having to try it.
 */
export function ModeTabs({
  deckId,
  active,
  disabled = false,
}: {
  deckId: string;
  active: StudyMode;
  disabled?: boolean;
}) {
  return (
    <nav aria-label="Study modes" className="grid grid-cols-3 gap-2">
      {MODES.map((mode) => {
        const selected = mode.value === active;
        const shared =
          "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2.5 text-center transition-colors";

        if (disabled && !selected) {
          return (
            <span
              key={mode.value}
              aria-disabled
              className={cn(shared, "border-line bg-surface text-muted opacity-50")}
            >
              <span className="text-sm font-medium">{mode.label}</span>
            </span>
          );
        }

        return (
          <Link
            key={mode.value}
            href={mode.href(deckId)}
            aria-current={selected ? "page" : undefined}
            title={mode.blurb}
            className={cn(
              shared,
              selected
                ? "border-transparent bg-accent text-accent-fg"
                : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2",
            )}
          >
            <span className="text-sm font-medium">{mode.label}</span>
            <span
              className={cn(
                "hidden text-[11px] leading-tight sm:block",
                selected ? "text-accent-fg/80" : "text-muted",
              )}
            >
              {mode.blurb}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
