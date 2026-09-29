import { notFound, redirect } from "next/navigation";

import { Flashcards } from "@/app/(app)/decks/[deckId]/flashcards/Flashcards";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getDeck, getStudyQuestions } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]/flashcards">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `Flashcards · ${deck.name}` : "Flashcards" };
}

export default async function FlashcardsPage({ params }: PageProps<"/decks/[deckId]/flashcards">) {
  const { deckId } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const deck = await getDeck(deckId);
  if (!deck) notFound();

  const questions = await getStudyQuestions(deckId, session.profileId);

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={deck.name} subtitle="Flashcards" />
        <EmptyState
          title="This deck has no questions yet"
          description="Add or import questions and they will show up here as cards."
          action={
            <ButtonLink href={`/decks/${deckId}`} variant="secondary">
              Back to deck
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return <Flashcards deckId={deckId} deckName={deck.name} questions={questions} />;
}
