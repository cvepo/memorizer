"use client";

import { startTransition, useActionState, useEffect, useOptimistic, useRef, useState } from "react";

import { Button, Field, Input, Textarea, cn } from "@/components/ui";
import { deleteQuestion } from "@/lib/actions/content";
import { quickFixQuestion, setIgnored, type QuickFixState } from "@/lib/actions/questions";

const FIX_INITIAL: QuickFixState = { error: null };

/** Menu rows sit on a surface, so they hover to surface-2 rather than the
 *  ghost button's surface-on-surface, which would not show. */
const ITEM =
  "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium transition-colors hover:bg-surface-2";

const REPORT_ADDRESS = "emh274@cornell.edu";

function reportMailto({
  questionText,
  correctAnswer,
  topic,
  deckId,
  questionId,
}: {
  questionText: string;
  correctAnswer: string;
  topic: string | null;
  deckId: string;
  questionId: string;
}) {
  const subject = "Memorizer — problem with a question";
  const body = [
    `Question: ${questionText}`,
    `Stored answer: ${correctAnswer}`,
    `Topic: ${topic || "none"}`,
    `Deck: ${deckId}`,
    `Question id: ${questionId}`,
    "",
    "What's wrong:",
  ].join("\n");

  // Question text can contain &, #, ? and newlines. Left raw, any of those
  // ends the query and the mail client drops the rest of the report.
  return `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type View = "menu" | "fix" | "delete";

/**
 * Per-question menu. Its own control, like the star, so using it never flips
 * the card underneath or grades the question on screen.
 */
export function QuestionActions({
  questionId,
  deckId,
  ignored,
  isAdmin,
  questionText,
  correctAnswer,
  topic,
  onIgnoredChange,
  onDeleted,
  size = "md",
  className,
}: {
  questionId: string;
  deckId: string;
  ignored: boolean;
  isAdmin: boolean;
  questionText: string;
  correctAnswer: string;
  topic: string | null;
  onIgnoredChange?: (ignored: boolean) => void;
  onDeleted?: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const [saved, setSaved] = useState(ignored);
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  const menuId = `question-actions-${questionId}`;
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";

  function close() {
    setOpen(false);
    setView("menu");
    setDeleteError(null);
    setDeleting(false);
  }

  useEffect(() => {
    if (!open) {
      if (!opened.current) return;
      opened.current = false;
      triggerRef.current?.focus();
      return;
    }

    opened.current = true;
    const node = panelRef.current?.querySelector<HTMLElement>(
      "textarea, input:not([type='hidden']), button",
    );
    node?.focus();
  }, [open, view]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      // Deck and Learn listen on window. A key aimed at this menu must not
      // reveal a card, grade an answer, or move to the next question.
      event.stopPropagation();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function keep(event: React.SyntheticEvent) {
    // The card behind this is a reveal target; never let the click through.
    event.preventDefault();
    event.stopPropagation();
  }

  function toggle(event: React.MouseEvent) {
    keep(event);
    setView("menu");
    setOpen((value) => !value);
  }

  function toggleIgnored(event: React.MouseEvent) {
    keep(event);
    const next = !optimistic;

    startTransition(async () => {
      setOptimistic(next);
      try {
        await setIgnored(questionId, next, deckId);
        setSaved(next);
        setFailed(false);
        close();
        onIgnoredChange?.(next);
      } catch {
        setFailed(true);
      }
    });
  }

  function confirmDelete(event: React.MouseEvent) {
    keep(event);
    setDeleting(true);
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteQuestion(questionId, deckId);
        close();
        onDeleted?.();
      } catch (error) {
        setDeleteError(error instanceof Error ? error.message : "Could not delete this question.");
        setDeleting(false);
      }
    });
  }

  return (
    <div
      ref={rootRef}
      data-question-actions
      className={cn("relative shrink-0", className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Question actions"
        title={failed ? "Could not save — try again" : "Question actions"}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border transition-colors",
          box,
          failed
            ? "border-danger text-ink"
            : open
              ? "border-line-strong text-ink"
              : "border-line text-muted hover:border-line-strong hover:text-ink",
        )}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden focusable="false">
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role={view === "menu" ? "menu" : undefined}
          aria-label="Question actions"
          className="absolute right-0 z-30 mt-1 max-h-[min(24rem,calc(100dvh-6rem))] w-[min(15rem,calc(100vw-4rem))] overflow-x-hidden overflow-y-auto rounded-xl border border-line bg-surface p-1"
        >
          {view === "fix" ? (
            <FixQuestionForm
              questionId={questionId}
              deckId={deckId}
              questionText={questionText}
              correctAnswer={correctAnswer}
              topic={topic}
              onCancel={() => setView("menu")}
              onDone={close}
            />
          ) : view === "delete" ? (
            <div className="space-y-2 p-2">
              <p className="text-sm font-medium text-ink">Delete question?</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="danger" size="md" disabled={deleting} onClick={confirmDelete}>
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={deleting}
                  onClick={(event) => {
                    keep(event);
                    setView("menu");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {deleteError ? (
                <p role="alert" className="text-sm text-danger">
                  {deleteError}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col">
              <button type="button" role="menuitem" className={cn(ITEM, "text-ink")} onClick={toggleIgnored}>
                {optimistic ? "Unhide question" : "Hide question"}
              </button>
              <a
                role="menuitem"
                href={reportMailto({ questionText, correctAnswer, topic, deckId, questionId })}
                className={cn(ITEM, "text-ink")}
                onClick={(event) => {
                  // keep() would preventDefault and the mail client would never
                  // open. The card behind the menu is a reveal target, so the
                  // click still must not reach it.
                  event.stopPropagation();
                  // Closing here unmounts this link before the browser follows it.
                  queueMicrotask(() => close());
                }}
              >
                Report a problem
              </a>
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={cn(ITEM, "text-ink")}
                    onClick={(event) => {
                      keep(event);
                      setView("fix");
                    }}
                  >
                    Fix question
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={cn(ITEM, "text-danger")}
                    onClick={(event) => {
                      keep(event);
                      setDeleteError(null);
                      setView("delete");
                    }}
                  >
                    Delete question
                  </button>
                </>
              ) : null}
              {failed ? (
                <p role="alert" className="px-3 py-1 text-xs text-danger">
                  Could not save — try again
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FixQuestionForm({
  questionId,
  deckId,
  questionText,
  correctAnswer,
  topic,
  onCancel,
  onDone,
}: {
  questionId: string;
  deckId: string;
  questionText: string;
  correctAnswer: string;
  topic: string | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(quickFixQuestion, FIX_INITIAL);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (state.ok) onDoneRef.current();
  }, [state.ok]);

  return (
    <form action={formAction} className="space-y-3 p-2" onClick={(event) => event.stopPropagation()}>
      <input type="hidden" name="question_id" value={questionId} />
      <input type="hidden" name="deck_id" value={deckId} />

      <Field label="Question">
        <Textarea name="question_text" required defaultValue={questionText} aria-label="Question" className="min-h-24" />
      </Field>
      <Field label="Correct answer">
        <Input name="correct_answer" required defaultValue={correctAnswer} aria-label="Correct answer" className="min-h-11" />
      </Field>
      <Field label="Topic">
        <Input name="topic" defaultValue={topic ?? ""} aria-label="Topic" className="min-h-11" />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          disabled={pending}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
