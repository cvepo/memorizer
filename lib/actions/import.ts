"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { AnswerMode } from "@/lib/types";

export type ImportQuestion = {
  questionText: string;
  /** Readable summary; equals the single answer in single mode. */
  correctAnswer: string;
  /** Every correct answer. One entry in single mode, several in multi. */
  correctAnswers: string[];
  answerMode: AnswerMode;
  distractors: string[];
  explanation: string | null;
  topic: string | null;
};

export type ImportTarget =
  | { kind: "existing"; deckId: string }
  | { kind: "new"; courseId: string; deckName: string; deckDescription: string | null }
  | { kind: "new-course"; courseName: string; deckName: string; deckDescription: string | null };

export type ImportResult = { deckId: string; inserted: number };

const CHUNK = 250;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Bulk-insert an import. Questions go in in chunks rather than one request per
 * row, and choices are only stored for questions that actually came with wrong
 * answers — the rest get runtime-generated distractors.
 */
export async function importQuestions(
  target: ImportTarget,
  questions: ImportQuestion[],
  options: { replaceExisting?: boolean } = {},
): Promise<ImportResult> {
  await requireAdmin();

  if (questions.length === 0) throw new Error("There are no valid questions to import.");
  const db = supabase();

  // Resolve the destination deck, creating the course and/or deck if needed.
  let deckId: string;
  if (target.kind === "existing") {
    deckId = target.deckId;
    const { data } = await db.from("decks").select("id").eq("id", deckId).maybeSingle();
    if (!data) throw new Error("That deck no longer exists.");
  } else {
    let courseId: string;
    if (target.kind === "new-course") {
      if (!target.courseName.trim()) throw new Error("Give the new course a name.");
      const { data, error } = await db
        .from("courses")
        .insert({ name: target.courseName.trim() })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      courseId = data.id;
    } else {
      courseId = target.courseId;
    }

    if (!target.deckName.trim()) throw new Error("Give the new deck a name.");
    const { data, error } = await db
      .from("decks")
      .insert({
        course_id: courseId,
        name: target.deckName.trim(),
        description: target.deckDescription?.trim() || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    deckId = data.id;
  }

  if (options.replaceExisting) {
    const { error } = await db.from("questions").delete().eq("deck_id", deckId);
    if (error) throw new Error(error.message);
  }

  const { data: last } = await db
    .from("questions")
    .select("position")
    .eq("deck_id", deckId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (last?.position ?? -1) + 1;

  let inserted = 0;
  for (const batch of chunk(questions, CHUNK)) {
    const payload = batch.map((question) => ({
      deck_id: deckId,
      question_text: question.questionText,
      correct_answer: question.correctAnswer,
      answer_mode: question.answerMode,
      explanation: question.explanation,
      topic: question.topic,
      position: position++,
    }));

    const { data: rows, error } = await db.from("questions").insert(payload).select("id");
    if (error) throw new Error(error.message);
    inserted += rows?.length ?? 0;

    const choices = (rows ?? []).flatMap((row, index) => {
      const source = batch[index];
      const correct = source.correctAnswers.map((a) => a.trim()).filter(Boolean);
      const taken = new Set(correct.map((a) => a.toLowerCase()));
      const unique = [...new Set(source.distractors.map((d) => d.trim()).filter(Boolean))].filter(
        (d) => !taken.has(d.toLowerCase()),
      );
      // A multi-select question is unanswerable from generated distractors, so
      // its options are always stored even if the sheet gave no wrong answers.
      if (unique.length === 0 && source.answerMode === "single") return [];
      return [
        ...correct.map((answer_text) => ({ question_id: row.id, answer_text, is_correct: true })),
        ...unique.map((answer_text) => ({ question_id: row.id, answer_text, is_correct: false })),
      ];
    });

    for (const choiceBatch of chunk(choices, 500)) {
      const { error: choiceError } = await db.from("answer_choices").insert(choiceBatch);
      if (choiceError) throw new Error(choiceError.message);
    }
  }

  revalidatePath("/");
  revalidatePath("/decks");
  revalidatePath(`/decks/${deckId}`);
  return { deckId, inserted };
}

/** Question texts already in a deck, so the preview can flag duplicates. */
export async function existingQuestionTexts(deckId: string): Promise<string[]> {
  await requireAdmin();
  const { data, error } = await supabase().from("questions").select("question_text").eq("deck_id", deckId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.question_text);
}
