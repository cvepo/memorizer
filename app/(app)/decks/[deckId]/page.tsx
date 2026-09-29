import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeckAdmin } from "@/app/(app)/decks/[deckId]/DeckAdmin";
import { DeckStudy } from "@/app/(app)/decks/[deckId]/DeckStudy";
import { ModeTabs } from "@/components/ModeTabs";
import { ButtonLink, Card, EmptyState, ProgressBar } from "@/components/ui";
import { getSession } from "@/lib/auth";
import {
  accuracy,
  deckStatsByDeck,
  emptyStats,
  getDeck,
  getStudyQuestions,
  listDeckQuestions,
  listQuizAttempts,
  needsReview,
  reviewCountsByDeck,
  topicStats,
} from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `${deck.name} · Memorizer` : "Deck · Memorizer" };
}

export default async function DeckPage({ params }: PageProps<"/decks/[deckId]">) {
  const { deckId } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const deck = await getDeck(deckId);
  if (!deck) notFound();

  const [questions, statsMap, topics, attempts, reviewCounts, summaries] = await Promise.all([
    getStudyQuestions(deckId, session.profileId),
    deckStatsByDeck(session.profileId),
    topicStats(deckId, session.profileId),
    listQuizAttempts(deckId, session.profileId),
    reviewCountsByDeck(session.profileId),
    listDeckQuestions(deckId, session.profileId),
  ]);

  const stats = statsMap.get(deckId) ?? emptyStats(deckId);
  const deckAccuracy = accuracy(stats);
  const isAdmin = session.role === "admin";
  const showTopics = topics.length > 1 || (topics.length === 1 && topics[0].topic !== "Untagged");

  const total = summaries.length;
  const started = summaries.filter((q) => q.times_seen > 0).length;
  const mastered = summaries.filter((q) => q.mastery_count >= 3).length;
  const counts = reviewCounts.get(deckId);
  const starredIds = summaries.filter((q) => q.starred).map((q) => q.id);
  const needsReviewIds = summaries.filter(needsReview).map((q) => q.id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-3">
        {deck.course ? (
          <Link
            href={`/courses/${deck.course.id}`}
            className="inline-flex min-h-8 items-center text-sm text-muted transition-colors duration-150 hover:text-ink"
          >
            ← {deck.course.name}
          </Link>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{deck.name}</h1>
            <p className="mt-1 text-sm tabular-nums text-muted">
              {questions.length} {questions.length === 1 ? "question" : "questions"}
            </p>
            {deck.description ? (
              <p className="mt-1 max-w-prose text-sm text-muted">{deck.description}</p>
            ) : null}
          </div>

          {/* Deck settings and deletion stay out of the study surface; open, the
              disclosure takes the full row instead of squeezing beside the title. */}
          {isAdmin ? (
            <details className="w-full sm:w-auto [&[open]]:w-full">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden rounded-xl border border-line-strong bg-surface px-4 text-sm font-medium transition-colors duration-150 hover:bg-surface-2">
                Manage deck
              </summary>
              <div className="mt-3 space-y-3">
                <DeckAdmin deck={deck} />
                <ButtonLink href={`/decks/${deck.id}/edit`} variant="secondary">
                  Edit questions
                </ButtonLink>
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <ModeTabs deckId={deck.id} active="flashcards" disabled={questions.length === 0} />

      {questions.length === 0 ? (
        <EmptyState
          title="No questions yet"
          description={
            isAdmin
              ? "Add or import questions and this deck opens straight onto a flashcard."
              : "This deck has nothing to study yet. Check back once questions have been added."
          }
          action={
            isAdmin ? (
              <ButtonLink href={`/decks/${deck.id}/edit`}>Add questions</ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <DeckStudy
          deckId={deck.id}
          deckName={deck.name}
          questions={questions}
          starredIds={starredIds}
          needsReviewIds={needsReviewIds}
          profileId={session.profileId}
        />
      )}

      <Card className="space-y-3">
        <h2 className="font-medium">Learning progress</h2>

        {stats.total_answers === 0 ? (
          <p className="text-sm text-muted">Use Learn or Quiz to build your learning progress.</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="tabular-nums">{started}</span>{" "}
              {started === 1 ? "question" : "questions"} started ·{" "}
              <span className="tabular-nums">{total - started}</span> not yet studied
            </p>
            <div className="space-y-1.5">
              <p className="text-sm">
                Mastery — <span className="tabular-nums">{mastered}</span> of{" "}
                <span className="tabular-nums">{total}</span>
              </p>
              <ProgressBar value={mastered} total={total} />
            </div>
            <p className="text-sm">
              <span className="tabular-nums">{deckAccuracy ?? 0}%</span> accuracy across{" "}
              <span className="tabular-nums">{stats.total_answers}</span>{" "}
              {stats.total_answers === 1 ? "answer" : "answers"}
            </p>
          </>
        )}

        {counts && (counts.needs_review > 0 || counts.starred > 0) ? (
          <p className="text-sm text-muted">
            <span className="tabular-nums">{counts.needs_review}</span> to review ·{" "}
            <span className="tabular-nums">{counts.starred}</span> starred
          </p>
        ) : null}
      </Card>

      {showTopics ? (
        <Card className="space-y-4">
          <h2 className="font-medium">Accuracy by topic</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Questions
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Mastered
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Accuracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {topics.map((row) => {
                  const pct = accuracy(row);
                  return (
                    <tr key={row.topic} className="border-b border-line last:border-b-0">
                      <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                        {row.topic}
                      </th>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{row.total}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{row.mastered}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {pct === null ? <span className="text-muted">—</span> : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {attempts.length > 0 ? (
        <Card className="space-y-3">
          <h2 className="font-medium">Recent quizzes</h2>
          <ul className="divide-y divide-line">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link
                  href={`/decks/${deck.id}/quiz/${attempt.id}`}
                  className="-mx-2 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-surface-2"
                >
                  <span className="text-sm tabular-nums">
                    {attempt.score}/{attempt.total_questions}
                    <span className="ml-2 text-muted">{Math.round(attempt.percentage)}%</span>
                  </span>
                  <span className="text-sm text-muted">
                    {new Date(attempt.started_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
