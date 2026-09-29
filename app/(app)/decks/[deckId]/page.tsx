import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeckAdmin } from "@/app/(app)/decks/[deckId]/DeckAdmin";
import { ButtonLink, Card, PageHeader, ProgressBar, Stat, buttonClass } from "@/components/ui";
import { getSession } from "@/lib/auth";
import {
  accuracy,
  deckStatsByDeck,
  emptyStats,
  getDeck,
  listQuizAttempts,
  topicStats,
} from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `${deck.name} · BIOMI Study` : "Deck · BIOMI Study" };
}

export default async function DeckPage({ params }: PageProps<"/decks/[deckId]">) {
  const { deckId } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const deck = await getDeck(deckId);
  if (!deck) notFound();

  const [statsMap, topics, attempts] = await Promise.all([
    deckStatsByDeck(session.profileId),
    topicStats(deckId, session.profileId),
    listQuizAttempts(deckId, session.profileId),
  ]);

  const stats = statsMap.get(deckId) ?? emptyStats(deckId);
  const deckAccuracy = accuracy(stats);
  const isAdmin = session.role === "admin";
  const hasQuestions = stats.total_questions > 0;
  const showTopics = topics.length > 1 || (topics.length === 1 && topics[0].topic !== "Untagged");

  return (
    <div className="space-y-6">
      {deck.course ? (
        <Link
          href={`/courses/${deck.course.id}`}
          className="inline-block text-sm text-muted transition-colors duration-150 hover:text-ink"
        >
          ← {deck.course.name}
        </Link>
      ) : null}

      <PageHeader title={deck.name} subtitle={deck.description} />

      <Card className="space-y-5">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{stats.total_questions}</p>
          <p className="text-xs text-muted">
            {stats.total_questions === 1 ? "question" : "questions"} in this deck
          </p>
        </div>

        <ProgressBar value={stats.mastered} total={stats.total_questions} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Mastered" value={stats.mastered} tone="success" />
          <Stat label="Learning" value={stats.learning} tone="accent" />
          <Stat label="Unseen" value={stats.unseen} tone="muted" />
          <Stat label="Accuracy" value={deckAccuracy === null ? "—" : `${deckAccuracy}%`} />
          <Stat label="Answers submitted" value={stats.total_answers} />
        </div>

        <div className="flex flex-wrap gap-2">
          {hasQuestions ? (
            <>
              <ButtonLink href={`/decks/${deck.id}/flashcards`} variant="secondary" size="lg">
                Flashcards
              </ButtonLink>
              <ButtonLink href={`/decks/${deck.id}/learn`} variant="primary" size="lg">
                Learn
              </ButtonLink>
              <ButtonLink href={`/decks/${deck.id}/quiz`} variant="secondary" size="lg">
                Quiz
              </ButtonLink>
            </>
          ) : (
            <>
              <span className={buttonClass("secondary", "lg", "opacity-50 pointer-events-none")}>
                Flashcards
              </span>
              <span className={buttonClass("secondary", "lg", "opacity-50 pointer-events-none")}>
                Learn
              </span>
              <span className={buttonClass("secondary", "lg", "opacity-50 pointer-events-none")}>
                Quiz
              </span>
            </>
          )}
          {isAdmin ? (
            <ButtonLink href={`/decks/${deck.id}/edit`} variant="ghost" size="lg">
              Edit deck
            </ButtonLink>
          ) : null}
        </div>

        {hasQuestions ? null : (
          <p className="text-sm text-muted">Import or add questions before studying.</p>
        )}
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

      {isAdmin ? <DeckAdmin deck={deck} /> : null}
    </div>
  );
}
