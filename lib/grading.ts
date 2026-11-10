import type { Choice } from "@/lib/distractors";
import type { OptionState } from "@/components/MCQOption";

/**
 * Grading shared by Learn and Quiz so the two modes cannot drift.
 *
 * A selection is always an array of chosen option texts. A single-answer
 * question is just the one-element case, which keeps both study modes on one
 * code path instead of branching on answer_mode everywhere.
 */

/** Chosen option texts, in the order they were picked. */
export type Selection = readonly string[];

const key = (text: string) => text.trim().toLowerCase();

/**
 * All-or-nothing: the chosen set must match the correct set exactly.
 *
 * Partial credit is deliberately not offered. Mastery is driven by this
 * result, and crediting a half-right answer would let a question climb to
 * Mastered without the learner ever naming the full set.
 */
export function isAnswerCorrect(choices: readonly Choice[], selected: Selection): boolean {
  const wanted = new Set(choices.filter((choice) => choice.isCorrect).map((c) => key(c.text)));
  const chosen = new Set(selected.map(key));
  if (wanted.size === 0 || wanted.size !== chosen.size) return false;
  for (const text of wanted) if (!chosen.has(text)) return false;
  return true;
}

/** How many of the correct options were picked, for per-option feedback. */
export function selectionBreakdown(choices: readonly Choice[], selected: Selection) {
  const chosen = new Set(selected.map(key));
  const correct = choices.filter((choice) => choice.isCorrect);
  return {
    hit: correct.filter((choice) => chosen.has(key(choice.text))).length,
    total: correct.length,
    wrong: selected.filter(
      (text) => !choices.some((choice) => choice.isCorrect && key(choice.text) === key(text)),
    ).length,
  };
}

/**
 * How one option should render. Before grading only the picked/unpicked
 * distinction exists; afterwards every option reports whether it was hit,
 * wrongly picked, or missed, which is what makes a multi-select answer
 * reviewable rather than just "wrong".
 */
export function optionState(choice: Choice, selected: Selection, revealed: boolean): OptionState {
  const isChosen = selected.some((text) => key(text) === key(choice.text));
  if (!revealed) return isChosen ? "selected" : "idle";
  if (isChosen) return choice.isCorrect ? "correct" : "incorrect";
  return choice.isCorrect ? "missed" : "idle";
}

/** Toggles one option, respecting the question's answer mode. */
export function toggleSelection(selected: Selection, text: string, multi: boolean): string[] {
  if (!multi) return [text];
  return selected.some((value) => key(value) === key(text))
    ? selected.filter((value) => key(value) !== key(text))
    : [...selected, text];
}

/**
 * The readable summary stored on `questions.correct_answer` for a multi
 * question, and shown wherever one line has to stand in for the answer set.
 */
export function summarizeAnswers(texts: readonly string[]): string {
  const parts = texts.map((text) => text.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
