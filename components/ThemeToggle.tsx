"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/components/ui";

export type Theme = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "memorizer-theme";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** The server cannot know the stored choice, so it renders "system"; the inline
 *  script in the document head paints the right palette before hydration. */
const serverTheme = (): Theme => "system";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "System", icon: "◐" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  function choose(next: Theme) {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing: the choice applies now but will not persist.
    }
    applyTheme(next);
    for (const listener of listeners) listener();
  }

  return (
    <div
      className={cn("inline-flex rounded-xl border border-line bg-surface p-0.5", className)}
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
            "flex h-9 w-9 items-center justify-center rounded-[10px] text-sm transition-colors",
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
