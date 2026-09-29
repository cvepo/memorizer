import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink, Card, EmptyState, MasteryBreakdown, PageHeader, ProgressBar } from "@/components/ui";
import { DeckCard } from "@/components/DeckCard";
import { getSession } from "@/lib/auth";
import { deckStatsByDeck, emptyStats, listCourses, listDecksWithCourse } from "@/lib/data";

export const metadata = { title: "Study · BIOMI Study" };

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [courses, decks, deckStats] = await Promise.all([
    listCourses(),
    listDecksWithCourse(),
    deckStatsByDeck(session.profileId),
  ]);

  const isAdmin = session.role === "admin";

  // Best "continue studying" candidate: most learning+unseen remaining among
  // decks that still have something left to learn.
  const continueDeck = decks
    .map((deck) => ({ deck, stats: deckStats.get(deck.id) ?? emptyStats(deck.id) }))
    .filter(({ stats }) => stats.total_questions > 0 && stats.learning + stats.unseen > 0)
    .sort((a, b) => b.stats.learning + b.stats.unseen - (a.stats.learning + a.stats.unseen))[0];

  const recentDecks = decks.slice(0, 6);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Study"
        subtitle={`Welcome back, ${session.profileName}.`}
        actions={
          isAdmin ? (
            <>
              <ButtonLink href="/import">Import questions</ButtonLink>
              <ButtonLink href="/courses" variant="secondary">
                New course
              </ButtonLink>
            </>
          ) : null
        }
      />

      {continueDeck ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Continue studying</h2>
          <Card className="space-y-4">
            <div>
              {continueDeck.deck.course ? (
                <p className="text-xs text-muted">{continueDeck.deck.course.name}</p>
              ) : null}
              <h3 className="text-lg font-medium">{continueDeck.deck.name}</h3>
            </div>
            <ProgressBar value={continueDeck.stats.mastered} total={continueDeck.stats.total_questions} />
            <MasteryBreakdown
              mastered={continueDeck.stats.mastered}
              learning={continueDeck.stats.learning}
              unseen={continueDeck.stats.unseen}
            />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/decks/${continueDeck.deck.id}/learn`}>Continue Learn</ButtonLink>
              <ButtonLink href={`/decks/${continueDeck.deck.id}`} variant="secondary">
                Deck overview
              </ButtonLink>
            </div>
          </Card>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Courses</h2>
        {courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            action={isAdmin ? <ButtonLink href="/import">Import questions</ButtonLink> : null}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {courses.map((course) => {
              const courseDecks = decks.filter((deck) => deck.course_id === course.id);
              const questionCount = courseDecks.reduce(
                (sum, deck) => sum + (deckStats.get(deck.id)?.total_questions ?? 0),
                0,
              );
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="block rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
                >
                  <h3 className="font-medium">{course.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {courseDecks.length} {courseDecks.length === 1 ? "deck" : "decks"} ·{" "}
                    {questionCount} {questionCount === 1 ? "question" : "questions"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent decks</h2>
        {recentDecks.length === 0 ? (
          <EmptyState title="No decks yet" description="Decks you study will show up here." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recentDecks.map((deck) => (
              <DeckCard
                key={deck.id}
                deckId={deck.id}
                name={deck.name}
                courseName={deck.course?.name}
                description={deck.description}
                stats={deckStats.get(deck.id) ?? emptyStats(deck.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
