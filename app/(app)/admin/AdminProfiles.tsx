"use client";

import Link from "next/link";
import { startTransition, useState } from "react";

import { Badge, Button, Card, ProgressBar, cn } from "@/components/ui";
import { deleteProfile } from "@/lib/actions/activity";
import { BADGE_EMOJI, BADGE_TIERS } from "@/lib/badges";
import type { ProfileOverview } from "@/lib/data";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"], [3600, "hour"], [86400, "day"], [604800, "week"], [2629800, "month"], [31557600, "year"],
  ];
  let value = seconds;
  let label = "second";
  for (const [size, name] of units) {
    if (seconds < size) break;
    value = Math.floor(seconds / size);
    label = name;
  }
  return `${value} ${label}${value === 1 ? "" : "s"} ago`;
}

const percent = (correct: number, answers: number) =>
  answers > 0 ? `${Math.round((correct / answers) * 100)}%` : "—";

/**
 * Activity tracking started later than answering did, so a profile can have
 * answers but no activity row. Saying "never studied" there would be false;
 * say the timing simply was not recorded.
 */
function lastStudiedLabel(profile: ProfileOverview): string {
  if (profile.lastStudiedAt) return `Last studied ${relativeTime(profile.lastStudiedAt)}`;
  if (profile.totals.answers > 0) return "Last studied before this was tracked";
  return "Has not studied yet";
}

const hasStudied = (profile: ProfileOverview) =>
  profile.lastStudiedAt !== null || profile.totals.answers > 0;

function DeleteProfile({ profile }: { profile: ProfileOverview }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!armed) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setArmed(true)}>
        Delete profile
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          setPending(true);
          startTransition(async () => {
            try {
              await deleteProfile(profile.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not delete that profile.");
              setPending(false);
              setArmed(false);
            }
          });
        }}
      >
        {pending ? "Deleting…" : `Delete ${profile.name} and all their progress`}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

export function AdminProfiles({
  profiles,
  currentProfileId,
}: {
  profiles: ProfileOverview[];
  currentProfileId: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(profiles[0]?.id ?? null);

  const ordered = [...profiles].sort((a, b) => {
    if (a.lastStudiedAt && b.lastStudiedAt) return b.lastStudiedAt.localeCompare(a.lastStudiedAt);
    if (a.lastStudiedAt) return -1;
    if (b.lastStudiedAt) return 1;
    // Neither has an activity row: whoever has actually answered comes first.
    if (a.totals.answers !== b.totals.answers) return b.totals.answers - a.totals.answers;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-3">
      {ordered.map((profile) => {
        const open = expanded === profile.id;
        const studiedDecks = profile.decks.filter((d) => d.answers > 0 || d.starred > 0 || d.lastStudiedAt);

        return (
          <Card key={profile.id} className="p-0">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : profile.id)}
              aria-expanded={open}
              className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{profile.name}</span>
                  {profile.id === currentProfileId ? <Badge tone="accent">You</Badge> : null}
                  {hasStudied(profile) ? null : <Badge>never studied</Badge>}
                </div>
                <p className="text-xs text-muted">
                  {lastStudiedLabel(profile)} · joined{" "}
                  {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm tabular-nums">
                <span className="text-success">{profile.totals.mastered} mastered</span>
                <span className="text-muted">{profile.totals.started} started</span>
                <span>{percent(profile.totals.correct, profile.totals.answers)} accuracy</span>
                <span className="text-muted">{profile.totals.answers} answers</span>
                <span aria-hidden className="text-xs text-muted">
                  {open ? "Hide" : "Details"}
                </span>
              </div>
            </button>

            {open ? (
              <div className="space-y-4 border-t border-line p-4">
                <p className="text-sm">
                  <span className="text-muted">Badges: </span>
                  {profile.badges.length === 0
                    ? "none yet"
                    : BADGE_TIERS.filter((t) => profile.badges.some((b) => b.key === t.key))
                        .map((t) => `${BADGE_EMOJI} ${t.name}`)
                        .join(" · ")}
                  <span className="text-muted tabular-nums">
                    {" "}
                    ({profile.lifetimeCorrect.toLocaleString("en-US")} correct all time)
                  </span>
                </p>
                {studiedDecks.length === 0 ? (
                  <p className="text-sm text-muted">
                    {profile.name} hasn&rsquo;t studied anything yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {studiedDecks.map((deck) => (
                      <div key={deck.deckId} className="space-y-2 rounded-xl border border-line p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <Link
                            href={`/decks/${deck.deckId}`}
                            className="font-medium hover:text-accent"
                          >
                            {deck.courseName ? `${deck.courseName} · ` : ""}
                            {deck.deckName}
                          </Link>
                          <span className="text-xs text-muted">
                            {deck.lastStudiedAt
                              ? `${deck.lastMode ?? "studied"} · ${relativeTime(deck.lastStudiedAt)}`
                              : "not studied"}
                          </span>
                        </div>

                        <ProgressBar value={deck.mastered} total={deck.totalQuestions} />

                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                          <span className="text-success">
                            {deck.mastered} / {deck.totalQuestions} mastered
                          </span>
                          <span className="text-muted">{deck.started} started</span>
                          <span>{percent(deck.correct, deck.answers)} accuracy</span>
                          <span className="text-muted">{deck.answers} answers</span>
                          {deck.needsReview > 0 ? (
                            <span className="text-danger">{deck.needsReview} need review</span>
                          ) : null}
                          {deck.starred > 0 ? (
                            <span className="text-star">{deck.starred} starred</span>
                          ) : null}
                          {deck.quizzes > 0 ? (
                            <span className="text-muted">
                              {deck.quizzes} quiz{deck.quizzes === 1 ? "" : "zes"}
                              {deck.bestQuizPercent !== null
                                ? ` · best ${Math.round(deck.bestQuizPercent)}%`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3",
                  )}
                >
                  <p className="text-xs text-muted">
                    Deleting a profile removes their progress, stars and quiz history. Decks and
                    questions are shared and are not affected.
                  </p>
                  {profile.id === currentProfileId ? (
                    <span className="text-xs text-muted">This is the profile you are using.</span>
                  ) : (
                    <DeleteProfile profile={profile} />
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
