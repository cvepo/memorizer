"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StarButton } from "@/components/StarButton";
import { Badge, ButtonLink, Card, EmptyState, Input, Select } from "@/components/ui";
import { MASTERY_LABELS, type MasteryLevel } from "@/lib/learnAlgorithm";
import type { Course, Deck, QuestionSummary } from "@/lib/types";

type StarredItem = QuestionSummary & { deck: Deck | null; course: Course | null };

type DeckGroup = {
  deckId: string;
  deck: Deck | null;
  course: Course | null;
  items: StarredItem[];
};

function deckLabel(course: Course | null, deck: Deck | null) {
  return [course?.name, deck?.name ?? "Deck removed"].filter(Boolean).join(" · ");
}

export function StarredView({ items }: { items: StarredItem[] }) {
  // Unstarring is optimistic in StarButton; we only need to know which rows
  // to drop from this view once the server call confirms removal.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [deckFilter, setDeckFilter] = useState("all");

  const active = useMemo(() => items.filter((item) => !removedIds.has(item.id)), [items, removedIds]);

  const decks = useMemo(() => {
    const map = new Map<string, { deckId: string; label: string; count: number }>();
    for (const item of active) {
      const existing = map.get(item.deck_id);
      if (existing) existing.count += 1;
      else map.set(item.deck_id, { deckId: item.deck_id, label: deckLabel(item.course, item.deck), count: 1 });
    }
    return Array.from(map.values());
  }, [active]);

  const trimmedQuery = query.trim().toLowerCase();

  const visible = useMemo(() => {
    return active.filter((item) => {
      if (deckFilter !== "all" && item.deck_id !== deckFilter) return false;
      if (!trimmedQuery) return true;
      return (
        item.question_text.toLowerCase().includes(trimmedQuery) ||
        item.correct_answer.toLowerCase().includes(trimmedQuery)
      );
    });
  }, [active, deckFilter, trimmedQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, DeckGroup>();
    for (const item of visible) {
      const existing = map.get(item.deck_id);
      if (existing) existing.items.push(item);
      else map.set(item.deck_id, { deckId: item.deck_id, deck: item.deck, course: item.course, items: [item] });
    }
    return Array.from(map.values());
  }, [visible]);

  function handleUnstar(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  if (active.length === 0) {
    return (
      <EmptyState
        title="No starred questions left"
        description="Star a question while studying and it will show up here."
        action={<ButtonLink href="/decks">Browse decks</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search starred questions…"
          aria-label="Search starred questions"
          className="sm:max-w-sm"
        />
        <Select
          value={deckFilter}
          onChange={(event) => setDeckFilter(event.target.value)}
          aria-label="Filter by deck"
          className="sm:max-w-xs"
        >
          <option value="all">All decks ({active.length})</option>
          {decks.map((deck) => (
            <option key={deck.deckId} value={deck.deckId}>
              {deck.label} ({deck.count})
            </option>
          ))}
        </Select>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or deck filter." />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const heading = deckLabel(group.course, group.deck);
            const ids = group.items.map((item) => item.id).join(",");
            return (
              <section key={group.deckId} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="min-w-0 truncate font-medium">
                    {heading} <span className="text-sm font-normal text-muted">({group.items.length})</span>
                  </h2>
                  <ButtonLink href={`/decks/${group.deckId}/learn?ids=${ids}`} variant="secondary" size="sm">
                    Practice these
                  </ButtonLink>
                </div>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <StarredRow key={item.id} item={item} onUnstar={handleUnstar} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StarredRow({ item, onUnstar }: { item: StarredItem; onUnstar: (id: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  // mastery_count can reach higher than 3 in raw storage; clamp for the label lookup.
  const level = Math.min(3, Math.max(0, item.mastery_count)) as MasteryLevel;
  const statusTone: "success" | "accent" | "muted" = level === 3 ? "success" : level === 0 ? "muted" : "accent";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm">{item.question_text}</p>
        <StarButton
          questionId={item.id}
          starred
          onChange={(starred) => {
            if (!starred) onUnstar(item.id);
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        className="flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline"
        aria-expanded={revealed}
      >
        {revealed ? "Hide answer" : "Show answer"}
      </button>
      {revealed ? <p className="text-sm text-success">{item.correct_answer}</p> : null}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {item.topic ? <Badge>{item.topic}</Badge> : null}
        <Badge tone={statusTone}>{MASTERY_LABELS[level]}</Badge>
        <Link
          href={`/decks/${item.deck_id}?q=${item.id}`}
          className="ml-auto flex min-h-11 items-center text-muted transition-colors duration-150 hover:text-ink"
        >
          Open in deck →
        </Link>
      </div>
    </Card>
  );
}
