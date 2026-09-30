"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmbeddedFlashcard } from "@/app/(app)/decks/[deckId]/EmbeddedFlashcard";
import { generateChoices, type Choice } from "@/lib/distractors";
import { Button, ButtonLink, Card, cn } from "@/components/ui";
import { touchStudyActivity } from "@/lib/actions/activity";
import { shuffle } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

type Filter = "all" | "review" | "starred";

/** One study-activity ping covers a burst of cards; without it every keypress
 *  would be a request. */
const ACTIVITY_INTERVAL_MS = 30_000;

const SWIPE_MIN_PX = 48;
const SWIPE_HORIZONTAL_RATIO = 1.5;

function positionKey(profileId: string, deckId: string) {
  return `memorizer-card-position:${profileId}:${deckId}`;
}

function readStoredPosition(profileId: string, deckId: string): number | null {
  try {
    const raw = window.localStorage.getItem(positionKey(profileId, deckId));
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function DeckStudy({
  deckId,
  deckName,
  questions,
  starredIds,
  needsReviewIds,
  profileId,
}: {
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
  starredIds: string[];
  needsReviewIds: string[];
  profileId: string;
}) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("q");

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const deckOrder = useMemo(() => questions.map((q) => q.id), [questions]);
  const reviewSet = useMemo(() => new Set(needsReviewIds), [needsReviewIds]);

  const [starred, setStarred] = useState<Set<string>>(() => new Set(starredIds));
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<string[]>(deckOrder);
  const [index, setIndex] = useState(0);
  /** Options for the card on screen. Generated once per card and kept in state:
   *  generateChoices shuffles, so running it during render would reorder the
   *  options on every repaint and disagree with the server-rendered HTML. */
  const [cardChoices, setCardChoices] = useState<{ id: string; choices: Choice[] } | null>(null);
  const [revealed, setRevealed] = useState(false);

  const lastTouchAt = useRef(0);
  const restored = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const starredCount = useMemo(
    () => deckOrder.reduce((n, id) => (starred.has(id) ? n + 1 : n), 0),
    [deckOrder, starred],
  );

  const markStudied = useCallback(() => {
    const now = Date.now();
    if (now - lastTouchAt.current < ACTIVITY_INTERVAL_MS) return;
    lastTouchAt.current = now;
    // Activity only — flashcards must never touch mastery or accuracy.
    void touchStudyActivity(deckId, "flashcards").catch(() => {});
  }, [deckId]);

  // Restore the saved position (or the deep-linked question) after hydration.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const deepLinked = requestedId ? deckOrder.indexOf(requestedId) : -1;
    const target = deepLinked >= 0 ? deepLinked : (readStoredPosition(profileId, deckId) ?? 0);
    if (target <= 0 || target >= deckOrder.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored position and `?q` are client-only; reading them during render would mismatch the server HTML.
    setIndex(target);
  }, [deckId, deckOrder, profileId, requestedId]);

  // Only the unfiltered sequence is worth remembering; a filtered index would
  // point at a different card next visit.
  useEffect(() => {
    if (filter !== "all") return;
    try {
      window.localStorage.setItem(positionKey(profileId, deckId), String(index));
    } catch {
      // Private browsing or a full quota — the position is a convenience only.
    }
  }, [deckId, filter, index, profileId]);

  const reveal = useCallback(() => {
    markStudied();
    setRevealed((value) => !value);
  }, [markStudied]);

  const previous = useCallback(() => {
    setIndex((i) => (i === 0 ? i : i - 1));
    setRevealed(false);
    markStudied();
  }, [markStudied]);

  const next = useCallback(() => {
    setIndex((i) => (i >= order.length - 1 ? i : i + 1));
    setRevealed(false);
    markStudied();
  }, [markStudied, order.length]);

  const idsFor = useCallback(
    (value: Filter) => {
      if (value === "review") return deckOrder.filter((id) => reviewSet.has(id));
      if (value === "starred") return deckOrder.filter((id) => starred.has(id));
      return deckOrder;
    },
    [deckOrder, reviewSet, starred],
  );

  const applyFilter = useCallback(
    (value: Filter) => {
      const ids = idsFor(value);
      if (ids.length === 0) return;
      setFilter(value);
      setOrder(ids);
      setIndex(0);
      setRevealed(false);
    },
    [idsFor],
  );

  const reshuffle = useCallback(() => {
    setOrder((ids) => shuffle(ids));
    setIndex(0);
    setRevealed(false);
  }, []);

  const restart = useCallback(() => {
    setOrder(idsFor(filter));
    setIndex(0);
    setRevealed(false);
  }, [filter, idsFor]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditable(event.target)) return;
      const tag = event.target instanceof HTMLElement ? event.target.tagName : "";

      if (event.key === " " || event.key === "Enter") {
        // A focused button or link keeps its own keyboard activation.
        if (tag === "BUTTON" || tag === "A") return;
        event.preventDefault();
        reveal();
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
  }, [next, previous, reveal]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    swiped.current = false;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      // Vertical scrolling must survive untouched, so a swipe has to be both
      // long enough and clearly horizontal.
      if (Math.abs(dx) <= SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
        return;
      }
      swiped.current = true;
      if (dx < 0) next();
      else previous();
    },
    [next, previous],
  );

  const onToggle = useCallback(() => {
    // The click that ends a swipe would otherwise also flip the card.
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    reveal();
  }, [reveal]);

  const currentId = order[Math.min(index, Math.max(order.length - 1, 0))];
  const current = currentId ? byId.get(currentId) : undefined;

  useEffect(() => {
    if (!current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- generateChoices shuffles; doing this during render would break hydration.
    setCardChoices({ id: current.id, choices: generateChoices(current, questions) });
  }, [current, questions]);
  if (!current) return null;

  const atEnd = index >= order.length - 1;
  const reviewCount = reviewSet.size;

  const shortcut = (value: Exclude<Filter, "all">, label: string, count: number, why: string) => {
    const active = filter === value;
    return (
      <button
        type="button"
        onClick={() => applyFilter(value)}
        disabled={count === 0}
        aria-pressed={active}
        title={count === 0 ? why : `Show only these ${count} cards`}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors duration-150",
          active
            ? "border-transparent bg-accent text-accent-fg"
            : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2",
          count === 0 && "cursor-not-allowed opacity-50",
        )}
      >
        <span>{label}</span>
        <span className="tabular-nums">· {count}</span>
      </button>
    );
  };

  return (
    <section aria-label={`${deckName} flashcards`} className="space-y-4">
      <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="touch-pan-y">
        <EmbeddedFlashcard
          question={current}
          choices={cardChoices?.id === current.id ? cardChoices.choices : null}
          revealed={revealed}
          onToggle={onToggle}
          starred={starred.has(current.id)}
          index={index}
          total={order.length}
          onStarChange={(value) =>
            setStarred((previousSet) => {
              const copy = new Set(previousSet);
              if (value) copy.add(current.id);
              else copy.delete(current.id);
              return copy;
            })
          }
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" onClick={previous} disabled={index === 0}>
          Previous
        </Button>
        <p className="text-sm tabular-nums text-muted" aria-live="polite">
          {index + 1} of {order.length}
        </p>
        <Button variant="secondary" onClick={next} disabled={atEnd}>
          Next
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={reveal}>
          {revealed ? "Show question" : "Show answer"}
        </Button>
        <Button variant="ghost" size="sm" onClick={reshuffle}>
          Shuffle
        </Button>
        {atEnd ? (
          <>
            <Button variant="ghost" size="sm" onClick={restart}>
              Restart
            </Button>
            <ButtonLink href={`/decks/${deckId}/learn`} variant="ghost" size="sm">
              Start Learn
            </ButtonLink>
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {shortcut(
          "review",
          "Needs review",
          reviewCount,
          "Nothing needs review yet — Learn and Quiz flag questions you miss twice.",
        )}
        {shortcut("starred", "Starred", starredCount, "Star a question to collect it here.")}
        {filter === "all" ? null : (
          <Button variant="ghost" size="sm" onClick={() => applyFilter("all")}>
            Show all {deckOrder.length}
          </Button>
        )}
      </div>

      {atEnd ? (
        <Card className="space-y-2">
          <p className="text-sm font-medium">
            That&rsquo;s all {order.length} {order.length === 1 ? "card" : "cards"}
          </p>
          <p className="text-sm text-muted">
            Flashcards don&rsquo;t change your mastery or accuracy. Learn and Quiz do.
          </p>
        </Card>
      ) : null}
    </section>
  );
}
