import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover border-transparent",
  secondary: "bg-surface text-ink hover:bg-sunken border-line-strong",
  ghost: "bg-transparent text-ink hover:bg-surface border-transparent",
  danger: "bg-danger text-danger-fg hover:opacity-90 border-transparent",
  success: "bg-success text-success-fg hover:opacity-90 border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg min-h-8",
  md: "px-4 py-2.5 text-sm rounded-xl min-h-11",
  lg: "px-6 py-3 text-base rounded-xl min-h-12",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 border font-medium transition-colors duration-150",
    "disabled:opacity-50 disabled:pointer-events-none select-none",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** Default padding is dropped when the caller passes its own `p-*`, since
 * there is no tailwind-merge to settle the conflict. */
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  const overridesPadding = /(?:^|\s)p-(?:\d|\[)/.test(className);
  return (
    <div
      {...props}
      className={cn("rounded-2xl border border-line bg-surface", !overridesPadding && "p-5", className)}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const FIELD =
  "w-full rounded-xl border border-line-strong bg-sunken px-3 py-2.5 text-sm text-ink " +
  "placeholder:text-muted transition-colors";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cn(FIELD, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(FIELD, "min-h-24 resize-y", className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(FIELD, "appearance-none pr-8", className)} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Progress and status
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  total,
  tone = "success",
  className,
}: {
  value: number;
  total: number;
  tone?: "success" | "accent";
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-sunken", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", tone === "success" ? "bg-success" : "bg-accent")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "success" | "accent" | "muted" }) {
  return (
    <div>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "accent" && "text-accent",
          tone === "muted" && "text-muted",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export function MasteryBreakdown({
  mastered,
  learning,
  unseen,
}: {
  mastered: number;
  learning: number;
  unseen: number;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <span className="text-success">{mastered} mastered</span>
      <span className="text-accent">{learning} learning</span>
      <span className="text-muted">{unseen} unseen</span>
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "success" | "accent" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tone === "muted" && "border-line text-muted",
        tone === "success" && "tint-success text-success",
        tone === "accent" && "tint-accent text-ink",
        tone === "danger" && "tint-danger text-danger",
      )}
    >
      {children}
    </span>
  );
}
