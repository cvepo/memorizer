"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/components/ui";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "biomi-theme";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keep other tabs in step.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Private browsing: fall back to following the system.
    return "system";
  }
}

/** The server cannot know the stored choice, so it renders "system" and the
 * inline script in the document head paints the right palette before React
 * hydrates. */
const serverTheme = (): Theme => "system";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "System", icon: "◐" },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  function choose(next: Theme) {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this page view, it just will not persist.
    }
    apply(next);
    for (const listener of listeners) listener();
  }

  return (
    <div
      className="inline-flex rounded-xl border border-line bg-surface p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          title={option.label}
          onClick={() => choose(option.value)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[10px] text-sm transition-colors",
            theme === option.value ? "bg-accent text-accent-fg" : "text-muted hover:text-ink",
          )}
        >
          <span aria-hidden>{option.icon}</span>
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
