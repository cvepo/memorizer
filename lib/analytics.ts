import "server-only";

import { LEADERBOARD_TIME_ZONE } from "@/lib/data";
import { levelUp, levelDown, MASTERY_MASTERED, type MasteryLevel } from "@/lib/learnAlgorithm";
import { supabase } from "@/lib/supabase";
import type { AnswerEventRow } from "@/lib/types";

export type Timeframe = "7d" | "30d" | "all";

export type TimelinePoint = {
  date: string;
  mastered: number;
  accuracy: number | null;
  minutes: number;
  answers: number;
};

export type AnalyticsSummary = {
  totalAnswers: number;
  totalCorrect: number;
  accuracy: number | null;
  mastered: number;
  estimatedMinutes: number;
  activeDays: number;
  firstAnswerAt: string | null;
  lastAnswerAt: string | null;
};

export type StudyAnalytics = { summary: AnalyticsSummary; timeline: TimelinePoint[] };

type Event = Pick<AnswerEventRow, "profile_id" | "question_id" | "was_correct" | "created_at">;
type Day = {
  answers: number;
  correct: number;
  newlyMastered: number;
  minutes: number;
  firstAnswerAt: string | null;
  lastAnswerAt: string | null;
};
type Session = { first: number; last: number; day: string };

const PAGE_SIZE = 1000;
const IDLE_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LEADERBOARD_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// data.ts keeps zoneOffsetMs private. Mirror its shifted-UTC approach so the
// analytics and leaderboards agree even on daylight-saving transition days.
function zoneOffsetMs(instant: Date): number {
  const parts = dateFormatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function dayOf(instant: Date): string {
  return new Date(instant.getTime() + zoneOffsetMs(instant)).toISOString().slice(0, 10);
}

function shiftDay(day: string, days: number): string {
  // These UTC dates represent calendar labels, not instants in New York: a
  // calendar day still advances once when the local clock skips or repeats an hour.
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function emptySummary(): AnalyticsSummary {
  return {
    totalAnswers: 0,
    totalCorrect: 0,
    accuracy: null,
    mastered: 0,
    estimatedMinutes: 0,
    activeDays: 0,
    firstAnswerAt: null,
    lastAnswerAt: null,
  };
}

/** Admin analytics. Omit profileId for everyone combined. */
export async function studyAnalytics(
  opts: { profileId?: string; timeframe?: Timeframe } = {},
): Promise<StudyAnalytics> {
  const now = new Date();
  const db = supabase();
  const events: Event[] = [];

  // The server caps even a larger range at 1,000. Never date-filter the lower
  // bound: mastery and sessions can both begin before the requested window.
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db
      .from("answer_events")
      .select("profile_id, question_id, was_correct, created_at")
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (opts.profileId !== undefined) query = query.eq("profile_id", opts.profileId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = data ?? [];
    events.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const summary = emptySummary();
  if (events.length === 0) return { summary, timeline: [] };

  const days = new Map<string, Day>();
  const levels = new Map<string, MasteryLevel>();
  const everMastered = new Set<string>();
  const sessions = new Map<string, Session>();
  function dayBucket(date: string): Day {
    let day = days.get(date);
    if (!day) {
      day = { answers: 0, correct: 0, newlyMastered: 0, minutes: 0, firstAnswerAt: null, lastAnswerAt: null };
      days.set(date, day);
    }
    return day;
  }

  // Answer spans undercount study: flashcard browsing writes no answer_events,
  // and a session with only one answer has no measurable span at all.
  function finishSession(session: Session): void {
    dayBucket(session.day).minutes += (session.last - session.first) / 60000;
  }

  for (const event of events) {
    const instant = new Date(event.created_at);
    const timestamp = instant.getTime();
    const date = dayOf(instant);
    const day = dayBucket(date);
    day.answers += 1;
    day.correct += event.was_correct ? 1 : 0;
    day.firstAnswerAt ??= event.created_at;
    day.lastAnswerAt = event.created_at;

    const key = `${event.profile_id}:${event.question_id}`;
    const previous = levels.get(key) ?? 0;
    const mastery = event.was_correct ? levelUp(previous) : levelDown(previous);
    levels.set(key, mastery);
    // This is cumulative attainment per learner/question, so a later review
    // miss cannot erase the first mastery or count it again on recovery.
    if (mastery === MASTERY_MASTERED && !everMastered.has(key)) {
      everMastered.add(key);
      day.newlyMastered += 1;
    }

    const session = sessions.get(event.profile_id);
    if (!session || timestamp - session.last >= IDLE_MS) {
      if (session) finishSession(session);
      sessions.set(event.profile_id, { first: timestamp, last: timestamp, day: date });
    } else {
      session.last = timestamp;
    }
  }
  for (const session of sessions.values()) finishSession(session);

  const today = dayOf(now);
  const firstDay = dayOf(new Date(events[0].created_at));
  const timeframe = opts.timeframe ?? "all";
  const start = timeframe === "all" ? firstDay : shiftDay(today, timeframe === "7d" ? -6 : -29);
  const timeline: TimelinePoint[] = [];
  let mastered = 0;

  // Walk from the beginning before slicing, preserving the mastery baseline
  // and filling inactive days even when the selected window has no answers.
  for (let date = firstDay < start ? firstDay : start; date <= today; date = shiftDay(date, 1)) {
    const day = days.get(date);
    mastered += day?.newlyMastered ?? 0;
    if (date < start) continue;
    timeline.push({
      date,
      mastered,
      accuracy: day?.answers ? (day.correct / day.answers) * 100 : null,
      minutes: day?.minutes ?? 0,
      answers: day?.answers ?? 0,
    });
    summary.totalAnswers += day?.answers ?? 0;
    summary.totalCorrect += day?.correct ?? 0;
    summary.estimatedMinutes += day?.minutes ?? 0;
    if (day?.answers) {
      summary.activeDays += 1;
      summary.firstAnswerAt ??= day.firstAnswerAt;
      summary.lastAnswerAt = day.lastAnswerAt;
    }
  }
  summary.mastered = mastered;
  summary.accuracy = summary.totalAnswers ? (summary.totalCorrect / summary.totalAnswers) * 100 : null;
  return { summary, timeline };
}
