"use client";

import { cn } from "@/components/ui";

export type OptionState = "idle" | "selected" | "correct" | "incorrect" | "missed";

/**
 * One multiple-choice option. Large tap target, clear selected/correct/
 * incorrect states, and the letter key shown so keyboard shortcuts are
 * discoverable.
 *
 *   selected  — chosen but not yet graded
 *   correct   — chosen and right
 *   incorrect — chosen and wrong
 *   missed    — not chosen, but this was the right answer
 *
 * `multi` switches the affordance to a checkbox: a square marker that stays
 * lit while more options are picked, so it reads as "choose several" before
 * the learner has read the stem.
 */
export function MCQOption({
  label,
  text,
  state,
  onSelect,
  disabled,
  multi = false,
}: {
  label: string;
  text: string;
  state: OptionState;
  onSelect?: () => void;
  disabled?: boolean;
  multi?: boolean;
}) {
  const chosen = state === "selected" || state === "correct" || state === "incorrect";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      role={multi ? "checkbox" : undefined}
      aria-checked={multi ? chosen : undefined}
      aria-pressed={multi ? undefined : chosen}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-150",
        "min-h-14 disabled:cursor-default",
        state === "idle" && "border-line bg-surface hover:border-line-strong hover:bg-sunken",
        state === "selected" && "tint-accent",
        state === "correct" && "tint-success",
        state === "incorrect" && "tint-danger",
        state === "missed" && "tint-success border-dashed",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold",
          multi ? "rounded-[6px]" : "rounded-md",
          state === "idle" && "border-line-strong text-muted",
          state === "selected" && "border-transparent bg-accent text-accent-fg",
          state === "correct" && "border-transparent bg-success text-success-fg",
          state === "incorrect" && "border-transparent bg-danger text-danger-fg",
          state === "missed" && "border-success text-success",
        )}
        aria-hidden
      >
        {state === "correct" || state === "missed"
          ? "✓"
          : state === "incorrect"
            ? "✕"
            : state === "selected" && multi
              ? "✓"
              : label}
      </span>
      <span className="text-[15px] leading-snug">{text}</span>
    </button>
  );
}

export const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
