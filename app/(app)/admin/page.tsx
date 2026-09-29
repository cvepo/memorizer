import { redirect } from "next/navigation";

import { AdminProfiles } from "@/app/(app)/admin/AdminProfiles";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { profileOverviews } from "@/lib/data";

export const metadata = { title: "Admin · Memorizer" };

export default async function AdminPage() {
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

  const profiles = await profileOverviews();

  const totals = profiles.reduce(
    (acc, p) => ({
      answers: acc.answers + p.totals.answers,
      correct: acc.correct + p.totals.correct,
      mastered: acc.mastered + p.totals.mastered,
      active: acc.active + (p.lastStudiedAt || p.totals.answers > 0 ? 1 : 0),
    }),
    { answers: 0, correct: 0, mastered: 0, active: 0 },
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin"
        subtitle="Everyone studying this site, and how far along they are."
      />

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="Profiles" value={profiles.length} />
        <Stat label="Have studied" value={totals.active} tone="muted" />
        <Stat label="Answers submitted" value={totals.answers.toLocaleString()} tone="muted" />
        <Stat
          label="Overall accuracy"
          value={totals.answers > 0 ? `${Math.round((totals.correct / totals.answers) * 100)}%` : "—"}
        />
        <Stat label="Questions mastered" value={totals.mastered} tone="success" />
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No profiles yet"
          description="A profile is created the first time someone signs in and picks a name."
        />
      ) : (
        <AdminProfiles profiles={profiles} currentProfileId={session.profileId} />
      )}
    </div>
  );
}
