"use client";

import { startTransition, useOptimistic, useState } from "react";

import { cn } from "@/components/ui";
import { setStarred } from "@/lib/actions/activity";

/**
 * Star a question. Deliberately its own control rather than part of a card's
 * reveal target, so tapping the star never flips the card.
 */
export function StarButton({
  questionId,
  starred,
  size = "md",
  className,
  onChange,
}: {
  questionId: string;
  starred: boolean;
  size?: "sm" | "md";
  className?: string;
  onChange?: (starred: boolean) => void;
}) {
  const [saved, setSaved] = useState(starred);
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);

  function toggle(event: React.MouseEvent) {
    // The card behind this is a reveal target; never let the click through.
    event.preventDefault();
    event.stopPropagation();
    const next = !optimistic;

    startTransition(async () => {
      setOptimistic(next);
      try {
        await setStarred(questionId, next);
        setSaved(next);
        setFailed(false);
        onChange?.(next);
      } catch {
        setFailed(true);
      }
    });
  }

  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={optimistic}
      aria-label={optimistic ? "Remove star" : "Star this question"}
      title={failed ? "Could not save — try again" : optimistic ? "Starred" : "Star this question"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border transition-colors",
        box,
        optimistic
          ? "border-transparent text-star"
          : "border-line text-muted hover:border-line-strong hover:text-ink",
        failed && "border-danger",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden focusable="false">
        <path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z"
          fill={optimistic ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
