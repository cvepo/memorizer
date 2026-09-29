import { redirect } from "next/navigation";

import { DeckCard } from "@/components/DeckCard";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { deckStatsByDeck, emptyStats, listDecksWithCourse, recentStudyActivity } from "@/lib/data";

export const metadata = { title: "Decks · Memorizer" };

// study_activity holds one row per (profile, deck); a generous limit keeps
// the whole history in view instead of only the ten most recent decks.
const ACTIVITY_LIMIT = 500;

export default async function DecksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [decks, statsMap, activity] = await Promise.all([
    listDecksWithCourse(),
    deckStatsByDeck(session.profileId),
    recentStudyActivity(session.profileId, ACTIVITY_LIMIT),
  ]);

  const isAdmin = session.role === "admin";

  const lastStudiedAtByDeck = new Map(activity.map((row) => [row.deck_id, row.last_studied_at]));
  const sortedDecks = [...decks].sort((a, b) => {
    const aTime = lastStudiedAtByDeck.get(a.id);
    const bTime = lastStudiedAtByDeck.get(b.id);
    if (aTime && bTime) return new Date(bTime).getTime() - new Date(aTime).getTime();
    if (aTime) return -1;
    if (bTime) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Decks" subtitle="Every deck across all courses." />

      {sortedDecks.length === 0 ? (
        <EmptyState
          title="No decks yet"
          description={
            isAdmin
              ? "Import a spreadsheet of questions to create your first deck."
              : "Once an admin adds a deck it will show up here."
          }
          action={isAdmin ? <ButtonLink href="/import">Import questions</ButtonLink> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sortedDecks.map((deck) => (
            <DeckCard
              key={deck.id}
              deckId={deck.id}
              name={deck.name}
              courseName={deck.course?.name ?? null}
              description={deck.description}
              stats={statsMap.get(deck.id) ?? emptyStats(deck.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
