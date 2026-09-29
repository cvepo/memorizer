export type Profile = {
  id: string;
  name: string;
  created_at: string;
};

export type Course = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Deck = {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: string;
  deck_id: string;
  question_text: string;
  correct_answer: string;
  explanation: string | null;
  topic: string | null;
  image_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type AnswerChoice = {
  id: string;
  question_id: string;
  answer_text: string;
  is_correct: boolean;
  created_at: string;
};

export type QuestionProgress = {
  id: string;
  profile_id: string;
  question_id: string;
  times_seen: number;
  times_correct: number;
  times_incorrect: number;
  mastery_count: number;
  last_seen_at: string | null;
  last_result: boolean | null;
  created_at: string;
  updated_at: string;
};

export type QuizAttempt = {
  id: string;
  deck_id: string;
  profile_id: string | null;
  score: number;
  total_questions: number;
  percentage: number;
  started_at: string;
  completed_at: string | null;
};

export type QuizAnswer = {
  id: string;
  quiz_attempt_id: string;
  question_id: string | null;
  question_text: string | null;
  correct_answer: string | null;
  explanation: string | null;
  selected_answer: string | null;
  was_correct: boolean;
  position: number;
};

export type StarredQuestion = {
  profile_id: string;
  question_id: string;
  created_at: string;
};

export type StudyActivity = {
  profile_id: string;
  deck_id: string;
  last_mode: StudyMode;
  last_studied_at: string;
};

export type StudyMode = "flashcards" | "learn" | "quiz";

export type DeckReviewCounts = {
  deck_id: string;
  needs_review: number;
  starred: number;
};

/** A question shown in the Needs review / Starred / Browse lists. */
export type QuestionSummary = {
  id: string;
  deck_id: string;
  question_text: string;
  correct_answer: string;
  topic: string | null;
  position: number;
  times_incorrect: number;
  mastery_count: number;
  times_seen: number;
  starred: boolean;
};

export type DeckStats = {
  deck_id: string;
  total_questions: number;
  mastered: number;
  learning: number;
  unseen: number;
  total_answers: number;
  total_correct: number;
};

export type TopicStats = {
  topic: string;
  total: number;
  mastered: number;
  total_answers: number;
  total_correct: number;
};

/** A question plus everything needed to render it as an MCQ. */
export type StudyQuestion = Question & {
  choices: { answer_text: string; is_correct: boolean }[];
  progress: Pick<
    QuestionProgress,
    "times_seen" | "times_correct" | "times_incorrect" | "mastery_count" | "last_result"
  > | null;
};

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Row<T, R extends Relationship[] = []> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: R;
};

/** Declared so PostgREST embedded selects (`course:courses(*)`) type-check. */
const fk = <const N extends string, const C extends string, const R extends string, const RC extends string>() =>
  undefined as unknown as { foreignKeyName: N; columns: [C]; isOneToOne: false; referencedRelation: R; referencedColumns: [RC] };
void fk;

type BelongsTo<N extends string, C extends string, R extends string> = {
  foreignKeyName: N;
  columns: [C];
  isOneToOne: false;
  referencedRelation: R;
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      profiles: Row<Profile>;
      courses: Row<Course>;
      decks: Row<Deck, [BelongsTo<"decks_course_id_fkey", "course_id", "courses">]>;
      questions: Row<Question, [BelongsTo<"questions_deck_id_fkey", "deck_id", "decks">]>;
      answer_choices: Row<
        AnswerChoice,
        [BelongsTo<"answer_choices_question_id_fkey", "question_id", "questions">]
      >;
      question_progress: Row<
        QuestionProgress,
        [
          BelongsTo<"question_progress_profile_id_fkey", "profile_id", "profiles">,
          BelongsTo<"question_progress_question_id_fkey", "question_id", "questions">,
        ]
      >;
      quiz_attempts: Row<
        QuizAttempt,
        [
          BelongsTo<"quiz_attempts_deck_id_fkey", "deck_id", "decks">,
          BelongsTo<"quiz_attempts_profile_id_fkey", "profile_id", "profiles">,
        ]
      >;
      quiz_answers: Row<
        QuizAnswer,
        [
          BelongsTo<"quiz_answers_quiz_attempt_id_fkey", "quiz_attempt_id", "quiz_attempts">,
          BelongsTo<"quiz_answers_question_id_fkey", "question_id", "questions">,
        ]
      >;
      starred_questions: Row<
        StarredQuestion,
        [
          BelongsTo<"starred_questions_profile_id_fkey", "profile_id", "profiles">,
          BelongsTo<"starred_questions_question_id_fkey", "question_id", "questions">,
        ]
      >;
      study_activity: Row<
        StudyActivity,
        [
          BelongsTo<"study_activity_profile_id_fkey", "profile_id", "profiles">,
          BelongsTo<"study_activity_deck_id_fkey", "deck_id", "decks">,
        ]
      >;
    };
    Views: Record<never, never>;
    Functions: {
      deck_stats: {
        Args: { p_profile_id: string };
        Returns: DeckStats[];
      };
      topic_stats: {
        Args: { p_deck_id: string; p_profile_id: string };
        Returns: TopicStats[];
      };
      record_answer: {
        Args: { p_profile_id: string; p_question_id: string; p_correct: boolean };
        Returns: undefined;
      };
      record_answers: {
        Args: { p_profile_id: string; p_answers: { question_id: string; correct: boolean }[] };
        Returns: undefined;
      };
      record_answer_once: {
        Args: {
          p_event_id: string;
          p_profile_id: string;
          p_question_id: string;
          p_correct: boolean;
          p_source?: string;
        };
        Returns: boolean;
      };
      record_answers_once: {
        Args: {
          p_profile_id: string;
          p_answers: { event_id: string; question_id: string; correct: boolean }[];
          p_source?: string;
        };
        Returns: undefined;
      };
      touch_study_activity: {
        Args: { p_profile_id: string; p_deck_id: string; p_mode?: string };
        Returns: undefined;
      };
      deck_review_counts: {
        Args: { p_profile_id: string };
        Returns: DeckReviewCounts[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
