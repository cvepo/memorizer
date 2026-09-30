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

/**
 * A quiet legend of the keyboard shortcuts, parked out of the way in the
 * bottom-right corner. Hidden below `sm`, where there is no keyboard and the
 * bottom of the screen belongs to the action bar. Dismissible, because a
 * permanent overlay is a nag once you know the keys.
 */
export function KeyboardHints({ hints, className }: { hints: KeyHint[]; className?: string }) {
  const hidden = useSyncExternalStore(subscribe, readHidden, serverHidden);

  function setHidden(next: boolean) {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing — the choice applies now but will not persist.
    }
    for (const listener of listeners) listener();
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        aria-label="Show keyboard shortcuts"
        className={cn(
          "fixed bottom-4 right-4 z-20 hidden h-9 w-9 items-center justify-center rounded-lg",
          "border border-line bg-surface text-xs text-muted transition-colors",
          "hover:text-ink sm:flex",
          className,
        )}
      >
        <span aria-hidden>⌨</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Keyboard shortcuts"
      className={cn(
        "fixed bottom-4 right-4 z-20 hidden max-w-[16rem] rounded-xl border border-line",
        "bg-surface/95 p-3 backdrop-blur-sm sm:block",
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
  );
}
