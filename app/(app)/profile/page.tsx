import { CheckpointPreference } from "@/app/(app)/profile/CheckpointPreference";
import { ProfileForm } from "@/app/(app)/profile/ProfileForm";
import { PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { listProfiles } from "@/lib/data";
import { redirect } from "next/navigation";

export const metadata = { title: "Profile · Memorizer" };

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const profiles = await listProfiles();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        subtitle="Everyone shares the same decks. Progress and quiz history are per name."
      />
      <ProfileForm current={session.profileName} profiles={profiles.map((p) => p.name)} />
      <section className="max-w-md space-y-3">
        <h2 className="text-lg font-medium">Learn</h2>
        <CheckpointPreference profileId={session.profileId} />
      </section>
    </div>
  );
}
