import "server-only";

import { supabase } from "@/lib/supabase";
import type {
  Course,
  Deck,
  DeckStats,
  Profile,
  QuizAnswer,
  QuizAttempt,
  StudyQuestion,
  TopicStats,
} from "@/lib/types";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function listProfiles(): Promise<Profile[]> {
  return unwrap(await supabase().from("profiles").select("*").order("created_at")) ?? [];
}

export async function findOrCreateProfile(name: string): Promise<Profile> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Pick a name so your progress can be saved.");

  const existing = unwrap(
    await supabase().from("profiles").select("*").ilike("name", trimmed).limit(1),
  );
  if (existing && existing.length > 0) return existing[0];

  return unwrap(await supabase().from("profiles").insert({ name: trimmed }).select("*").single());
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase().from("profiles").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Courses and decks
// ---------------------------------------------------------------------------

export async function listCourses(): Promise<Course[]> {
  return unwrap(await supabase().from("courses").select("*").order("name")) ?? [];
}

export async function getCourse(id: string): Promise<Course | null> {
  const { data } = await supabase().from("courses").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function listDecks(courseId?: string): Promise<Deck[]> {
  let query = supabase().from("decks").select("*").order("name");
  if (courseId) query = query.eq("course_id", courseId);
  return unwrap(await query) ?? [];
}

export async function getDeck(id: string): Promise<(Deck & { course: Course | null }) | null> {
  const { data, error } = await supabase()
    .from("decks")
    .select("*, course:courses(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { course, ...deck } = data as Deck & { course: Course | null };
  return { ...deck, course: course ?? null };
}

export async function listDecksWithCourse(): Promise<(Deck & { course: Course | null })[]> {
  const data = unwrap(
    await supabase().from("decks").select("*, course:courses(*)").order("updated_at", { ascending: false }),
  );
  return ((data ?? []) as (Deck & { course: Course | null })[]).map(({ course, ...deck }) => ({
    ...deck,
    course: course ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export async function deckStatsByDeck(profileId: string): Promise<Map<string, DeckStats>> {
  const { data, error } = await supabase().rpc("deck_stats", { p_profile_id: profileId });
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.deck_id, row]));
}

export async function topicStats(deckId: string, profileId: string): Promise<TopicStats[]> {
  const { data, error } = await supabase().rpc("topic_stats", {
    p_deck_id: deckId,
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const emptyStats = (deckId: string): DeckStats => ({
  deck_id: deckId,
  total_questions: 0,
  mastered: 0,
  learning: 0,
  unseen: 0,
  total_answers: 0,
  total_correct: 0,
});

export const accuracy = (stats: Pick<DeckStats, "total_answers" | "total_correct">): number | null =>
  stats.total_answers > 0 ? Math.round((stats.total_correct / stats.total_answers) * 100) : null;

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

type RawStudyQuestion = Omit<StudyQuestion, "choices" | "progress"> & {
  answer_choices: { answer_text: string; is_correct: boolean }[] | null;
  question_progress: StudyQuestion["progress"][] | null;
};

/** Questions for a deck with their imported choices and this profile's progress. */
export async function getStudyQuestions(deckId: string, profileId: string): Promise<StudyQuestion[]> {
  const { data, error } = await supabase()
    .from("questions")
    .select(
      `*,
       answer_choices(answer_text, is_correct),
       question_progress(times_seen, times_correct, times_incorrect, mastery_count, last_result)`,
    )
    .eq("deck_id", deckId)
    .eq("question_progress.profile_id", profileId)
    .order("position")
    .order("created_at");

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as RawStudyQuestion[]).map(
    ({ answer_choices, question_progress, ...question }) => ({
      ...question,
      choices: answer_choices ?? [],
      progress: question_progress?.[0] ?? null,
    }),
  );
}

export async function getDeckTopics(deckId: string): Promise<string[]> {
  const data = unwrap(await supabase().from("questions").select("topic").eq("deck_id", deckId));
  const topics = new Set<string>();
  for (const row of data ?? []) {
    const topic = row.topic?.trim();
    if (topic) topics.add(topic);
  }
  return [...topics].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Quiz history
// ---------------------------------------------------------------------------

export async function listQuizAttempts(deckId: string, profileId: string): Promise<QuizAttempt[]> {
  return (
    unwrap(
      await supabase()
        .from("quiz_attempts")
        .select("*")
        .eq("deck_id", deckId)
        .eq("profile_id", profileId)
        .not("completed_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(10),
    ) ?? []
  );
}

export async function getQuizAttempt(
  attemptId: string,
): Promise<{ attempt: QuizAttempt; answers: QuizAnswer[] } | null> {
  const { data: attempt } = await supabase()
    .from("quiz_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return null;

  const answers =
    unwrap(
      await supabase().from("quiz_answers").select("*").eq("quiz_attempt_id", attemptId).order("position"),
    ) ?? [];

  return { attempt, answers };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchResults = {
  courses: Course[];
  decks: (Deck & { course: Course | null })[];
  questions: { id: string; deck_id: string; question_text: string; correct_answer: string; topic: string | null; deck: Deck | null }[];
};

export async function search(term: string): Promise<SearchResults> {
  const query = term.trim();
  if (!query) return { courses: [], decks: [], questions: [] };
  const like = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const [courses, decks, questions] = await Promise.all([
    supabase().from("courses").select("*").ilike("name", like).limit(10),
    supabase().from("decks").select("*, course:courses(*)").ilike("name", like).limit(10),
    supabase()
      .from("questions")
      .select("id, deck_id, question_text, correct_answer, topic, deck:decks(id, name, course_id)")
      .or(`question_text.ilike.${like},correct_answer.ilike.${like},topic.ilike.${like}`)
      .limit(40),
  ]);

  return {
    courses: (courses.data ?? []) as Course[],
    decks: ((decks.data ?? []) as (Deck & { course: Course | null })[]).map(({ course, ...deck }) => ({
      ...deck,
      course: course ?? null,
    })),
    questions: (questions.data ?? []) as SearchResults["questions"],
  };
}
