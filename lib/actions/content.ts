"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Deck } from "@/lib/types";

export type ActionState = { error: string | null; ok?: boolean };

const text = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const nullable = (value: FormDataEntryValue | null) => text(value) || null;

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

export async function createCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const name = text(formData.get("name"));
    if (!name) return { error: "Give the course a name." };

    const { data, error } = await supabase()
      .from("courses")
      .insert({ name, description: nullable(formData.get("description")) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    revalidatePath("/courses");
    revalidatePath("/");
    redirect(`/courses/${data.id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return fail(error);
  }
}

export async function updateCourse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = text(formData.get("id"));
    const name = text(formData.get("name"));
    if (!id) return { error: "Missing course." };
    if (!name) return { error: "Give the course a name." };

    const { error } = await supabase()
      .from("courses")
      .update({ name, description: nullable(formData.get("description")) })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/courses");
    revalidatePath(`/courses/${id}`);
    return { error: null, ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCourse(id: string): Promise<void> {
  await requireAdmin();
  const { error } = await supabase().from("courses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/courses");
  revalidatePath("/");
  redirect("/courses");
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export async function createDeck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const courseId = text(formData.get("course_id"));
    const name = text(formData.get("name"));
    if (!courseId) return { error: "Pick a course." };
    if (!name) return { error: "Give the deck a name." };

    const { data, error } = await supabase()
      .from("decks")
      .insert({ course_id: courseId, name, description: nullable(formData.get("description")) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    revalidatePath(`/courses/${courseId}`);
    revalidatePath("/decks");
    revalidatePath("/");
    redirect(`/decks/${data.id}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    return fail(error);
  }
}

export async function updateDeck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = text(formData.get("id"));
    const name = text(formData.get("name"));
    if (!id) return { error: "Missing deck." };
    if (!name) return { error: "Give the deck a name." };

    const patch: Partial<Deck> = { name, description: nullable(formData.get("description")) };
    const courseId = text(formData.get("course_id"));
    if (courseId) patch.course_id = courseId;

    const { error } = await supabase().from("decks").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath(`/decks/${id}`);
    revalidatePath("/decks");
    return { error: null, ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDeck(id: string): Promise<void> {
  await requireAdmin();
  const { data: deck } = await supabase().from("decks").select("course_id").eq("id", id).maybeSingle();
  const { error } = await supabase().from("decks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/decks");
  revalidatePath("/");
  redirect(deck?.course_id ? `/courses/${deck.course_id}` : "/decks");
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionInput = {
  id?: string;
  deckId: string;
  questionText: string;
  correctAnswer: string;
  distractors: string[];
  explanation: string | null;
  topic: string | null;
  position?: number;
};

function readQuestionForm(formData: FormData): QuestionInput {
  return {
    id: text(formData.get("id")) || undefined,
    deckId: text(formData.get("deck_id")),
    questionText: text(formData.get("question_text")),
    correctAnswer: text(formData.get("correct_answer")),
    distractors: formData
      .getAll("distractor")
      .map((value) => text(value))
      .filter(Boolean),
    explanation: nullable(formData.get("explanation")),
    topic: nullable(formData.get("topic")),
  };
}

/**
 * Replace a question's stored wrong answers. The correct answer is stored on
 * the question row and also mirrored into answer_choices (is_correct = true)
 * only when explicit distractors exist, so a question with no stored choices
 * stays a "generate distractors at runtime" question.
 */
async function writeChoices(questionId: string, correctAnswer: string, distractors: string[]) {
  const db = supabase();
  const { error: deleteError } = await db.from("answer_choices").delete().eq("question_id", questionId);
  if (deleteError) throw new Error(deleteError.message);

  const unique = [...new Set(distractors.map((d) => d.trim()).filter(Boolean))].filter(
    (d) => d.toLowerCase() !== correctAnswer.trim().toLowerCase(),
  );
  if (unique.length === 0) return;

  const { error } = await db.from("answer_choices").insert([
    { question_id: questionId, answer_text: correctAnswer, is_correct: true },
    ...unique.map((answer_text) => ({ question_id: questionId, answer_text, is_correct: false })),
  ]);
  if (error) throw new Error(error.message);
}

export async function saveQuestion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    const input = readQuestionForm(formData);
    if (!input.deckId) return { error: "Missing deck." };
    if (!input.questionText) return { error: "The question cannot be blank." };
    if (!input.correctAnswer) return { error: "The correct answer cannot be blank." };

    const db = supabase();
    let questionId = input.id;

    if (questionId) {
      const { error } = await db
        .from("questions")
        .update({
          question_text: input.questionText,
          correct_answer: input.correctAnswer,
          explanation: input.explanation,
          topic: input.topic,
        })
        .eq("id", questionId);
      if (error) throw new Error(error.message);
    } else {
      const { data: last } = await db
        .from("questions")
        .select("position")
        .eq("deck_id", input.deckId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await db
        .from("questions")
        .insert({
          deck_id: input.deckId,
          question_text: input.questionText,
          correct_answer: input.correctAnswer,
          explanation: input.explanation,
          topic: input.topic,
          position: (last?.position ?? -1) + 1,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      questionId = data.id;
    }

    await writeChoices(questionId, input.correctAnswer, input.distractors);

    revalidatePath(`/decks/${input.deckId}/edit`);
    revalidatePath(`/decks/${input.deckId}`);
    return { error: null, ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteQuestion(questionId: string, deckId: string): Promise<void> {
  await requireAdmin();
  const { error } = await supabase().from("questions").delete().eq("id", questionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/decks/${deckId}/edit`);
  revalidatePath(`/decks/${deckId}`);
}

/** Persist a new question order. `orderedIds` is the full deck, first to last. */
export async function reorderQuestions(deckId: string, orderedIds: string[]): Promise<void> {
  await requireAdmin();
  const db = supabase();
  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .from("questions")
        .update({ position: index })
        .eq("id", id)
        .eq("deck_id", deckId)
        .then(({ error }) => {
          if (error) throw new Error(error.message);
        }),
    ),
  );
  revalidatePath(`/decks/${deckId}/edit`);
  revalidatePath(`/decks/${deckId}`);
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
