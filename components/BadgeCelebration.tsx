"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, cn } from "@/components/ui";
import { acknowledgeBadges } from "@/lib/actions/badges";
import { BADGE_EMOJI, TONE_RING, tierForKey, type EarnedBadge } from "@/lib/badges";

/**
 * Celebrates badges the person has not seen yet.
 *
 * It floats at the bottom of the screen rather than taking over, so it never
 * blocks studying or captures the keyboard shortcuts. Each badge is shown once
 * per page and is only marked as seen on the server when the card is
 * dismissed, so closing the tab early leaves it waiting for next time.
 *
 * Badges awarded by the launch backfill are folded into one message instead of
 * a popup each.
 */
export function BadgeCelebration({ badges }: { badges: EarnedBadge[] }) {
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());

  const waiting = badges.filter((b) => !b.acknowledged && !handled.has(b.key) && tierForKey(b.key));
  const fresh = waiting.filter((b) => !b.backfilled);
  const backfilled = waiting.filter((b) => b.backfilled);
  // New badges first; the backfill summary waits its turn.
  const showing = fresh.length > 0 ? fresh : backfilled;
  const isBackfill = fresh.length === 0 && backfilled.length > 0;

  const dismiss = () => {
    const keys = showing.map((b) => b.key);
    if (keys.length === 0) return;
    setHandled((current) => new Set([...current, ...keys]));
    acknowledgeBadges(keys).catch(() => {
      // Left unacknowledged on the server, so it is simply shown again next time.
    });
  };

  const hasCard = showing.length > 0;
  useEffect(() => {
    if (!hasCard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCard, showing.map((b) => b.key).join(",")]);

  if (showing.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-sm space-y-3 rounded-2xl border border-line-strong bg-surface p-4 shadow-lg"
      >
        {isBackfill ? (
          <div className="flex items-center gap-3">
            <span aria-hidden className="text-3xl">
              {BADGE_EMOJI}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">
                You&rsquo;ve already earned {showing.length} {showing.length === 1 ? "badge" : "badges"}
              </p>
              <p className="text-sm text-muted">
                Your past correct answers count. See them on the{" "}
                <Link
                  href="/badges"
                  className="inline-flex min-h-11 items-center text-accent underline"
                  onClick={dismiss}
                >
                  Badges page
                </Link>
                .
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {showing.map((badge) => {
              const tier = tierForKey(badge.key)!;
              return (
                <li key={badge.key} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-sunken text-2xl motion-safe:animate-bounce",
                      TONE_RING[tier.tone],
                    )}
                  >
                    {BADGE_EMOJI}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">🎉 New badge: {tier.name}</p>
                    <p className="text-sm text-muted">
                      {tier.threshold.toLocaleString("en-US")} correct answers!
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end">
          <Button size="md" variant="secondary" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
