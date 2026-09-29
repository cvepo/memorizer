"use client";

import { cn } from "@/components/ui";
import { describeStatus, type QueueStatus } from "@/lib/answerQueue";

/**
 * Tells the student whether their answers are safely stored. Quiet when
 * everything is saved; insistent, with a way out, when it is not.
 */
export function SaveStatus({
  status,
  onRetry,
  className,
}: {
  status: QueueStatus;
  onRetry: () => void;
  className?: string;
}) {
  const label = describeStatus(status);
  if (!label || status.kind === "idle") return null;

  const needsAction = status.kind === "failed" || status.kind === "unavailable";

  return (
    <p
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 text-xs",
        needsAction ? "text-danger" : status.kind === "offline" ? "text-ink" : "text-muted",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          status.kind === "saved" && "bg-success",
          status.kind === "saving" && "bg-muted",
          status.kind === "offline" && "bg-star",
          needsAction && "bg-danger",
        )}
      />
      {label}
      {status.kind === "failed" ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 underline underline-offset-2 hover:no-underline"
        >
          Retry
        </button>
      ) : null}
    </p>
  );
}
