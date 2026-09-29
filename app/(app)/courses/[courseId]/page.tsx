import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CourseAdmin } from "@/app/(app)/courses/[courseId]/CourseAdmin";
import { DeckCard } from "@/components/DeckCard";
import { EmptyState, PageHeader, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { accuracy, deckStatsByDeck, emptyStats, getCourse, listDecks } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  return { title: course ? `${course.name} · BIOMI Study` : "Course · BIOMI Study" };
}

export default async function CoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const course = await getCourse(courseId);
  if (!course) notFound();

  const [decks, deckStats] = await Promise.all([listDecks(courseId), deckStatsByDeck(session.profileId)]);

  const statsForDecks = decks.map((deck) => deckStats.get(deck.id) ?? emptyStats(deck.id));
  const totals = statsForDecks.reduce(
    (sum, stats) => ({
      total_questions: sum.total_questions + stats.total_questions,
      mastered: sum.mastered + stats.mastered,
      learning: sum.learning + stats.learning,
      unseen: sum.unseen + stats.unseen,
      total_answers: sum.total_answers + stats.total_answers,
      total_correct: sum.total_correct + stats.total_correct,
    }),
    { total_questions: 0, mastered: 0, learning: 0, unseen: 0, total_answers: 0, total_correct: 0 },
  );
  const courseAccuracy = accuracy(totals);

  const isAdmin = session.role === "admin";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/courses" className="text-sm text-muted hover:text-ink">
          ← Courses
        </Link>
      </div>

      <PageHeader title={course.name} subtitle={course.description ?? undefined} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Questions" value={totals.total_questions} />
        <Stat label="Mastered" value={totals.mastered} tone="success" />
        <Stat label="Learning" value={totals.learning} tone="accent" />
        <Stat label="Unseen" value={totals.unseen} tone="muted" />
        <Stat label="Accuracy" value={courseAccuracy === null ? "—" : `${courseAccuracy}%`} />
      </div>

      {decks.length === 0 ? (
        <EmptyState
          title="No decks yet"
          description={isAdmin ? "Add a deck below to get started." : "Once an admin adds a deck it will show up here."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deckId={deck.id}
              name={deck.name}
              description={deck.description}
              stats={deckStats.get(deck.id) ?? emptyStats(deck.id)}
            />
          ))}
        </div>
      )}

      {isAdmin ? <CourseAdmin course={course} /> : null}
    </div>
  );
}
