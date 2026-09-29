import { notFound, redirect } from "next/navigation";

import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getDeck, getStudyQuestions, listDeckQuestions } from "@/lib/data";
import type { StudyQuestion } from "@/lib/types";

import { LearnSession } from "./LearnSession";

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]/learn">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `Learn · ${deck.name}` : "Learn · Memorizer" };
}

export default async function LearnPage({ params, searchParams }: PageProps<"/decks/[deckId]/learn">) {
  const { deckId } = await params;
  const sp = await searchParams;

  const session = await getSession();
  if (!session) redirect("/login");

  const deck = await getDeck(deckId);
  if (!deck) notFound();

  const [questions, summaries] = await Promise.all([
    getStudyQuestions(deckId, session.profileId),
    listDeckQuestions(deckId, session.profileId),
  ]);
  const starredIds = summaries.filter((summary) => summary.starred).map((summary) => summary.id);

  const ids = firstValue(sp.ids);
  const only = firstValue(sp.only);

  let filtered: StudyQuestion[] = questions;
  let emptyTitle = "Nothing to study here";
  let emptyDescription = "This deck does not have any questions yet.";

  if (ids) {
    const wanted = new Set(
      ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    filtered = questions.filter((question) => wanted.has(question.id));
    emptyTitle = "Nothing to review here";
    emptyDescription = "Those questions are no longer part of this deck.";
  } else if (only === "missed") {
    filtered = questions.filter((question) => question.progress?.last_result === false);
    emptyTitle = "Nothing to review here";
    emptyDescription = "You have not missed any questions in this deck. Study the whole deck instead.";
  }

  if (filtered.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Learn · ${deck.name}`} subtitle={deck.course?.name ?? undefined} />
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={<ButtonLink href={`/decks/${deckId}`}>Back to deck</ButtonLink>}
        />
      </div>
    );
  }

  return (
    <LearnSession
      deckId={deckId}
      deckName={deck.name}
      questions={filtered}
      profileId={session.profileId}
      starredIds={starredIds}
      focusedReview={Boolean(ids)}
    />
  );
}
