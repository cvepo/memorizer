"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";
import { animationsDisabled, subscribeMotion } from "@/lib/motion";

/* ---------------------------------------------------------------------------
   A small black cat that reacts to what just happened in the study flow.

   Drawn as inline SVG so it costs no request and stays crisp at 32px. The body
   is filled with the darkest surface token and rimmed with `currentColor`, so
   the silhouette stays readable on the dark UI and the rim doubles as the
   state's colour (green for correct, red for wrong, blurple for milestones).

   Motion runs through the Web Animations API rather than CSS keyframes because
   it replays on demand (see `replayKey`). CSS cannot reach it, so the global
   "no animations" rule in globals.css does not apply here: whether animations
   are disabled, by the device or by the app's own switch, is checked in JS
   (lib/motion.ts), and a running animation is cancelled if that changes.
--------------------------------------------------------------------------- */

export type MascotState =
  | "idle"
  | "correct"
  | "wrong"
  | "celebrate"
  | "checkpoint"
  | "complete";

type MascotSize = "sm" | "md" | "lg";

// 32px / 48px / 96px, square.
const SIZES: Record<MascotSize, string> = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-24 w-24",
};

// The rim colour, which is the only colour that changes between states.
const TONES: Record<MascotState, string> = {
  idle: "text-muted",
  correct: "text-success",
  wrong: "text-danger",
  celebrate: "text-success",
  checkpoint: "text-accent",
  complete: "text-accent",
};

// Short text equivalents for screen readers. Generic on purpose: the component
// takes no copy props, so nothing here can go stale against the caller.
const LABELS: Record<MascotState, string> = {
  idle: "Ready",
  correct: "Correct",
  wrong: "Not quite",
  celebrate: "On a streak",
  checkpoint: "Checkpoint reached",
  complete: "Deck mastered",
};

type Motion = { frames: Keyframe[]; options: KeyframeAnimationOptions };

// Every animation is under 700ms and purely transform-based, so it never
// blocks input and never reflows the layout around the mascot.
const MOTIONS: Record<MascotState, Motion | null> = {
  idle: null,
  correct: {
    frames: [
      { transform: "translateY(0)", offset: 0 },
      { transform: "translateY(-16%)", offset: 0.35 },
      { transform: "translateY(0)", offset: 0.6 },
      { transform: "translateY(-6%)", offset: 0.8 },
      { transform: "translateY(0)", offset: 1 },
    ],
    options: { duration: 420, easing: "ease-out" },
  },
  wrong: {
    frames: [
      { transform: "translateX(0) rotate(0deg)", offset: 0 },
      { transform: "translateX(-6%) rotate(-4deg)", offset: 0.2 },
      { transform: "translateX(5%) rotate(3deg)", offset: 0.45 },
      { transform: "translateX(-3%) rotate(-2deg)", offset: 0.7 },
      { transform: "translateX(0) translateY(3%) rotate(0deg)", offset: 1 },
    ],
    options: { duration: 400, easing: "ease-in-out" },
  },
  celebrate: {
    frames: [
      { transform: "translateY(0) rotate(0deg) scale(1)", offset: 0 },
      { transform: "translateY(-18%) rotate(-7deg) scale(1.06)", offset: 0.25 },
      { transform: "translateY(0) rotate(6deg) scale(1)", offset: 0.5 },
      { transform: "translateY(-10%) rotate(-4deg) scale(1.03)", offset: 0.72 },
      { transform: "translateY(0) rotate(0deg) scale(1)", offset: 1 },
    ],
    options: { duration: 600, easing: "ease-in-out" },
  },
  checkpoint: {
    frames: [
      { transform: "scale(1)", offset: 0 },
      { transform: "scale(1.1)", offset: 0.45 },
      { transform: "scale(1)", offset: 1 },
    ],
    options: { duration: 500, easing: "ease-in-out" },
  },
  complete: {
    frames: [
      { transform: "translateY(0) rotate(0deg) scale(1)", offset: 0 },
      { transform: "translateY(-22%) rotate(-9deg) scale(1.08)", offset: 0.22 },
      { transform: "translateY(0) rotate(8deg) scale(1)", offset: 0.46 },
      { transform: "translateY(-14%) rotate(-6deg) scale(1.05)", offset: 0.68 },
      { transform: "translateY(0) rotate(3deg) scale(1)", offset: 0.86 },
      { transform: "translateY(0) rotate(0deg) scale(1)", offset: 1 },
    ],
    options: { duration: 700, easing: "ease-in-out" },
  },
};

/** A four-point sparkle centred on (cx, cy). */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.28;
  return [
    `M${cx} ${cy - r}`,
    `C${cx} ${cy - k} ${cx + k} ${cy} ${cx + r} ${cy}`,
    `C${cx + k} ${cy} ${cx} ${cy + k} ${cx} ${cy + r}`,
    `C${cx} ${cy + k} ${cx - k} ${cy} ${cx - r} ${cy}`,
    `C${cx - k} ${cy} ${cx} ${cy - k} ${cx} ${cy - r}`,
    "Z",
  ].join(" ");
}

// Head plus ears as a single silhouette, so one stroke rims the whole shape.
const HEAD =
  "M12.5 7.5 L27 17 C30 16 34 16 37 17 L51.5 7.5 L53 27 " +
  "C54.5 30 55 33.5 55 37 C55 48 45 55 32 55 " +
  "C19 55 9 48 9 37 C9 33.5 9.5 30 10.5 27 Z";

const INNER_EARS = "M15.5 13 L25 18.5 L14 24 Z M48.5 13 L39 18.5 L50 24 Z";

const WHISKERS =
  "M20 39.5 L6.5 36.5 M19.5 42.8 L5.5 42.4 M20 46 L7 49 " +
  "M44 39.5 L57.5 36.5 M44.5 42.8 L58.5 42.4 M44 46 L57 49";

/** Eyes and mouth for a state. Kept in one place so expressions stay in sync. */
function Face({ state }: { state: MascotState }) {
  const open = state === "celebrate" || state === "complete";

  return (
    <g>
      {/* Eyes */}
      {state === "idle" ? (
        <g className="fill-ink">
          <ellipse cx="24" cy="33" rx="3" ry="3.6" />
          <ellipse cx="40" cy="33" rx="3" ry="3.6" />
        </g>
      ) : (
        <path
          className="stroke-ink"
          fill="none"
          strokeWidth={state === "checkpoint" ? 2.2 : 2.6}
          strokeLinecap="round"
          d={
            state === "wrong"
              ? // Lowered, downturned: quiet rather than distressed.
                "M20.6 31 Q24 35.6 27.4 31 M36.6 31 Q40 35.6 43.4 31"
              : state === "checkpoint"
                ? // Contentedly closed.
                  "M20.8 33.6 Q24 30.9 27.2 33.6 M36.8 33.6 Q40 30.9 43.2 33.6"
                : open
                  ? // Big and delighted.
                    "M19.8 35.4 Q24 28.4 28.2 35.4 M35.8 35.4 Q40 28.4 44.2 35.4"
                  : // Happy.
                    "M20.6 34.6 Q24 29.4 27.4 34.6 M36.6 34.6 Q40 29.4 43.4 34.6"
          }
        />
      )}

      {/* Nose */}
      <path className="fill-ink" d="M29.6 40 H34.4 L32 42.8 Z" />

      {/* Mouth */}
      {open ? (
        <path
          className="fill-ink"
          d="M26.8 44.6 H37.2 Q35.4 51.8 32 51.8 Q28.6 51.8 26.8 44.6 Z"
        />
      ) : (
        <path
          className="stroke-ink"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          d={
            state === "wrong"
              ? "M27.6 47.8 Q32 44.2 36.4 47.8"
              : state === "correct"
                ? "M27 44.8 Q32 49.6 37 44.8"
                : state === "checkpoint"
                  ? "M27.4 45 Q32 48.8 36.6 45"
                  : "M27.8 45 Q32 47.2 36.2 45"
          }
        />
      )}

      {/* The finale gets a little extra. */}
      {state === "complete" && (
        <g className="fill-current">
          <path d={sparkle(7, 18, 4.5)} />
          <path d={sparkle(57.5, 13.5, 3.5)} />
        </g>
      )}
    </g>
  );
}

export function Mascot({
  state,
  size = "md",
  className,
  replayKey,
}: {
  state: MascotState;
  size?: MascotSize;
  className?: string;
  /** Change this to replay the animation for an unchanged `state`. */
  replayKey?: string | number;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    // Read so that a caller changing only `replayKey` re-runs the effect and
    // the same state animates again.
    void replayKey;

    const node = rootRef.current;
    const motion = MOTIONS[state];
    if (!node || !motion) return;
    if (typeof node.animate !== "function") return;

    let animation: Animation | null = animationsDisabled()
      ? null
      : node.animate(motion.frames, motion.options);

    // If animations are switched off while this one is running, stop it at once;
    // cancelling drops the animated styles and leaves the mascot at rest.
    const unsubscribe = subscribeMotion(() => {
      if (animationsDisabled() && animation) {
        animation.cancel();
        animation = null;
      }
    });

    return () => {
      unsubscribe();
      animation?.cancel();
    };
  }, [state, replayKey]);

  return (
    <span
      ref={rootRef}
      className={cn(
        "inline-block shrink-0 will-change-transform",
        SIZES[size],
        TONES[state],
        className,
      )}
    >
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        {/* Whiskers sit behind the head so they read as coming out from under it. */}
        <path
          className="stroke-ink opacity-60"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
          d={WHISKERS}
        />
        <path
          className="fill-sunken stroke-current"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          d={HEAD}
        />
        <path className="fill-current opacity-30" d={INNER_EARS} />
        <Face state={state} />
      </svg>
      <span className="sr-only">{LABELS[state]}</span>
    </span>
  );
}

export default Mascot;
