"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmbeddedFlashcard } from "@/app/(app)/decks/[deckId]/EmbeddedFlashcard";
import { generateChoices, type Choice } from "@/lib/distractors";
import { Button, ButtonLink, Card, cn } from "@/components/ui";
import { touchStudyActivity } from "@/lib/actions/activity";
import { shuffle } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

type Filter = "all" | "review" | "starred" | "ignored";

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

function isQuestionMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-question-actions]") !== null;
}

export function DeckStudy({
  deckId,
  deckName,
  questions,
  starredIds,
  needsReviewIds,
  ignoredIds,
  profileId,
  isAdmin,
}: {
  deckId: string;
  deckName: string;
  questions: StudyQuestion[];
  starredIds: string[];
  needsReviewIds: string[];
  ignoredIds: string[];
  profileId: string;
  isAdmin: boolean;
}) {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("q");

  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const deckOrder = useMemo(
    () => questions.map((q) => q.id).filter((id) => !removedIds.has(id)),
    [questions, removedIds],
  );
  const reviewSet = useMemo(() => new Set(needsReviewIds), [needsReviewIds]);

  const [starred, setStarred] = useState<Set<string>>(() => new Set(starredIds));
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set(ignoredIds));
  const [filter, setFilter] = useState<Filter>("all");
  // Ignored questions stay out of the pass you are studying. The Ignored filter
  // is the only place they are dealt.
  const [order, setOrder] = useState<string[]>(() =>
    questions.map((q) => q.id).filter((id) => !ignoredIds.includes(id)),
  );
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

  const activeIds = useMemo(
    () => deckOrder.filter((id) => !ignored.has(id)),
    [deckOrder, ignored],
  );
  const ignoredCount = deckOrder.length - activeIds.length;
  const starredCount = useMemo(
    () => activeIds.reduce((n, id) => (starred.has(id) ? n + 1 : n), 0),
    [activeIds, starred],
  );
  const reviewCount = useMemo(
    () => activeIds.reduce((n, id) => (reviewSet.has(id) ? n + 1 : n), 0),
    [activeIds, reviewSet],
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

    const active = deckOrder.filter((id) => !ignored.has(id));
    if (requestedId && ignored.has(requestedId)) {
      const ids = deckOrder.filter((id) => ignored.has(id));
      const at = ids.indexOf(requestedId);
      if (at >= 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- `?q` is client-only; reading it during render would mismatch the server HTML.
        setFilter("ignored");
        setOrder(ids);
        setIndex(at);
        return;
      }
    }

    const deepLinked = requestedId ? active.indexOf(requestedId) : -1;
    const target = deepLinked >= 0 ? deepLinked : (readStoredPosition(profileId, deckId) ?? 0);
    if (target <= 0 || target >= active.length) return;
    setIndex(target);
  }, [deckId, deckOrder, ignored, profileId, requestedId]);

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
      if (value === "review") return activeIds.filter((id) => reviewSet.has(id));
      if (value === "starred") return activeIds.filter((id) => starred.has(id));
      if (value === "ignored") return deckOrder.filter((id) => ignored.has(id));
      return activeIds;
    },
    [activeIds, deckOrder, ignored, reviewSet, starred],
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
      if (isEditable(event.target) || isQuestionMenu(event.target)) return;
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

  // Drop the card that just left this view and stay on the one that slides into
  // its place. Ignoring never reveals, grades, or touches mastery.
  function releaseQuestion(questionId: string) {
    const at = order.indexOf(questionId);
    if (at < 0) return;
    const nextLength = order.length - 1;
    const shown = Math.min(index, Math.max(order.length - 1, 0));
    setOrder(order.filter((id) => id !== questionId));
    setIndex(nextLength === 0 ? 0 : Math.min(shown, nextLength - 1));
    setRevealed(false);
  }

  const atEnd = order.length > 0 && index >= order.length - 1;

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
      {current ? (
        <>
          <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="touch-pan-y">
            <EmbeddedFlashcard
              question={current}
              choices={cardChoices?.id === current.id ? cardChoices.choices : null}
              revealed={revealed}
              onToggle={onToggle}
              starred={starred.has(current.id)}
              index={index}
              total={order.length}
              isAdmin={isAdmin}
              ignored={ignored.has(current.id)}
              onStarChange={(value) =>
                setStarred((previousSet) => {
                  const copy = new Set(previousSet);
                  if (value) copy.add(current.id);
                  else copy.delete(current.id);
                  return copy;
                })
              }
              onIgnoredChange={(next) => {
                setIgnored((previous) => {
                  const copy = new Set(previous);
                  if (next) copy.add(current.id);
                  else copy.delete(current.id);
                  return copy;
                });
                const leaves = filter === "ignored" ? !next : next;
                if (leaves) releaseQuestion(current.id);
              }}
              onDeleted={() => {
                setRemovedIds((previous) => {
                  const copy = new Set(previous);
                  copy.add(current.id);
                  return copy;
                });
                setIgnored((previous) => {
                  if (!previous.has(current.id)) return previous;
                  const copy = new Set(previous);
                  copy.delete(current.id);
                  return copy;
                });
                releaseQuestion(current.id);
              }}
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
        </>
      ) : (
        <Card className="space-y-2">
          <p className="text-sm font-medium">No cards in this view</p>
          <p className="text-sm text-muted">
            {ignoredCount > 0
              ? "Hidden questions are set aside until you open them from the filter below."
              : "Nothing is left in this pass."}
          </p>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {shortcut(
          "review",
          "Needs review",
          reviewCount,
          "Nothing needs review yet — Learn and Quiz flag questions you miss twice.",
        )}
        {shortcut("starred", "Starred", starredCount, "Star a question to collect it here.")}
        {shortcut("ignored", "Hidden", ignoredCount, "Hide a question to set it aside here.")}
        {filter === "all" ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => applyFilter("all")}
            disabled={activeIds.length === 0}
          >
            Show all {activeIds.length}
          </Button>
        )}
      </div>

      {current && atEnd ? (
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
