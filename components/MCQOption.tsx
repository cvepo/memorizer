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
 */
export function MCQOption({
  label,
  text,
  state,
  onSelect,
  disabled,
}: {
  label: string;
  text: string;
  state: OptionState;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={state === "selected" || state === "correct" || state === "incorrect"}
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
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
          state === "idle" && "border-line-strong text-muted",
          state === "selected" && "border-transparent bg-accent text-accent-fg",
          state === "correct" && "border-transparent bg-success text-success-fg",
          state === "incorrect" && "border-transparent bg-danger text-danger-fg",
          state === "missed" && "border-success text-success",
        )}
        aria-hidden
      >
        {state === "correct" || state === "missed" ? "✓" : state === "incorrect" ? "✕" : label}
      </span>
      <span className="text-[15px] leading-snug">{text}</span>
    </button>
  );
}

export const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
