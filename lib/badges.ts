/**
 * The badge tiers, and how they look. Safe to import from client components.
 *
 * Badges are earned at a number of correct answers. The thresholds are also
 * written into the award_badges SQL function, so changing a tier means
 * changing both places.
 */

export type BadgeTone = "bronze" | "silver" | "gold";

export type BadgeTier = {
  /** Stored in achievements.badge_key. */
  key: string;
  /** Correct answers needed. */
  threshold: number;
  name: string;
  tone: BadgeTone;
};

/** One place to swap in real artwork later. */
export const BADGE_EMOJI = "⭐";

export const BADGE_TIERS: readonly BadgeTier[] = [
  { key: "correct_50", threshold: 50, name: "Warm-up", tone: "bronze" },
  { key: "correct_100", threshold: 100, name: "On a Roll", tone: "bronze" },
  { key: "correct_200", threshold: 200, name: "Getting Serious", tone: "silver" },
  { key: "correct_500", threshold: 500, name: "Sharp Mind", tone: "silver" },
  { key: "correct_1000", threshold: 1000, name: "Scholar", tone: "gold" },
  { key: "correct_2500", threshold: 2500, name: "Memory Master", tone: "gold" },
];

const BY_KEY = new Map(BADGE_TIERS.map((tier) => [tier.key, tier]));

export function tierForKey(key: string): BadgeTier | undefined {
  return BY_KEY.get(key);
}

/** The first tier the total has not reached, or null once every badge is earned. */
export function nextTier(total: number): BadgeTier | null {
  return BADGE_TIERS.find((tier) => total < tier.threshold) ?? null;
}

/** The tier before `next`, so progress can be shown within the current step. */
export function previousThreshold(next: BadgeTier | null): number {
  if (!next) return 0;
  const index = BADGE_TIERS.indexOf(next);
  return index > 0 ? BADGE_TIERS[index - 1].threshold : 0;
}

/** A badge row as it travels from the server to the UI. */
export type EarnedBadge = {
  key: string;
  /** ISO date, shown only when the badge was not backfilled. */
  earnedAt: string;
  backfilled: boolean;
  acknowledged: boolean;
};

/** Ring colour per tone. The star emoji keeps its own colour, so the tier shows in the ring. */
export const TONE_RING: Record<BadgeTone, string> = {
  bronze: "border-bronze",
  silver: "border-silver",
  gold: "border-star",
};
