"use client";

import { useId } from "react";

import { cn } from "@/components/ui";

/**
 * One native range input, so keyboard, screen readers and touch behave the
 * way people expect. A custom drag surface would have to reimplement all of
 * that. The thumb stays 20px — the size the old two-handle slider used — so
 * the hit target does not get smaller.
 */
export function Slider({
  min,
  max,
  value,
  onChange,
  label,
  formatValue = (n) => String(n),
  hint,
  id,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (next: number) => void;
  label: string;
  formatValue?: (n: number) => string;
  hint?: string;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const span = Math.max(1, max - min);
  const fill = Math.min(100, Math.max(0, ((value - min) / span) * 100));

  const thumb =
    "absolute inset-0 h-2 w-full cursor-pointer appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-accent " +
    "[&::-webkit-slider-thumb]:cursor-grab " +
    "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg " +
    "[&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:cursor-grab";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="min-w-0 text-sm font-medium">
          {label}
        </label>
        <span className="shrink-0 text-sm tabular-nums text-muted" aria-hidden>
          {formatValue(value)}
        </span>
      </div>

      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1.5 h-2 rounded-full bg-sunken" />
        <div
          className="absolute top-1.5 left-0 h-2 rounded-full bg-accent"
          style={{ width: `${fill}%` }}
        />
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          aria-describedby={hint ? hintId : undefined}
          className={cn(thumb, "top-0")}
        />
      </div>

      <div className="flex justify-between text-xs tabular-nums text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>

      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
