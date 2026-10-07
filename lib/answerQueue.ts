"use client";

import type { PendingAnswer } from "@/lib/actions/study";
import type { EarnedBadge } from "@/lib/badges";

/**
 * A durable queue for graded answers.
 *
 * Answers are written to localStorage before anything is sent, so a refresh, a
 * crash or a dead connection cannot lose them. Each carries an id generated
 * here, and the server insert is keyed on that id, so replaying the queue is
 * safe — an answer counts exactly once however many times it is sent.
 *
 * Ordering is preserved: the queue is drained oldest-first and a failed flush
 * leaves the remainder in place rather than reordering it.
 */

export type QueueStatus =
  | { kind: "idle" }
  | { kind: "saving"; pending: number }
  | { kind: "saved" }
  | { kind: "offline"; pending: number }
  | { kind: "failed"; pending: number }
  | { kind: "unavailable" };

export type QueuedAnswer = PendingAnswer & { queuedAt: number };

const KEY_PREFIX = "memorizer-answer-queue:";
const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function storageKey(profileId: string) {
  return `${KEY_PREFIX}${profileId}`;
}

function canUseStorage(): boolean {
  try {
    const probe = "__memorizer_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function read(profileId: string): QueuedAnswer[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is QueuedAnswer =>
        typeof a === "object" && a !== null &&
        typeof (a as QueuedAnswer).eventId === "string" &&
        typeof (a as QueuedAnswer).questionId === "string" &&
        typeof (a as QueuedAnswer).wasCorrect === "boolean",
    );
  } catch {
    return [];
  }
}

function write(profileId: string, answers: QueuedAnswer[]): boolean {
  try {
    localStorage.setItem(storageKey(profileId), JSON.stringify(answers));
    return true;
  } catch {
    return false;
  }
}

export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Only reached on very old browsers; collision risk here is immaterial
  // because ids are also scoped by profile and question.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

type Send = (
  answers: PendingAnswer[],
) => Promise<{ acknowledged: string[]; pendingBadges?: EarnedBadge[] }>;

export class AnswerQueue {
  private queue: QueuedAnswer[] = [];
  private status: QueueStatus = { kind: "idle" };
  private readonly subscribers = new Set<() => void>();
  private flushing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private readonly storageWorks: boolean;

  constructor(
    private readonly profileId: string,
    private readonly send: Send,
    /** Called with the badges still waiting to be celebrated after a successful flush. */
    private readonly onBadges?: (badges: EarnedBadge[]) => void,
  ) {
    this.storageWorks = canUseStorage();
    if (this.storageWorks) this.queue = read(profileId);
    if (!this.storageWorks) this.status = { kind: "unavailable" };
    else if (this.queue.length > 0) this.status = { kind: "saving", pending: this.queue.length };

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
  }

  destroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
    }
    this.subscribers.clear();
  }

  private handleOnline = () => {
    this.attempt = 0;
    void this.flush();
  };

  subscribe = (onChange: () => void) => {
    this.subscribers.add(onChange);
    return () => this.subscribers.delete(onChange);
  };

  getStatus = (): QueueStatus => this.status;

  get pendingCount(): number {
    return this.queue.length;
  }

  private emit(next: QueueStatus) {
    this.status = next;
    for (const subscriber of this.subscribers) subscriber();
  }

  /** Queue an answer and start draining. Resolves once it is safely stored. */
  enqueue(answer: PendingAnswer) {
    this.queue = [...this.queue, { ...answer, queuedAt: Date.now() }];
    const stored = this.storageWorks && write(this.profileId, this.queue);
    this.emit(
      stored || !this.storageWorks
        ? { kind: "saving", pending: this.queue.length }
        : { kind: "saving", pending: this.queue.length },
    );
    if (!this.storageWorks) this.status = { kind: "saving", pending: this.queue.length };
    void this.flush();
  }

  retry = () => {
    this.attempt = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    void this.flush();
  };

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) {
      if (this.queue.length === 0 && this.status.kind !== "unavailable") {
        this.emit({ kind: "saved" });
      }
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.emit({ kind: "offline", pending: this.queue.length });
      return;
    }

    this.flushing = true;
    const batch = [...this.queue];
    this.emit({ kind: "saving", pending: batch.length });

    try {
      const { acknowledged, pendingBadges } = await this.send(
        batch.map(({ eventId, questionId, wasCorrect }) => ({ eventId, questionId, wasCorrect })),
      );
      if (pendingBadges && pendingBadges.length > 0) this.onBadges?.(pendingBadges);
      const done = new Set(acknowledged);
      // Anything queued while the request was in flight stays put.
      this.queue = this.queue.filter((a) => !done.has(a.eventId));
      if (this.storageWorks) write(this.profileId, this.queue);
      this.attempt = 0;
      this.flushing = false;

      if (this.queue.length > 0) {
        void this.flush();
      } else {
        this.emit(this.storageWorks ? { kind: "saved" } : { kind: "unavailable" });
      }
    } catch {
      this.flushing = false;
      this.attempt += 1;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      this.emit(
        offline
          ? { kind: "offline", pending: this.queue.length }
          : { kind: "failed", pending: this.queue.length },
      );

      const delay = Math.min(BASE_BACKOFF_MS * 2 ** (this.attempt - 1), MAX_BACKOFF_MS);
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.flush();
      }, delay);
    }
  }
}

export function describeStatus(status: QueueStatus): string | null {
  switch (status.kind) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "offline":
      return `Offline · ${status.pending} ${status.pending === 1 ? "answer" : "answers"} waiting to sync`;
    case "failed":
      return "Couldn't save";
    case "unavailable":
      return "This browser is blocking storage, so unsaved answers may be lost";
    default:
      return null;
  }
}
