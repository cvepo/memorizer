import { notFound, redirect } from "next/navigation";

import { ButtonLink, Card, PageHeader, cn } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { getDeck, getQuizAttempt } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/decks/[deckId]/quiz/[attemptId]">) {
  const { deckId } = await params;
  const deck = await getDeck(deckId);
  return { title: deck ? `Quiz results · ${deck.name}` : "Quiz results · Memorizer" };
}

const LABEL = "text-xs uppercase tracking-wide text-muted";

export default async function QuizResultsPage({
  params,
}: PageProps<"/decks/[deckId]/quiz/[attemptId]">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { deckId, attemptId } = await params;
  const result = await getQuizAttempt(attemptId);
  if (!result || result.attempt.deck_id !== deckId) notFound();

  const { attempt, answers } = result;
  const deck = await getDeck(deckId);

  const correctCount = answers.filter((a) => a.was_correct).length;
  const incorrectCount = answers.length - correctCount;
  const missedIds = answers
    .filter((a) => !a.was_correct)
    .map((a) => a.question_id)
    .filter((id): id is string => Boolean(id));

  return (
    <div className="space-y-6">
      <PageHeader title="Quiz results" subtitle={deck?.name ?? undefined} />

      <Card className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-4xl font-semibold tabular-nums">
          {attempt.score} / {attempt.total_questions}
        </p>
        <p className="text-2xl tabular-nums">{Math.round(attempt.percentage)}%</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
          <span className="text-success tabular-nums">Correct: {correctCount}</span>
          <span className="text-danger tabular-nums">Incorrect: {incorrectCount}</span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {missedIds.length > 0 ? (
          <ButtonLink href={`/decks/${deckId}/learn?ids=${missedIds.join(",")}`}>
            Study Missed Questions
          </ButtonLink>
        ) : null}
        <ButtonLink href={`/decks/${deckId}/quiz`} variant="secondary">
          Retake Quiz
        </ButtonLink>
        <ButtonLink href={`/decks/${deckId}`} variant="ghost">
          Back to Deck
        </ButtonLink>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Review</h2>
        <div className="space-y-3">
          {answers.map((answer, i) => (
            <div
              key={answer.id}
              className={cn(
                "space-y-3 rounded-2xl border p-5",
                answer.was_correct ? "border-line bg-surface" : "border-l-4 tint-danger",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xs text-muted tabular-nums">{i + 1}</span>
                <p className="font-medium leading-snug">{answer.question_text}</p>
              </div>

              <div className="space-y-1">
                <p className={LABEL}>Your answer</p>
                {answer.selected_answer ? (
                  <p className="text-sm">{answer.selected_answer}</p>
                ) : (
                  <p className="text-sm text-muted">Not answered</p>
                )}
              </div>

              <div className="space-y-1">
                <p className={LABEL}>Correct answer</p>
                <p className="text-sm text-success">{answer.correct_answer}</p>
              </div>

              {answer.explanation ? (
                <div className="space-y-1">
                  <p className={LABEL}>Explanation</p>
                  <p className="text-sm text-muted">{answer.explanation}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
