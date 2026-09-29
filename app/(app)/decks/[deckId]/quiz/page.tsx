import { notFound, redirect } from "next/navigation";

import { QuizFlow } from "@/app/(app)/decks/[deckId]/quiz/QuizFlow";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getDeck, getDeckTopics, getStudyQuestions } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]/quiz">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `Quiz · ${deck.name}` : "Quiz · Memorizer" };
}

export default async function QuizPage({ params }: PageProps<"/decks/[deckId]/quiz">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { deckId } = await params;
  const deck = await getDeck(deckId);
  if (!deck) notFound();

  const [questions, topics] = await Promise.all([
    getStudyQuestions(deckId, session.profileId),
    getDeckTopics(deckId),
  ]);

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quiz" subtitle={deck.name} />
        <EmptyState
          title="No questions in this deck yet"
          description="There is nothing to quiz on until this deck has questions."
          action={
            <ButtonLink href={`/decks/${deckId}`} variant="secondary">
              Back to deck
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <QuizFlow
      profileId={session.profileId}
      deckId={deckId}
      deckName={deck.name}
      questions={questions}
      topics={topics}
    />
  );
}
