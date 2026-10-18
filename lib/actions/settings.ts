"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { normalizeCheckpoint, type CheckpointSetting } from "@/lib/learnAlgorithm";
import { supabase } from "@/lib/supabase";

export async function saveCheckpointSetting(setting: CheckpointSetting): Promise<void> {
  const session = await requireSession();
  const normalized = normalizeCheckpoint(setting, Number.MAX_SAFE_INTEGER);
  const { error } = await supabase()
    .from("profile_settings")
    .upsert({
      profile_id: session.profileId,
      checkpoint_length: normalized.length,
      checkpoint_jitter: normalized.jitter,
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id" });
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}
