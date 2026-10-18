"use client";

import { useState } from "react";

import { Card, cn } from "@/components/ui";
import type { LeaderboardRow } from "@/lib/data";

type Period = "today" | "week";

const PERIODS: { value: Period; label: string; empty: string; mine: string; resets: string }[] = [
  {
    value: "today",
    label: "Today",
    empty: "No answers yet today.",
    mine: "You: 0 today",
    resets: "Resets at midnight ET",
  },
  {
    value: "week",
    label: "Week",
    empty: "No answers yet this week.",
    mine: "You: 0 this week",
    resets: "Resets Monday at midnight ET",
  },
];

/**
 * Who has answered the most questions, today or this week. Shown on the home
 * page, which is where everyone lands after signing in. Both boards arrive
 * with the page, so switching between them is instant.
 */
export function Leaderboard({
  today,
  week,
  currentProfileId,
}: {
  today: LeaderboardRow[];
  week: LeaderboardRow[];
  currentProfileId: string;
}) {
  const [period, setPeriod] = useState<Period>("today");
  const active = PERIODS.find((p) => p.value === period)!;
  const rows = period === "today" ? today : week;
  const me = rows.find((row) => row.profileId === currentProfileId);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Leaderboard</h2>
        <div
          role="radiogroup"
          aria-label="Leaderboard period"
          className="inline-flex rounded-lg border border-line bg-sunken p-0.5"
        >
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                period === option.value ? "bg-accent text-accent-fg" : "text-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{active.empty}</p>
      ) : (
        <ol className="space-y-1" aria-label={`Questions answered, ${active.label.toLowerCase()}`}>
          {rows.map((row) => {
            const isMe = row.profileId === currentProfileId;
            return (
              <li
                key={row.profileId}
                className={cn("flex min-h-9 items-center gap-3 rounded-lg px-2 text-sm", isMe && "tint-accent")}
              >
                <span className="w-6 text-right text-xs tabular-nums text-muted">{row.rank}</span>
                <span className="min-w-0 flex-1 truncate">
                  {row.name}
                  {isMe ? <span className="text-muted"> (you)</span> : null}
                </span>
                <span className="font-medium tabular-nums">{row.answered.toLocaleString("en-US")}</span>
              </li>
            );
          })}
          {/* Only worth saying when others are on the board and you are not. */}
          {me ? null : (
            <li className="flex min-h-9 items-center gap-3 px-2 text-sm text-muted">
              <span className="w-6" />
              <span className="flex-1">{active.mine}</span>
            </li>
          )}
        </ol>
      )}

      <p className="text-xs text-muted">Questions answered · {active.resets}</p>
    </Card>
  );
}
