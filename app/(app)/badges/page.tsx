import { redirect } from "next/navigation";

import { BadgeCelebration } from "@/components/BadgeCelebration";
import { Card, PageHeader, ProgressBar, Stat, cn } from "@/components/ui";
import { getSession } from "@/lib/auth";
import {
  BADGE_EMOJI,
  BADGE_TIERS,
  TONE_RING,
  nextTier,
  previousThreshold,
} from "@/lib/badges";
import { getBadgeState } from "@/lib/data";

export const metadata = { title: "Badges · Memorizer" };

export default async function BadgesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { lifetimeCorrect, badges } = await getBadgeState(session.profileId);
  const earned = new Map(badges.map((b) => [b.key, b]));
  const next = nextTier(lifetimeCorrect);
  const from = previousThreshold(next);

  return (
    <div className="space-y-8">
      {/* Backfilled badges are announced once here; new ones are celebrated while studying. */}
      <BadgeCelebration badges={badges.filter((b) => b.backfilled)} />

      <PageHeader
        title="Badges"
        subtitle="Earned for every correct answer you give in Learn and quizzes."
      />

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Correct answers" value={lifetimeCorrect.toLocaleString()} tone="success" />
        <Stat label="Badges earned" value={`${badges.length} / ${BADGE_TIERS.length}`} />
      </div>

      <Card className="space-y-2">
        {next ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">Next badge: {next.name}</p>
              <p className="text-sm text-muted tabular-nums">
                {lifetimeCorrect.toLocaleString()} / {next.threshold.toLocaleString()}
              </p>
            </div>
            <ProgressBar value={lifetimeCorrect - from} total={next.threshold - from} tone="accent" />
          </>
        ) : (
          <p className="font-medium">You&rsquo;ve earned every badge. Nicely done!</p>
        )}
      </Card>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BADGE_TIERS.map((tier) => {
          const badge = earned.get(tier.key);
          return (
            <li key={tier.key}>
              <Card className={cn("flex h-full items-center gap-4", !badge && "opacity-60")}>
                <span
                  aria-hidden
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 bg-sunken text-3xl",
                    badge ? TONE_RING[tier.tone] : "border-line grayscale",
                  )}
                >
                  {BADGE_EMOJI}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{tier.name}</p>
                  <p className="text-sm text-muted">
                    {tier.threshold.toLocaleString()} correct answers
                  </p>
                  <p className="text-xs text-muted">
                    {badge
                      ? badge.backfilled
                        ? "Earned before badges existed"
                        : `Earned ${new Date(badge.earnedAt).toLocaleDateString()}`
                      : "Locked"}
                  </p>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
