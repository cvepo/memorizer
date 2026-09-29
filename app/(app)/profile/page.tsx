import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/app/(app)/profile/ProfileForm";
import { getSession } from "@/lib/auth";
import { listProfiles } from "@/lib/data";
import { redirect } from "next/navigation";

export const metadata = { title: "Profile · BIOMI Study" };

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
    </div>
  );
}
