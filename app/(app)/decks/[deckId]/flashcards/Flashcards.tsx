"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, ButtonLink, Card, PageHeader, ProgressBar, cn } from "@/components/ui";
import { shuffle } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

/** Shared by both faces. Generous vertical padding leaves room for the label
 * at the top and the hint at the bottom without crowding long questions. */
const FACE =
  "absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto " +
  "rounded-2xl border px-6 py-14 text-center [backface-visibility:hidden] sm:px-10";

const FACE_LABEL = "absolute inset-x-0 top-5 text-[11px] font-semibold uppercase tracking-[0.14em]";
const FACE_HINT = "absolute inset-x-0 bottom-5 text-xs text-muted";

export function Flashcards({
  deckId,
  deckName,
  questions,
}: {
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
}) {
  const [order, setOrder] = useState<string[]>(() => questions.map((q) => q.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const current = byId.get(order[index]);

  const flip = useCallback(() => setFlipped((value) => !value), []);

  const previous = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setFlipped(false);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => Math.min(order.length - 1, i + 1));
    setFlipped(false);
  }, [order.length]);

  const reshuffle = useCallback(() => {
    setOrder((ids) => shuffle(ids));
    setIndex(0);
    setFlipped(false);
  }, []);

  const restart = useCallback(() => {
    setOrder(questions.map((q) => q.id));
    setIndex(0);
    setFlipped(false);
  }, [questions]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const tag = target instanceof HTMLElement ? target.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (event.key === " " || event.key === "Enter") {
        // Let a focused button or link keep its own keyboard activation (the
        // card flips itself via onClick); preventDefault here would swallow it.
        if (tag === "BUTTON" || tag === "A") return;
        event.preventDefault();
        flip();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flip, next, previous]);

  if (!current) return null;

  const atEnd = index === order.length - 1;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href={`/decks/${deckId}`}
          className="inline-flex min-h-11 items-center text-sm text-muted transition-colors duration-150 hover:text-ink"
        >
          ← Back to deck
        </Link>
        <PageHeader title={deckName} subtitle="Flashcards" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-muted">
            {index + 1} / {order.length}
          </p>
          <p className="hidden text-sm text-muted sm:block">Space to flip · ← → to move</p>
        </div>
        <ProgressBar value={index + 1} total={order.length} tone="accent" />
      </div>

      {/* The perspective has to sit on the rotating element's DIRECT parent,
          otherwise the rotation is orthographic and reads as a squash rather
          than a card turning over. */}
      <button
        type="button"
        onClick={flip}
        aria-label={flipped ? "Show the question" : "Show the answer"}
        className="block w-full rounded-2xl [perspective:1200px]"
      >
        <div
          className={cn(
            "relative min-h-64 transition-transform duration-500 ease-in-out will-change-transform",
            "[transform-style:preserve-3d] sm:min-h-80",
            flipped && "[transform:rotateY(180deg)]",
          )}
        >
          <div className={cn(FACE, "border-line bg-surface")} aria-hidden={flipped}>
            <span className={cn(FACE_LABEL, "text-muted")}>Question</span>
            <p className="text-xl font-medium leading-snug sm:text-2xl">{current.question_text}</p>
            <span className={FACE_HINT}>Click or press Space to reveal</span>
          </div>

          <div
            className={cn(FACE, "tint-accent [transform:rotateY(180deg)]")}
            aria-hidden={!flipped}
          >
            <span className={cn(FACE_LABEL, "text-accent")}>Answer</span>
            <p className="text-2xl font-semibold sm:text-3xl">{current.correct_answer}</p>
            {current.explanation ? (
              <p className="max-w-prose text-sm text-muted">{current.explanation}</p>
            ) : null}
          </div>
        </div>
      </button>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={previous} disabled={index === 0}>
            Previous
          </Button>
          <Button onClick={flip}>{flipped ? "Show question" : "Show answer"}</Button>
          <Button variant="secondary" onClick={next} disabled={atEnd}>
            Next
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reshuffle}>
            Shuffle
          </Button>
          <Button variant="ghost" size="sm" onClick={restart}>
            Restart
          </Button>
        </div>
      </div>

      {atEnd ? (
        <Card className="space-y-3">
          <p className="font-medium">
            You&rsquo;ve been through all {order.length} {order.length === 1 ? "card" : "cards"}
          </p>
          <p className="text-sm text-muted">
            Flashcards don&rsquo;t record progress. Learn mode does.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`/decks/${deckId}/learn`}>Start Learn</ButtonLink>
            <Button variant="secondary" onClick={restart}>
              Restart
            </Button>
            <Button variant="secondary" onClick={reshuffle}>
              Shuffle
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
