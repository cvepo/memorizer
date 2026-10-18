"use client";

import { useId, useSyncExternalStore } from "react";

import { cn } from "@/components/ui";
import {
  setAnimationsDisabled,
  subscribeMotion,
  systemReducesMotion,
  userDisabledAnimations,
} from "@/lib/motion";

type MotionState = "on" | "off" | "device-off";

function read(): MotionState {
  if (systemReducesMotion()) return "device-off";
  return userDisabledAnimations() ? "off" : "on";
}

/** The server cannot know the saved choice; the head script applies it before paint. */
const serverState = (): MotionState => "on";

const REASON = "Off because your device has Reduce Motion enabled.";

/**
 * A switch that turns every animation in the app off. It reads On only while
 * animations are actually running. When the device's Reduce Motion is enabled
 * it reads Off and cannot be changed, and says why in text rather than only in
 * a tooltip; the saved choice underneath is untouched and returns when the
 * device setting is switched back.
 *
 * The locked switch uses `aria-disabled` rather than `disabled` so keyboard
 * users can still focus it and hear the reason.
 */
export function MotionToggle({
  variant = "nav",
  className,
}: {
  /** "nav" is compact with the reason in a popover; "menu" is full width with the reason inline. */
  variant?: "nav" | "menu";
  className?: string;
}) {
  const state = useSyncExternalStore(subscribeMotion, read, serverState);
  const reasonId = useId();
  const on = state === "on";
  const locked = state === "device-off";
  const inMenu = variant === "menu";

  return (
    <div className={cn("group relative", inMenu && "w-full", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={locked}
        aria-describedby={locked ? reasonId : undefined}
        onClick={() => {
          if (!locked) setAnimationsDisabled(on);
        }}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm lg:min-h-9",
          inMenu && "w-full justify-between",
          locked && "cursor-not-allowed opacity-70",
        )}
      >
        <span>Animations</span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "relative inline-block h-5 w-9 rounded-full border border-line-strong",
              on ? "bg-accent" : "bg-sunken",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-3.5 w-3.5 rounded-full",
                on ? "left-[18px] bg-accent-fg" : "left-0.5 bg-muted",
              )}
            />
          </span>
          <span className="w-6 text-xs text-muted">{on ? "On" : "Off"}</span>
        </span>
      </button>

      {locked ? (
        <p
          id={reasonId}
          className={cn(
            "text-xs text-muted",
            inMenu
              ? "mt-2"
              : "absolute right-0 top-full z-30 mt-1 hidden w-60 rounded-lg border border-line bg-surface p-2 shadow-lg group-focus-within:block group-hover:block",
          )}
        >
          {REASON}
        </p>
      ) : null}
    </div>
  );
}
