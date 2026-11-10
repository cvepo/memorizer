"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { saveQuestion, type ActionState } from "@/lib/actions/content";
import type { StudyQuestion } from "@/lib/types";

const initial: ActionState = { error: null };

export function QuestionForm({
  deckId,
  question,
  topics,
  onDone,
  onCancel,
}: {
  deckId: string;
  question?: StudyQuestion;
  topics: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(saveQuestion, initial);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (state.ok) onDoneRef.current();
  }, [state.ok]);

  const [multi, setMulti] = useState(question?.answer_mode === "multi");

  const wrongAnswers = (question?.choices ?? [])
    .filter((choice) => !choice.is_correct)
    .map((choice) => choice.answer_text);
  const distractors = [0, 1, 2].map((index) => wrongAnswers[index] ?? "");

  // In multi mode the stored choices are the truth; in single mode the
  // question row is, and a question with generated distractors has no stored
  // correct choice at all.
  const storedCorrect = (question?.choices ?? [])
    .filter((choice) => choice.is_correct)
    .map((choice) => choice.answer_text);
  const correctAnswers =
    question?.answer_mode === "multi"
      ? storedCorrect
      : [question?.correct_answer ?? ""];
  const correctFields = multi
    ? [0, 1, 2, 3].map((index) => correctAnswers[index] ?? "")
    : [correctAnswers[0] ?? ""];

  const topicListId = `topics-${question?.id ?? "new"}`;

  return (
    <Card className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="deck_id" value={deckId} />
        {question ? <input type="hidden" name="id" value={question.id} /> : null}

        <Field label="Question">
          <Textarea
            name="question_text"
            required
            defaultValue={question?.question_text ?? ""}
            placeholder="What does the enzyme catalase break down?"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="answer_mode"
            value="multi"
            checked={multi}
            onChange={(event) => setMulti(event.target.checked)}
            className="h-4 w-4 rounded border-line-strong"
          />
          <span>Select all that apply — more than one answer is correct</span>
        </label>

        <Field
          label={multi ? "Correct answers" : "Correct answer"}
          hint={multi ? "At least two. Blank rows are ignored." : undefined}
        >
          <div className="space-y-2">
            {correctFields.map((value, index) => (
              <Input
                key={`${multi}-${index}`}
                name="correct_answer"
                required={index === 0}
                defaultValue={value}
                aria-label={multi ? `Correct answer ${index + 1}` : "Correct answer"}
                placeholder={multi ? `Correct answer ${index + 1}` : "Hydrogen peroxide"}
              />
            ))}
          </div>
        </Field>

        <Field
          label="Wrong answer choices"
          hint={
            multi
              ? "Required — a select-all question cannot use generated distractors."
              : "Leave blank to generate distractors from other answers in this deck."
          }
        >
          <div className="space-y-2">
            {distractors.map((value, index) => (
              <Input
                key={index}
                name="distractor"
                defaultValue={value}
                aria-label={`Wrong answer ${index + 1}`}
                placeholder={`Wrong answer ${index + 1}`}
              />
            ))}
          </div>
        </Field>

        <Field label="Explanation">
          <Textarea
            name="explanation"
            defaultValue={question?.explanation ?? ""}
            placeholder="Optional — shown after the answer is revealed."
          />
        </Field>

        <Field label="Topic">
          <Input
            name="topic"
            list={topicListId}
            defaultValue={question?.topic ?? ""}
            placeholder="Optional — groups questions in the deck"
          />
          <datalist id={topicListId}>
            {topics.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>
        </Field>

        {state.error ? (
          <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save question"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
