"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { Card, cn } from "@/components/ui";

type Point = {
  date: string;
  mastered: number;
  accuracy: number | null;
  minutes: number;
};

type SeriesKey = "mastered" | "accuracy" | "minutes";
type AxisId = "count" | "percent";

// --danger is reserved for wrong answers, so minutes take --star, the other
// distinct token that still follows the theme.
const SERIES: {
  key: SeriesKey;
  label: string;
  tooltip: string;
  stroke: string;
  yAxisId: AxisId;
}[] = [
  { key: "mastered", label: "Mastery", tooltip: "Cumulative mastery", stroke: "var(--success)", yAxisId: "count" },
  { key: "accuracy", label: "Accuracy", tooltip: "Accuracy", stroke: "var(--accent)", yAxisId: "percent" },
  { key: "minutes", label: "Study time", tooltip: "Study time (est.)", stroke: "var(--star)", yAxisId: "count" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parseDay(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatDay(iso: string, withYear: boolean): string {
  const parsed = parseDay(iso);
  if (!parsed) return iso;
  const base = `${MONTHS[parsed.month - 1]} ${parsed.day}`;
  return withYear ? `${base}, ${parsed.year}` : base;
}

function isSeriesKey(value: unknown): value is SeriesKey {
  return value === "mastered" || value === "accuracy" || value === "minutes";
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatSeriesValue(key: SeriesKey, value: number): string {
  if (key === "accuracy") return `${Math.round(value)}%`;
  if (key === "minutes") {
    const rounded = Math.round(value);
    if (value > 0 && rounded === 0) return "< 1 min";
    return `${rounded.toLocaleString()} min`;
  }
  return `${Math.round(value).toLocaleString()} questions`;
}

function seriesByKey(key: SeriesKey) {
  return SERIES.find((series) => series.key === key);
}

function StudyTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || payload.length === 0) return null;

  const rows = payload.flatMap((item) => {
    if (!isSeriesKey(item.dataKey)) return [];
    const series = seriesByKey(item.dataKey);
    if (!series) return [];
    const value = numericValue(item.value);
    return [
      {
        key: series.key,
        label: series.tooltip,
        stroke: series.stroke,
        text: value === null ? "—" : formatSeriesValue(series.key, value),
      },
    ];
  });
  if (rows.length === 0) return null;

  const date = label == null ? "" : formatDay(String(label), true);

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{date}</p>
      <ul className="mt-1.5 space-y-1.5">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.stroke }} />
              {row.label}
            </span>
            <span className="mt-0.5 block pl-3.5 font-medium tabular-nums text-ink">{row.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StudyChart({ points }: { points: Point[] }) {
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    mastered: true,
    accuracy: true,
    minutes: true,
  });

  const showCount = visible.mastered || visible.minutes;
  const showPercent = visible.accuracy;
  const withYear = points.length > 1 && points[0].date.slice(0, 4) !== points[points.length - 1].date.slice(0, 4);
  const loneDay = points.length === 1;

  return (
    <Card className="min-w-0 space-y-4">
      <div role="group" aria-label="Chart series" className="flex flex-wrap gap-2">
        {SERIES.map((series) => {
          const on = visible[series.key];
          return (
            <button
              key={series.key}
              type="button"
              aria-pressed={on}
              onClick={() => setVisible((current) => ({ ...current, [series.key]: !current[series.key] }))}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
                on ? "bg-surface-2 text-ink" : "border-line bg-surface text-muted",
              )}
              style={on ? { borderColor: series.stroke } : undefined}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: series.stroke, opacity: on ? 1 : 0.4 }}
              />
              {series.label}
            </button>
          );
        })}
      </div>

      {showCount || showPercent ? (
        <div className="h-[260px] w-full min-w-0 max-w-full">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                // Keeps the first and last day and drops labels that would
                // collide. A fixed skip count cannot do both 320px and a laptop.
                interval="preserveStartEnd"
                minTickGap={8}
                tickFormatter={(value) => formatDay(String(value), withYear)}
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
                height={32}
              />
              {/*
                Two axes, so the lines can stay on together. Accuracy is a
                percent and would read as a question count on a shared scale,
                so it keeps the right axis, locked to 0–100. Mastery (a running
                total) and study minutes (that day's estimate) are both counts
                and share the left: a third axis runs into its own labels at
                320px, and the toggles are how you drop whichever series that
                scale is hiding.
              */}
              {showCount ? (
                <YAxis
                  yAxisId="count"
                  orientation="left"
                  width={48}
                  allowDecimals={false}
                  // A flat zero has no span, and the axis collapses to a line.
                  domain={[0, (dataMax: number) => (dataMax <= 0 ? 1 : dataMax)]}
                  tickFormatter={(value) => Math.round(Number(value)).toLocaleString()}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
              ) : null}
              {showPercent ? (
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  domain={[0, 100]}
                  width={48}
                  allowDecimals={false}
                  tickFormatter={(value) => `${Math.round(Number(value))}%`}
                  tick={{ fontSize: 12, fill: "var(--muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
              ) : null}
              <Tooltip
                content={StudyTooltip}
                filterNull={false}
                isAnimationActive={false}
                cursor={{ stroke: "var(--border)" }}
                itemSorter={(item) => {
                  const index = SERIES.findIndex((series) => series.key === item.dataKey);
                  return index === -1 ? SERIES.length : index;
                }}
              />
              {SERIES.map((series) =>
                visible[series.key] ? (
                  <Line
                    key={series.key}
                    // Linear, not monotone: a smoothed curve overshoots a
                    // cumulative count. A single day has no segment, so that
                    // point has to be drawn itself.
                    type="linear"
                    dataKey={series.key}
                    name={series.tooltip}
                    yAxisId={series.yAxisId}
                    stroke={series.stroke}
                    strokeWidth={2}
                    dot={loneDay ? { r: 4, fill: series.stroke, stroke: series.stroke } : false}
                    activeDot={{ r: 4, fill: series.stroke, stroke: series.stroke }}
                    connectNulls={false}
                    // The default replays whenever a series is toggled, and
                    // "auto" only listens for prefers-reduced-motion, not the
                    // in-app Animations switch.
                    isAnimationActive={false}
                  />
                ) : null,
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="flex h-[260px] items-center justify-center text-center text-sm text-muted">
          Turn on a series to plot it.
        </p>
      )}
    </Card>
  );
}
