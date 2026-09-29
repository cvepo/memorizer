import Link from "next/link";
import { redirect } from "next/navigation";

import { CourseCreateForm } from "@/app/(app)/courses/CourseCreateForm";
import { EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { deckStatsByDeck, listCourses, listDecksWithCourse } from "@/lib/data";

export const metadata = { title: "Courses · Memorizer" };

export default async function CoursesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [courses, decks, deckStats] = await Promise.all([
    listCourses(),
    listDecksWithCourse(),
    deckStatsByDeck(session.profileId),
  ]);

  const isAdmin = session.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader title="Courses" />

      {courses.length === 0 ? (
        <EmptyState title="No courses yet" description={isAdmin ? "Create your first course below." : "Once an admin adds a course it will show up here."} />
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
                {course.description ? (
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted">{course.description}</p>
                ) : null}
                <p className="mt-4 text-sm text-muted">
                  {courseDecks.length} {courseDecks.length === 1 ? "deck" : "decks"} ·{" "}
                  {questionCount} {questionCount === 1 ? "question" : "questions"}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {isAdmin ? <CourseCreateForm /> : null}
    </div>
  );
}
