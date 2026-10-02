"use server";

import { requireSession } from "@/lib/auth";
import type { EarnedBadge } from "@/lib/badges";
import { getPendingBadges as readPendingBadges } from "@/lib/data";
import { supabase } from "@/lib/supabase";

/** Badges the signed-in profile has earned but not yet been shown. */
export async function getPendingBadges(): Promise<EarnedBadge[]> {
  const session = await requireSession();
  return readPendingBadges(session.profileId);
}

/**
 * Mark celebrations as seen. Only touches the signed-in profile's own badges,
 * and acknowledging twice is harmless.
 */
export async function acknowledgeBadges(keys: string[]): Promise<void> {
  const session = await requireSession();
  if (keys.length === 0) return;

  const { error } = await supabase()
    .from("achievements")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("profile_id", session.profileId)
    .in("badge_key", keys)
    .is("acknowledged_at", null);
  if (error) throw new Error(error.message);
}
