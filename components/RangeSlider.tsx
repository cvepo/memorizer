"use client";

import { cn } from "@/components/ui";

/**
 * Two thumbs sharing one track, for picking a min/max range.
 *
 * Built from two native range inputs stacked on the track rather than a custom
 * drag implementation, so keyboard, screen readers and touch all behave the way
 * people expect. Pointer events are disabled on the inputs themselves and
 * re-enabled on the thumbs, so whichever thumb you press is the one that moves.
 */
export function RangeSlider({
  min,
  max,
  value,
  onChange,
  label,
  formatValue = (n) => String(n),
}: {
  min: number;
  max: number;
  value: { min: number; max: number };
  onChange: (next: { min: number; max: number }) => void;
  label: string;
  formatValue?: (n: number) => string;
}) {
  const span = Math.max(1, max - min);
  const leftPct = ((value.min - min) / span) * 100;
  const rightPct = ((value.max - min) / span) * 100;

  const setLow = (n: number) => onChange({ min: Math.min(n, value.max), max: value.max });
  const setHigh = (n: number) => onChange({ min: value.min, max: Math.max(n, value.min) });

  const thumb =
    "pointer-events-none absolute inset-0 h-2 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg [&::-webkit-slider-thumb]:bg-accent " +
    "[&::-webkit-slider-thumb]:cursor-grab " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg " +
    "[&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:cursor-grab";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted">
          {formatValue(value.min)} – {formatValue(value.max)}
        </span>
      </div>

      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1.5 h-2 rounded-full bg-sunken" />
        <div
          className="absolute top-1.5 h-2 rounded-full bg-accent"
          style={{ left: `${leftPct}%`, width: `${Math.max(0, rightPct - leftPct)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value.min}
          onChange={(e) => setLow(Number(e.target.value))}
          aria-label={`${label}, shortest`}
          className={cn(thumb, "top-0")}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value.max}
          onChange={(e) => setHigh(Number(e.target.value))}
          aria-label={`${label}, longest`}
          className={cn(thumb, "top-0")}
        />
      </div>

      <div className="flex justify-between text-xs tabular-nums text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
