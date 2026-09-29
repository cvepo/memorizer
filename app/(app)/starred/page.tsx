import { redirect } from "next/navigation";

import { StarredView } from "@/app/(app)/starred/StarredView";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { listStarredEverywhere } from "@/lib/data";

export const metadata = { title: "Starred · Memorizer" };

export default async function StarredPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const items = await listStarredEverywhere(session.profileId);

  return (
    <div className="space-y-6">
      <PageHeader title="Starred" subtitle="Questions you've starred across every deck." />

      {items.length === 0 ? (
        <EmptyState
          title="No starred questions yet"
          description="Star a question while studying and it will show up here."
          action={<ButtonLink href="/decks">Browse decks</ButtonLink>}
        />
      ) : (
        <StarredView items={items} />
      )}
    </div>
  );
}
