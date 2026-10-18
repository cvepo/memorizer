"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export type QuickFixState = { error: string | null; ok?: boolean };

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const nullable = (value: FormDataEntryValue | null) => text(value) || null;

function fail(error: unknown): QuickFixState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

/** Ignore or stop ignoring a question for the signed-in profile. */
export async function setIgnored(
  questionId: string,
  ignored: boolean,
  deckId?: string,
): Promise<void> {
  const session = await requireSession();
  const db = supabase();

  if (ignored) {
    const { error } = await db
      .from("ignored_questions")
      .upsert({ profile_id: session.profileId, question_id: questionId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("ignored_questions")
      .delete()
      .eq("profile_id", session.profileId)
      .eq("question_id", questionId);
    if (error) throw new Error(error.message);
  }

  if (deckId) revalidatePath(`/decks/${deckId}`);
}

export async function quickFixQuestion(
  _prev: QuickFixState,
  formData: FormData,
): Promise<QuickFixState> {
  try {
    await requireAdmin();
    const questionId = text(formData.get("question_id"));
    const deckId = text(formData.get("deck_id"));
    const questionText = text(formData.get("question_text"));
    const correctAnswer = text(formData.get("correct_answer"));
    if (!questionId) return { error: "Missing question." };
    if (!deckId) return { error: "Missing deck." };
    if (!questionText) return { error: "The question cannot be blank." };
    if (!correctAnswer) return { error: "The correct answer cannot be blank." };

    const db = supabase();
    const { error } = await db
      .from("questions")
      .update({
        question_text: questionText,
        correct_answer: correctAnswer,
        topic: nullable(formData.get("topic")),
      })
      .eq("id", questionId)
      .eq("deck_id", deckId)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Preserve imported distractors. Always sync the stored correct choice so
    // retrying after a failed write repairs it; no stored choices stays empty.
    const { error: choiceError } = await db
      .from("answer_choices")
      .update({ answer_text: correctAnswer })
      .eq("question_id", questionId)
      .eq("is_correct", true);
    if (choiceError) throw new Error(choiceError.message);

    // If the new correct answer is also sitting in the distractor list, that
    // text would now appear twice in the same question — once right, once
    // wrong. writeChoices() drops such a distractor on the full-save path, so
    // the quick path has to as well. Compared in JS rather than with ilike,
    // because an answer containing % or _ would turn into a wildcard.
    const { data: distractors, error: readError } = await db
      .from("answer_choices")
      .select("id, answer_text")
      .eq("question_id", questionId)
      .eq("is_correct", false);
    if (readError) throw new Error(readError.message);

    const wanted = correctAnswer.toLowerCase();
    const stale = (distractors ?? []).filter(
      (choice) => choice.answer_text.trim().toLowerCase() === wanted,
    );

    if (stale.length > 0) {
      const { error: staleError } = await db
        .from("answer_choices")
        .delete()
        .in(
          "id",
          stale.map((choice) => choice.id),
        );
      if (staleError) throw new Error(staleError.message);
    }

    revalidatePath(`/decks/${deckId}`);
    revalidatePath(`/decks/${deckId}/edit`);
    return { error: null, ok: true };
  } catch (error) {
    return fail(error);
  }
}
