import Link from "next/link";
import { redirect } from "next/navigation";

import { ButtonLink, Card, EmptyState, MasteryBreakdown, PageHeader, ProgressBar } from "@/components/ui";
import { DeckCard } from "@/components/DeckCard";
import { getSession } from "@/lib/auth";
import { deckStatsByDeck, emptyStats, listCourses, listDecksWithCourse, recentStudyActivity } from "@/lib/data";
import type { StudyMode } from "@/lib/types";

export const metadata = { title: "Study · Memorizer" };

// study_activity holds one row per (profile, deck); a generous limit keeps the
// whole history in view instead of only the ten most recent decks.
const ACTIVITY_LIMIT = 500;

const MODE_HREF: Record<StudyMode, (deckId: string) => string> = {
  flashcards: (deckId) => `/decks/${deckId}`,
  learn: (deckId) => `/decks/${deckId}/learn`,
  quiz: (deckId) => `/decks/${deckId}/quiz`,
};

const MODE_LABEL: Record<StudyMode, string> = {
  flashcards: "Continue Flashcards",
  learn: "Continue Learn",
  quiz: "Continue Quiz",
};

/** Small, server-computed relative time string — no date library needed. */
function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((now - then) / 1000));

  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? "minute" : "minutes"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ${diffHour === 1 ? "hour" : "hours"} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? "day" : "days"} ago`;
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} ${diffWeek === 1 ? "week" : "weeks"} ago`;
  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} ${diffMonth === 1 ? "month" : "months"} ago`;
  const diffYear = Math.round(diffDay / 365);
  return `${diffYear} ${diffYear === 1 ? "year" : "years"} ago`;
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [courses, decks, deckStats, activity] = await Promise.all([
    listCourses(),
    listDecksWithCourse(),
    deckStatsByDeck(session.profileId),
    recentStudyActivity(session.profileId, ACTIVITY_LIMIT),
  ]);

  const isAdmin = session.role === "admin";

  const deckById = new Map(decks.map((deck) => [deck.id, deck]));

  // Most recent activity row whose deck still exists — deleted decks are
  // skipped rather than producing a broken link.
  const continueActivity = activity.find((row) => deckById.has(row.deck_id));
  const continueDeck = continueActivity ? deckById.get(continueActivity.deck_id) ?? null : null;
  const continueStats = continueDeck ? deckStats.get(continueDeck.id) ?? emptyStats(continueDeck.id) : null;

  const lastStudiedAtByDeck = new Map(activity.map((row) => [row.deck_id, row.last_studied_at]));

  const sortedDecks = [...decks].sort((a, b) => {
    const aTime = lastStudiedAtByDeck.get(a.id);
    const bTime = lastStudiedAtByDeck.get(b.id);
    if (aTime && bTime) return new Date(bTime).getTime() - new Date(aTime).getTime();
    if (aTime) return -1;
    if (bTime) return 1;
    return a.name.localeCompare(b.name);
  });
  const recentDecks = sortedDecks.slice(0, 6);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Study"
        subtitle={`Welcome back, ${session.profileName}.`}
        actions={
          <>
            <ButtonLink href="/starred" variant="secondary">
              Starred questions
            </ButtonLink>
            {isAdmin ? (
              <>
                <ButtonLink href="/import">Import questions</ButtonLink>
                <ButtonLink href="/courses" variant="secondary">
                  New course
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Continue studying</h2>
        {continueDeck && continueActivity && continueStats ? (
          <Card className="space-y-4">
            <div>
              {continueDeck.course ? <p className="text-xs text-muted">{continueDeck.course.name}</p> : null}
              <h3 className="text-lg font-medium">{continueDeck.name}</h3>
              <p className="mt-1 text-xs text-muted">
                Last studied {relativeTime(continueActivity.last_studied_at)}
              </p>
            </div>
            <ProgressBar value={continueStats.mastered} total={continueStats.total_questions} />
            <MasteryBreakdown
              mastered={continueStats.mastered}
              learning={continueStats.learning}
              unseen={continueStats.unseen}
            />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={MODE_HREF[continueActivity.last_mode](continueDeck.id)}>
                {MODE_LABEL[continueActivity.last_mode]}
              </ButtonLink>
              <ButtonLink href={`/decks/${continueDeck.id}`} variant="secondary">
                Deck overview
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <EmptyState
            title="Choose a deck to start"
            description="Once you study a deck, you can jump right back in from here."
            action={<ButtonLink href="/decks">Browse decks</ButtonLink>}
          />
        )}
      </section>

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
