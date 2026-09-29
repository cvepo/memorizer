import { notFound, redirect } from "next/navigation";

import { DeckEditor } from "@/app/(app)/decks/[deckId]/edit/DeckEditor";
import { ButtonLink, EmptyState } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getDeck, getDeckTopics, getStudyQuestions } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]/edit">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `Edit · ${deck.name}` : "Edit deck · Memorizer" };
}

export default async function DeckEditPage({ params }: PageProps<"/decks/[deckId]/edit">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { deckId } = await params;

  if (session.role !== "admin") {
    return (
      <EmptyState
        title="Admin password required"
        description="Sign in with the admin password to edit study material."
        action={
          <ButtonLink href={`/decks/${deckId}`} variant="secondary">
            Back to deck
          </ButtonLink>
        }
      />
    );
  }

  const deck = await getDeck(deckId);
  if (!deck) notFound();

  const [questions, topics] = await Promise.all([
    getStudyQuestions(deckId, session.profileId),
    getDeckTopics(deckId),
  ]);

  return (
    <DeckEditor deckId={deckId} deckName={deck.name} questions={questions} topics={topics} />
  );
}
