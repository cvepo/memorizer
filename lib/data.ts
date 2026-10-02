import "server-only";

import type { EarnedBadge } from "@/lib/badges";
import { supabase } from "@/lib/supabase";
import type {
  AchievementRow,
  Course,
  Deck,
  DeckReviewCounts,
  DeckStats,
  Profile,
  QuestionSummary,
  QuizAnswer,
  QuizAttempt,
  StudyActivity,
  StudyMode,
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

/**
 * Build an ILIKE pattern that is safe to drop into a raw PostgREST filter.
 *
 * `.or()` takes a string in PostgREST's own grammar, where commas separate
 * conditions and parentheses group them, so an unescaped search term could
 * change the shape of the filter. Two layers of escaping are needed:
 *   1. `\`, `%` and `_` are escaped so they stay literal for ILIKE
 *   2. the result is wrapped in double quotes, with `"` and `\` escaped again,
 *      so PostgREST treats the whole thing as one opaque value
 */
function ilikePattern(term: string) {
  const forIlike = term.replace(/[\\%_]/g, (m) => `\\${m}`);
  const quoted = `%${forIlike}%`.replace(/["\\]/g, (m) => `\\${m}`);
  return { raw: `%${forIlike}%`, quoted: `"${quoted}"` };
}

export async function search(term: string): Promise<SearchResults> {
  // Cap the length so a pathological pattern cannot make Postgres work hard.
  const query = term.trim().slice(0, 100);
  if (!query) return { courses: [], decks: [], questions: [] };
  const { raw, quoted } = ilikePattern(query);

  const [courses, decks, questions] = await Promise.all([
    // supabase-js encodes these values itself, so `raw` is fine here.
    supabase().from("courses").select("*").ilike("name", raw).limit(10),
    supabase().from("decks").select("*, course:courses(*)").ilike("name", raw).limit(10),
    supabase()
      .from("questions")
      .select("id, deck_id, question_text, correct_answer, topic, deck:decks(id, name, course_id)")
      .or(`question_text.ilike.${quoted},correct_answer.ilike.${quoted},topic.ilike.${quoted}`)
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


// ---------------------------------------------------------------------------
// Review flags, stars and question browsing
// ---------------------------------------------------------------------------

/** A question needs review once it has been answered wrong twice and is not
 *  currently mastered. Derived rather than stored, so it self-resolves. */
export const NEEDS_REVIEW_THRESHOLD = 2;

export function needsReview(q: Pick<QuestionSummary, "times_incorrect" | "mastery_count">): boolean {
  return q.times_incorrect >= NEEDS_REVIEW_THRESHOLD && q.mastery_count < 3;
}

export async function reviewCountsByDeck(profileId: string): Promise<Map<string, DeckReviewCounts>> {
  const { data, error } = await supabase().rpc("deck_review_counts", { p_profile_id: profileId });
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.deck_id, row]));
}

type RawSummary = {
  id: string;
  deck_id: string;
  question_text: string;
  correct_answer: string;
  topic: string | null;
  position: number;
  question_progress: { times_incorrect: number; mastery_count: number; times_seen: number }[] | null;
  starred_questions: { question_id: string }[] | null;
};

const toSummary = (row: RawSummary): QuestionSummary => ({
  id: row.id,
  deck_id: row.deck_id,
  question_text: row.question_text,
  correct_answer: row.correct_answer,
  topic: row.topic,
  position: row.position,
  times_incorrect: row.question_progress?.[0]?.times_incorrect ?? 0,
  mastery_count: row.question_progress?.[0]?.mastery_count ?? 0,
  times_seen: row.question_progress?.[0]?.times_seen ?? 0,
  starred: (row.starred_questions?.length ?? 0) > 0,
});

const SUMMARY_SELECT = `id, deck_id, question_text, correct_answer, topic, position,
   question_progress(times_incorrect, mastery_count, times_seen),
   starred_questions(question_id)`;

/** Every question in a deck with this profile's progress and star state. */
export async function listDeckQuestions(deckId: string, profileId: string): Promise<QuestionSummary[]> {
  const { data, error } = await supabase()
    .from("questions")
    .select(SUMMARY_SELECT)
    .eq("deck_id", deckId)
    .eq("question_progress.profile_id", profileId)
    .eq("starred_questions.profile_id", profileId)
    .order("position")
    .order("created_at");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawSummary[]).map(toSummary);
}

/** Starred questions across every deck, newest star first. */
export async function listStarredEverywhere(
  profileId: string,
): Promise<(QuestionSummary & { deck: Deck | null; course: Course | null })[]> {
  const { data, error } = await supabase()
    .from("starred_questions")
    .select(
      `created_at,
       question:questions(${SUMMARY_SELECT}, deck:decks(*, course:courses(*)))`,
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  type Row = {
    question:
      | (RawSummary & { deck: (Deck & { course: Course | null }) | null })
      | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.question !== null)
    .map((row) => {
      const q = row.question!;
      const { deck, ...rest } = q;
      return {
        ...toSummary({ ...rest, starred_questions: [{ question_id: q.id }] }),
        starred: true,
        deck: deck ? ({ ...deck, course: undefined } as unknown as Deck) : null,
        course: deck?.course ?? null,
      };
    });
}

// ---------------------------------------------------------------------------
// Study activity
// ---------------------------------------------------------------------------

/** Decks this profile has actually studied, most recent first. */
export async function recentStudyActivity(profileId: string, limit = 10): Promise<StudyActivity[]> {
  const data = unwrap(
    await supabase()
      .from("study_activity")
      .select("*")
      .eq("profile_id", profileId)
      .order("last_studied_at", { ascending: false })
      .limit(limit),
  );
  return (data ?? []) as StudyActivity[];
}

// ---------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------

export type ProfileDeckRow = {
  deckId: string;
  deckName: string;
  courseName: string | null;
  totalQuestions: number;
  started: number;
  mastered: number;
  answers: number;
  correct: number;
  needsReview: number;
  starred: number;
  lastStudiedAt: string | null;
  lastMode: StudyMode | null;
  quizzes: number;
  bestQuizPercent: number | null;
};

export type ProfileOverview = {
  id: string;
  name: string;
  createdAt: string;
  lastStudiedAt: string | null;
  totals: {
    started: number;
    mastered: number;
    answers: number;
    correct: number;
    needsReview: number;
    starred: number;
    quizzes: number;
  };
  decks: ProfileDeckRow[];
  lifetimeCorrect: number;
  badges: EarnedBadge[];
};

/**
 * Everything the admin dashboard shows, aggregated in one pass.
 *
 * Deliberately built from the existing tables rather than a new SQL function:
 * the volumes here are one row per profile per studied question, which stays
 * small for a shared study site, and it keeps the feature from depending on
 * another migration.
 */
export async function profileOverviews(): Promise<ProfileOverview[]> {
  const db = supabase();

  const [profiles, decks, questions, progress, activity, attempts, stars, stats, achievements] = await Promise.all([
    db.from("profiles").select("*").order("created_at"),
    db.from("decks").select("id, name, course:courses(name)"),
    db.from("questions").select("id, deck_id"),
    db
      .from("question_progress")
      .select("profile_id, question_id, times_seen, times_correct, times_incorrect, mastery_count"),
    db.from("study_activity").select("profile_id, deck_id, last_mode, last_studied_at"),
    db
      .from("quiz_attempts")
      .select("profile_id, deck_id, percentage, completed_at")
      .not("completed_at", "is", null),
    db.from("starred_questions").select("profile_id, question_id"),
    db.from("profile_stats").select("profile_id, lifetime_correct"),
    db.from("achievements").select("*"),
  ]);

  const deckOf = new Map<string, string>();
  for (const q of (questions.data ?? []) as { id: string; deck_id: string }[]) deckOf.set(q.id, q.deck_id);

  const questionCount = new Map<string, number>();
  for (const deckId of deckOf.values()) questionCount.set(deckId, (questionCount.get(deckId) ?? 0) + 1);

  type DeckRow = { id: string; name: string; course: { name: string } | null };
  const deckInfo = new Map<string, DeckRow>();
  for (const d of (decks.data ?? []) as unknown as DeckRow[]) deckInfo.set(d.id, d);

  return ((profiles.data ?? []) as Profile[]).map((profile) => {
    const rows = new Map<string, ProfileDeckRow>();
    const row = (deckId: string): ProfileDeckRow => {
      let existing = rows.get(deckId);
      if (!existing) {
        const info = deckInfo.get(deckId);
        existing = {
          deckId,
          deckName: info?.name ?? "Deleted deck",
          courseName: info?.course?.name ?? null,
          totalQuestions: questionCount.get(deckId) ?? 0,
          started: 0, mastered: 0, answers: 0, correct: 0,
          needsReview: 0, starred: 0,
          lastStudiedAt: null, lastMode: null, quizzes: 0, bestQuizPercent: null,
        };
        rows.set(deckId, existing);
      }
      return existing;
    };

    for (const p of (progress.data ?? []) as {
      profile_id: string; question_id: string; times_seen: number;
      times_correct: number; times_incorrect: number; mastery_count: number;
    }[]) {
      if (p.profile_id !== profile.id) continue;
      const deckId = deckOf.get(p.question_id);
      if (!deckId) continue;
      const r = row(deckId);
      if (p.times_seen > 0) r.started += 1;
      if (p.mastery_count >= 3) r.mastered += 1;
      if (p.times_incorrect >= 2 && p.mastery_count < 3) r.needsReview += 1;
      r.answers += p.times_correct + p.times_incorrect;
      r.correct += p.times_correct;
    }

    for (const s of (stars.data ?? []) as { profile_id: string; question_id: string }[]) {
      if (s.profile_id !== profile.id) continue;
      const deckId = deckOf.get(s.question_id);
      if (deckId) row(deckId).starred += 1;
    }

    for (const a of (activity.data ?? []) as {
      profile_id: string; deck_id: string; last_mode: StudyMode; last_studied_at: string;
    }[]) {
      if (a.profile_id !== profile.id) continue;
      const r = row(a.deck_id);
      r.lastStudiedAt = a.last_studied_at;
      r.lastMode = a.last_mode;
    }

    for (const q of (attempts.data ?? []) as { profile_id: string; deck_id: string; percentage: number }[]) {
      if (q.profile_id !== profile.id) continue;
      const r = row(q.deck_id);
      r.quizzes += 1;
      r.bestQuizPercent = Math.max(r.bestQuizPercent ?? 0, Number(q.percentage));
    }

    const deckRows = [...rows.values()].sort((a, b) => {
      if (a.lastStudiedAt && b.lastStudiedAt) return b.lastStudiedAt.localeCompare(a.lastStudiedAt);
      if (a.lastStudiedAt) return -1;
      if (b.lastStudiedAt) return 1;
      return a.deckName.localeCompare(b.deckName);
    });

    const totals = deckRows.reduce(
      (acc, r) => ({
        started: acc.started + r.started,
        mastered: acc.mastered + r.mastered,
        answers: acc.answers + r.answers,
        correct: acc.correct + r.correct,
        needsReview: acc.needsReview + r.needsReview,
        starred: acc.starred + r.starred,
        quizzes: acc.quizzes + r.quizzes,
      }),
      { started: 0, mastered: 0, answers: 0, correct: 0, needsReview: 0, starred: 0, quizzes: 0 },
    );

    const lastStudiedAt = deckRows.reduce<string | null>(
      (latest, r) => (r.lastStudiedAt && (!latest || r.lastStudiedAt > latest) ? r.lastStudiedAt : latest),
      null,
    );

    const lifetimeCorrect = Number(
      ((stats.data ?? []) as { profile_id: string; lifetime_correct: number }[]).find(
        (s) => s.profile_id === profile.id,
      )?.lifetime_correct ?? 0,
    );
    const badges = ((achievements.data ?? []) as AchievementRow[])
      .filter((a) => a.profile_id === profile.id)
      .map(toEarnedBadge);

    return {
      id: profile.id,
      name: profile.name,
      createdAt: profile.created_at,
      lastStudiedAt,
      totals,
      decks: deckRows,
      lifetimeCorrect,
      badges,
    };
  });
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function toEarnedBadge(row: AchievementRow): EarnedBadge {
  return {
    key: row.badge_key,
    earnedAt: row.earned_at,
    backfilled: row.backfilled,
    acknowledged: row.acknowledged_at !== null,
  };
}

/** A profile's lifetime correct counter and every badge it has earned. */
export async function getBadgeState(
  profileId: string,
): Promise<{ lifetimeCorrect: number; badges: EarnedBadge[] }> {
  const db = supabase();
  const [stats, achievements] = await Promise.all([
    db.from("profile_stats").select("lifetime_correct").eq("profile_id", profileId).maybeSingle(),
    db.from("achievements").select("*").eq("profile_id", profileId).order("earned_at"),
  ]);
  return {
    lifetimeCorrect: Number(unwrap(stats)?.lifetime_correct ?? 0),
    badges: ((unwrap(achievements) ?? []) as AchievementRow[]).map(toEarnedBadge),
  };
}

/** Badges this profile has earned but not yet seen a celebration for. */
export async function getPendingBadges(profileId: string): Promise<EarnedBadge[]> {
  const rows = unwrap(
    await supabase()
      .from("achievements")
      .select("*")
      .eq("profile_id", profileId)
      .is("acknowledged_at", null)
      .order("earned_at"),
  );
  return ((rows ?? []) as AchievementRow[]).map(toEarnedBadge);
}
