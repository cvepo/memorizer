import Link from "next/link";
import { redirect } from "next/navigation";

import { SearchBox } from "@/app/(app)/search/SearchBox";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { search } from "@/lib/data";

export const metadata = { title: "Search · Memorizer" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : (q?.[0] ?? "")).trim();

  const results = query ? await search(query) : null;
  const hasResults = results
    ? results.courses.length > 0 || results.decks.length > 0 || results.questions.length > 0
    : false;

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle="Courses, decks, questions, answers and topics." />

      <SearchBox initial={query} />

      {!results ? (
        <EmptyState title="Type something to search" />
      ) : !hasResults ? (
        <EmptyState title={`No matches for "${query}"`} />
      ) : (
        <div className="space-y-8">
          {results.courses.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-medium">
                Courses <span className="text-sm font-normal text-muted">({results.courses.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {results.courses.map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="block rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
                  >
                    <h3 className="font-medium">{course.name}</h3>
                    {course.description ? (
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted">{course.description}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {results.decks.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-medium">
                Decks <span className="text-sm font-normal text-muted">({results.decks.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {results.decks.map((deck) => (
                  <Link
                    key={deck.id}
                    href={`/decks/${deck.id}`}
                    className="block rounded-2xl border border-line bg-surface p-5 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
                  >
                    <h3 className="font-medium">
                      {deck.course ? `${deck.course.name} · ${deck.name}` : deck.name}
                    </h3>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {results.questions.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-medium">
                Questions <span className="text-sm font-normal text-muted">({results.questions.length})</span>
              </h2>
              <div className="space-y-3">
                {results.questions.map((question) => (
                  <Link key={question.id} href={`/decks/${question.deck_id}`} className="block">
                    <Card className="p-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2">
                      <p className="line-clamp-2 text-sm">{question.question_text}</p>
                      <p className="mt-1.5 text-sm text-success">Answer: {question.correct_answer}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {question.topic ? <Badge>{question.topic}</Badge> : null}
                        {question.deck ? <span className="text-xs text-muted">{question.deck.name}</span> : null}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
