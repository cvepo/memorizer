"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { StudyMode } from "@/lib/types";

/**
 * Record that this profile studied a deck, without touching mastery.
 *
 * Flashcards call this when a card is revealed or advanced. It must never move
 * accuracy, answer totals or mastery — only "when did you last study this".
 */
export async function touchStudyActivity(deckId: string, mode: StudyMode): Promise<void> {
  const session = await requireSession();
  const { error } = await supabase().rpc("touch_study_activity", {
    p_profile_id: session.profileId,
    p_deck_id: deckId,
    p_mode: mode,
  });
  if (error) throw new Error(error.message);
}

/** Star or unstar a question for the signed-in profile. */
export async function setStarred(questionId: string, starred: boolean): Promise<void> {
  const session = await requireSession();
  const db = supabase();

  if (starred) {
    const { error } = await db
      .from("starred_questions")
      .upsert({ profile_id: session.profileId, question_id: questionId });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db
      .from("starred_questions")
      .delete()
      .eq("profile_id", session.profileId)
      .eq("question_id", questionId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/starred");
}

/**
 * Remove a profile and everything scoped to it — progress, stars, activity and
 * quiz history all cascade. Decks and questions are shared and are untouched.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  const session = await requireAdmin();
  if (session.profileId === profileId) {
    throw new Error("You cannot delete the profile you are signed in as.");
  }

  const { error } = await supabase().from("profiles").delete().eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
