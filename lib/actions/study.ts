"use server";

import { requireSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/** Record one Learn answer. Any signed-in profile may do this. */
export async function recordAnswer(questionId: string, wasCorrect: boolean): Promise<void> {
  const session = await requireSession();
  const { error } = await supabase().rpc("record_answer", {
    p_profile_id: session.profileId,
    p_question_id: questionId,
    p_correct: wasCorrect,
  });
  if (error) throw new Error(error.message);
}

export type SubmittedQuizAnswer = {
  questionId: string;
  questionText: string;
  correctAnswer: string;
  explanation: string | null;
  selectedAnswer: string | null;
  wasCorrect: boolean;
};

/**
 * Persist a finished quiz and fold its answers into mastery, so the "missed"
 * and "unmastered" question pools stay accurate after a quiz.
 * Returns the attempt id for the review screen.
 */
export async function submitQuiz(
  deckId: string,
  answers: SubmittedQuizAnswer[],
  startedAt: string,
): Promise<string> {
  const session = await requireSession();
  const db = supabase();

  const score = answers.filter((a) => a.wasCorrect).length;
  const total = answers.length;
  const percentage = total > 0 ? Math.round((score / total) * 10000) / 100 : 0;

  const { data: attempt, error: attemptError } = await db
    .from("quiz_attempts")
    .insert({
      deck_id: deckId,
      profile_id: session.profileId,
      score,
      total_questions: total,
      percentage,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (attemptError) throw new Error(attemptError.message);

  if (answers.length > 0) {
    const { error: answersError } = await db.from("quiz_answers").insert(
      answers.map((answer, index) => ({
        quiz_attempt_id: attempt.id,
        question_id: answer.questionId,
        question_text: answer.questionText,
        correct_answer: answer.correctAnswer,
        explanation: answer.explanation,
        selected_answer: answer.selectedAnswer,
        was_correct: answer.wasCorrect,
        position: index,
      })),
    );
    if (answersError) throw new Error(answersError.message);

    // Unanswered questions are left out of mastery entirely rather than
    // counted as misses.
    const attempted = answers.filter((a) => a.selectedAnswer !== null);
    if (attempted.length > 0) {
      const { error: progressError } = await db.rpc("record_answers", {
        p_profile_id: session.profileId,
        p_answers: attempted.map((a) => ({ question_id: a.questionId, correct: a.wasCorrect })),
      });
      if (progressError) throw new Error(progressError.message);
    }
  }

  return attempt.id;
}
