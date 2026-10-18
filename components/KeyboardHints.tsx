"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/components/ui";

const STORAGE_KEY = "memorizer-hide-key-hints";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Shown by default; the server cannot know if it was dismissed. */
const serverHidden = () => false;

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded border border-line-strong",
        "bg-sunken px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink",
      )}
    >
      {children}
    </kbd>
  );
}

export type KeyHint = { keys: string[]; label: string };

/** "a, b or c". */
function orList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/**
 * The hints as one short sentence for the inline line. The per-option hints
 * ("Answer A" … "Answer D") collapse into "1–4 or A–D to answer".
 */
function summarize(hints: KeyHint[]): string[] {
  const answers = hints.filter((h) => /^Answer /.test(h.label));
  const rest = hints.filter((h) => !/^Answer /.test(h.label));
  const parts: string[] = [];
  if (answers.length > 0) {
    const first = answers[0].keys;
    const last = answers.at(-1)!.keys;
    parts.push(
      answers.length === 1
        ? `${first[0]} or ${first[1]?.toUpperCase()} to answer`
        : `${first[0]}–${last[0]} or ${first[1]?.toUpperCase()}–${last[1]?.toUpperCase()} to answer`,
    );
  }
  for (const hint of rest) parts.push(`${orList(hint.keys)} for ${hint.label.toLowerCase()}`);
  return parts;
}

/*
 * Two presentations, so nothing ever covers the answers:
 * - Very wide screens (1600px and up) have empty space beside the max-w-5xl
 *   study column, so a small panel floats in the bottom-right corner there.
 * - Narrower screens get a single quiet line of text below the content, with no
 *   box, so the hint never competes with the question for attention.
 * Both are hidden below `sm`, where there is no keyboard. The `min-[1600px]:`
 * classes are written out in full because Tailwind only generates classes it
 * can find literally in the source.
 */
export function KeyboardHints({ hints, className }: { hints: KeyHint[]; className?: string }) {
  const hidden = useSyncExternalStore(subscribe, readHidden, serverHidden);

  function setHidden(next: boolean) {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing: the choice applies now but will not persist.
    }
    for (const listener of listeners) listener();
  }

  const quietButton = "rounded text-muted underline-offset-2 transition-colors hover:text-ink hover:underline";

  if (hidden) {
    return (
      <>
        <p className={cn("mt-4 hidden text-xs sm:block min-[1600px]:hidden", className)}>
          <button type="button" onClick={() => setHidden(false)} className={cn(quietButton, "min-h-6")}>
            Show keyboard shortcuts
          </button>
        </p>
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-label="Show keyboard shortcuts"
          className={cn(
            "fixed bottom-4 right-4 z-20 hidden h-9 w-9 items-center justify-center rounded-lg",
            "border border-line bg-surface text-xs text-muted transition-colors hover:text-ink",
            "min-[1600px]:flex",
            className,
          )}
        >
          <span aria-hidden>⌨</span>
        </button>
      </>
    );
  }

  return (
    <>
      <p className={cn("mt-4 hidden text-xs text-muted sm:block min-[1600px]:hidden", className)}>
        <span className="sr-only">Keyboard shortcuts: </span>
        {summarize(hints).join(" · ")}
        {" · "}
        <button type="button" onClick={() => setHidden(true)} className={quietButton}>
          Hide
        </button>
      </p>

      <aside
        aria-label="Keyboard shortcuts"
        className={cn(
          "fixed bottom-4 right-4 z-20 hidden max-w-[16rem] rounded-xl border border-line",
          "bg-surface/95 p-3 backdrop-blur-sm min-[1600px]:block",
          className,
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Keyboard
          </span>
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Hide keyboard shortcuts"
            className="text-xs text-muted transition-colors hover:text-ink"
          >
            Hide
          </button>
        </div>

        <dl className="space-y-1.5">
          {hints.map((hint) => (
            <div key={hint.label} className="flex items-center justify-between gap-3">
              <dt className="flex flex-wrap items-center gap-1">
                {hint.keys.map((key, i) => (
                  <span key={key} className="flex items-center gap-1">
                    {i > 0 ? <span className="text-[10px] text-muted">/</span> : null}
                    <Key>{key}</Key>
                  </span>
                ))}
              </dt>
              <dd className="text-xs text-muted">{hint.label}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </>
  );
}
