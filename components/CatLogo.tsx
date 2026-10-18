import { HEAD, INNER_EARS, WHISKERS } from "@/components/Mascot";
import { cn } from "@/components/ui";

/**
 * The app logo: the Learn mascot with its calm, idle face, rimmed in the
 * accent colour. Static on purpose; a logo should not react or move.
 * app/icon.svg is the same drawing with fixed colours for the browser tab.
 */
export function CatLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-7 w-7 shrink-0 text-accent", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="stroke-ink opacity-60"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        d={WHISKERS}
      />
      <path
        className="fill-sunken stroke-current"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        d={HEAD}
      />
      <path className="fill-current opacity-40" d={INNER_EARS} />
      <g className="fill-ink">
        <ellipse cx="24" cy="33" rx="3" ry="3.6" />
        <ellipse cx="40" cy="33" rx="3" ry="3.6" />
        <path d="M29.6 40 H34.4 L32 42.8 Z" />
      </g>
      <path
        className="stroke-ink"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        d="M27.8 45 Q32 47.2 36.2 45"
      />
    </svg>
  );
}
