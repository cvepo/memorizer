import { redirect } from "next/navigation";

import { AnalyticsControls } from "@/app/(app)/admin/AnalyticsControls";
import { StudyChart } from "@/components/StudyChart";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { studyAnalytics, type Timeframe } from "@/lib/analytics";
import { getSession } from "@/lib/auth";
import { listProfiles } from "@/lib/data";

export const metadata = { title: "Analytics · Memorizer" };

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw : undefined;
}

function parseTimeframe(value: string | undefined): Timeframe {
  if (value === "7d" || value === "30d" || value === "all") return value;
  return "30d";
}

function formatAccuracy(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}%`;
}

// Rounded on purpose. The span is a difference of timestamps, not a stopwatch.
function formatStudyTime(minutes: number): string {
  const rounded = Math.round(minutes);
  if (minutes > 0 && rounded === 0) return "< 1 min";
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "admin") {
    return (
      <EmptyState
        title="Admin password required"
        description="Sign in with the admin password to see how everyone is doing."
      />
    );
  }

  // profile and timeframe come from the query string so a view is linkable
  // and this page can stay a server component. Unknown values fall back to
  // everyone and the last 30 days.
  const { profile: profileParam, timeframe: timeframeParam } = await searchParams;
  const profiles = await listProfiles();
  const requestedProfile = firstParam(profileParam);
  const profileId =
    requestedProfile && requestedProfile !== "all" && profiles.some((profile) => profile.id === requestedProfile)
      ? requestedProfile
      : undefined;
  const timeframe = parseTimeframe(firstParam(timeframeParam));

  const { summary, timeline } = await studyAnalytics({ profileId, timeframe });
  const profileOptions = profiles
    .map((profile) => ({ id: profile.id, name: profile.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader title="Analytics" subtitle="Mastery, accuracy and estimated study time." />

      <AnalyticsControls profiles={profileOptions} profileId={profileId ?? "all"} timeframe={timeframe} />

      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Stat label="Answers" value={summary.totalAnswers.toLocaleString()} />
        <Stat label="Accuracy" value={formatAccuracy(summary.accuracy)} />
        <Stat label="Questions mastered" value={summary.mastered.toLocaleString()} tone="success" />
        <div className="min-w-0 max-w-sm">
          <Stat label="Study time (est.)" value={formatStudyTime(summary.estimatedMinutes)} tone="muted" />
          <p className="mt-1 text-xs text-muted">
            Estimated from the gaps between answer timestamps. Flashcard-only browsing is not included.
          </p>
        </div>
      </div>

      {timeline.length === 0 ? (
        <EmptyState
          title="No answers yet"
          description={
            profileId
              ? "This profile has not answered a question, so there is nothing to chart."
              : "No one has answered a question yet, so there is nothing to chart."
          }
        />
      ) : (
        <StudyChart points={timeline} />
      )}
    </div>
  );
}
