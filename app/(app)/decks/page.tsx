import { redirect } from "next/navigation";

import { DeckCard } from "@/components/DeckCard";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { deckStatsByDeck, emptyStats, listDecksWithCourse } from "@/lib/data";

export const metadata = { title: "Decks · Memorizer" };

export default async function DecksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [decks, statsMap] = await Promise.all([
    listDecksWithCourse(),
    deckStatsByDeck(session.profileId),
  ]);

  const isAdmin = session.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Decks" subtitle="Every deck across all courses." />

      {decks.length === 0 ? (
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
          {decks.map((deck) => (
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
