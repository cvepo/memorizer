"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { QuestionForm } from "@/app/(app)/decks/[deckId]/edit/QuestionForm";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { deleteQuestion, reorderQuestions } from "@/lib/actions/content";
import type { StudyQuestion } from "@/lib/types";

type OpenForm = { mode: "new" } | { mode: "edit"; id: string } | null;

function matches(question: StudyQuestion, needle: string) {
  return (
    question.question_text.toLowerCase().includes(needle) ||
    question.correct_answer.toLowerCase().includes(needle) ||
    (question.topic ?? "").toLowerCase().includes(needle)
  );
}

export function DeckEditor({
  deckId,
  deckName,
  questions,
  topics,
}: {
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
  topics: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState(questions);
  const [serverItems, setServerItems] = useState(questions);
  // The server list is the source of truth; adopt it whenever a refresh brings a new one.
  if (serverItems !== questions) {
    setServerItems(questions);
    setItems(questions);
  }

  const [query, setQuery] = useState("");
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const filtering = needle.length > 0;
  const rows = filtering ? items.filter((question) => matches(question, needle)) : items;

  const closeForm = () => setOpenForm(null);

  const saved = () => {
    setOpenForm(null);
    router.refresh();
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    startTransition(async () => {
      await reorderQuestions(
        deckId,
        next.map((question) => question.id),
      );
    });
  };

  const remove = (questionId: string) => {
    setArmedDeleteId(null);
    setItems((current) => current.filter((question) => question.id !== questionId));
    startTransition(async () => {
      await deleteQuestion(questionId, deckId);
    });
  };

  return (
    <div className="space-y-6">
      <Link href={`/decks/${deckId}`} className="inline-block text-sm text-muted hover:text-ink">
        ← Back to deck
      </Link>

      <PageHeader
        title="Edit deck"
        subtitle={deckName}
        actions={
          <Button
            onClick={() => {
              setArmedDeleteId(null);
              setOpenForm({ mode: "new" });
            }}
            disabled={openForm?.mode === "new"}
          >
            Add question
          </Button>
        }
      />

      {items.length === 0 && openForm === null ? (
        <EmptyState
          title="No questions yet"
          description="Import a spreadsheet to fill this deck, or add questions one at a time."
          action={<ButtonLink href="/import">Import questions</ButtonLink>}
        />
      ) : (
        <>
          <div className="space-y-2">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search questions"
              placeholder="Search questions, answers or topics"
            />
            <p className="text-sm text-muted">
              {filtering
                ? `${rows.length} of ${items.length} ${items.length === 1 ? "question" : "questions"}`
                : `${items.length} ${items.length === 1 ? "question" : "questions"}`}
            </p>
            {filtering ? (
              <p className="text-sm text-muted">
                Reordering is off while you are searching — clear the search to move questions.
              </p>
            ) : null}
          </div>

          {openForm?.mode === "new" ? (
            <QuestionForm
              deckId={deckId}
              topics={topics}
              onDone={saved}
              onCancel={closeForm}
            />
          ) : null}

          {filtering && rows.length === 0 ? (
            <EmptyState title="No matches" description="Try a different word or clear the search." />
          ) : null}

          <ul className="space-y-3">
            {rows.map((question) => {
              const index = items.indexOf(question);
              const editing = openForm?.mode === "edit" && openForm.id === question.id;
              const wrongAnswers = question.choices.filter((choice) => !choice.is_correct).length;

              return (
                <li key={question.id}>
                  {editing ? (
                    <QuestionForm
                      deckId={deckId}
                      question={question}
                      topics={topics}
                      onDone={saved}
                      onCancel={closeForm}
                    />
                  ) : (
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 sm:flex-nowrap">
                        <span className="text-sm tabular-nums text-muted">{index + 1}</span>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="line-clamp-2 text-sm">{question.question_text}</p>
                          <p className="text-sm text-success">{question.correct_answer}</p>
                          <div className="flex flex-wrap gap-2">
                            {question.topic ? <Badge tone="accent">{question.topic}</Badge> : null}
                            <Badge tone="muted">
                              {wrongAnswers > 0
                                ? `${question.choices.length} choices`
                                : "auto distractors"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setArmedDeleteId(null);
                              setOpenForm({ mode: "edit", id: question.id });
                            }}
                          >
                            Edit
                          </Button>

                          {armedDeleteId === question.id ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => remove(question.id)}
                              disabled={pending}
                            >
                              Confirm delete
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setArmedDeleteId(question.id)}
                              className="text-danger"
                            >
                              Delete
                            </Button>
                          )}

                          {filtering ? null : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Move up"
                                onClick={() => move(index, -1)}
                                disabled={pending || index === 0}
                              >
                                ↑
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Move down"
                                onClick={() => move(index, 1)}
                                disabled={pending || index === items.length - 1}
                              >
                                ↓
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
