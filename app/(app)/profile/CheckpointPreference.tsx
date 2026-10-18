"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import { Slider } from "@/components/Slider";
import { Card } from "@/components/ui";
import { saveCheckpointSetting } from "@/lib/actions/settings";
import { JITTER_MAX, normalizeCheckpoint, type CheckpointSetting } from "@/lib/learnAlgorithm";

/**
 * checkpointMaxFor switches to the wider maximum once a deck passes 100
 * questions. Infinity is past that cutoff, so moving a preference onto the
 * profile does not clip a large-deck length down to the small-deck maximum.
 */
const PREFERENCE_DECK_SIZE = Number.POSITIVE_INFINITY;

/** Length key from before this setting lived on the profile. It has no profile id. */
const LEGACY_LENGTH_KEY = "memorizer-checkpoint-range";

function legacyJitterKey(profileId: string) {
  return `memorizer-checkpoint-jitter:${profileId}`;
}

function parseStoredJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The previous slider stored { min, max } and not a length. */
function isLegacyRange(value: unknown): boolean {
  if (!isRecord(value) || !("min" in value) || !("max" in value) || "length" in value) return false;
  const min = nonNegativeNumber(value.min);
  const max = nonNegativeNumber(value.max);
  return min !== null && max !== null && max >= min;
}

function forgetLegacyCheckpoint(profileId: string) {
  try {
    localStorage.removeItem(LEGACY_LENGTH_KEY);
    localStorage.removeItem(legacyJitterKey(profileId));
  } catch {
    // Private mode. After a successful save the profile already has the value.
  }
}

/**
 * One-time read of a checkpoint saved in this browser before it lived on the
 * profile. Null means nothing usable was stored, so the profile row is left
 * as it is. A partial { length } handed to normalizeCheckpoint on its own is
 * treated as invalid, so both fields are filled before that call.
 *
 * Keep this in step with LearnSession.
 */
function readLegacyCheckpoint(profileId: string, fallback: CheckpointSetting): CheckpointSetting | null {
  let rawLength: string | null;
  let rawJitter: string | null;
  try {
    rawLength = localStorage.getItem(LEGACY_LENGTH_KEY);
    rawJitter = localStorage.getItem(legacyJitterKey(profileId));
  } catch {
    return null;
  }
  if (rawLength === null && rawJitter === null) return null;

  const storedLength = parseStoredJson(rawLength);
  const storedJitter = nonNegativeNumber(parseStoredJson(rawJitter));
  const legacy = isLegacyRange(storedLength);
  const migrated = legacy ? normalizeCheckpoint(storedLength, PREFERENCE_DECK_SIZE) : null;
  const explicitLength = !legacy && isRecord(storedLength) ? nonNegativeNumber(storedLength.length) : null;

  if (migrated === null && explicitLength === null && storedJitter === null) {
    // Present, but nothing we can adopt. Drop the keys so this does not retry every visit.
    forgetLegacyCheckpoint(profileId);
    return null;
  }

  return normalizeCheckpoint(
    {
      length: migrated?.length ?? explicitLength ?? fallback.length,
      // A non-finite jitter must not be passed through: normalizeCheckpoint
      // rejects the whole setting, which would throw away a valid length.
      jitter: storedJitter ?? migrated?.jitter ?? fallback.jitter,
    },
    PREFERENCE_DECK_SIZE,
  );
}

export function CheckpointPreference({
  profileId,
  checkpointSetting,
}: {
  /** Finds a jitter value saved before this setting lived on the profile. */
  profileId: string;
  checkpointSetting: CheckpointSetting;
}) {
  const [setting, setSetting] = useState(checkpointSetting);
  const migratedProfile = useRef<string | null>(null);
  // The slider is on screen immediately, so a change can land before the
  // carry-over effect. Remember it instead of writing the old jitter back.
  const edited = useRef(false);
  const jitterChosen = useRef(checkpointSetting.jitter);

  useEffect(() => {
    if (migratedProfile.current === profileId) return;
    migratedProfile.current = profileId;

    let carried: CheckpointSetting | null = null;
    try {
      carried = readLegacyCheckpoint(profileId, checkpointSetting);
    } catch {
      // localStorage throws in private mode. The profile value stays.
      return;
    }
    if (!carried) return;

    const adopted = edited.current
      ? normalizeCheckpoint(
          { length: carried.length, jitter: jitterChosen.current },
          PREFERENCE_DECK_SIZE,
        )
      : carried;

    // localStorage during render would disagree with the server HTML.
    setSetting(adopted);
    startTransition(async () => {
      try {
        await saveCheckpointSetting(adopted);
        forgetLegacyCheckpoint(profileId);
      } catch {
        // Leave the keys so the next visit can try again.
      }
    });
  }, [profileId, checkpointSetting]);

  const update = (next: number) => {
    const saved = normalizeCheckpoint({ length: setting.length, jitter: next }, PREFERENCE_DECK_SIZE);
    edited.current = true;
    jitterChosen.current = saved.jitter;
    // The slider reads this state. The action only persists it.
    setSetting(saved);
    startTransition(async () => {
      try {
        await saveCheckpointSetting(saved);
        forgetLegacyCheckpoint(profileId);
      } catch {
        // The slider already shows the choice. A failed write leaves it for this session.
      }
    });
  };

  return (
    <Card className="max-w-md">
      <Slider
        label="Vary checkpoint length"
        hint="Checkpoints land within plus or minus this many questions, so sessions do not feel identical. 0 keeps every checkpoint the same."
        min={0}
        max={JITTER_MAX}
        value={setting.jitter}
        onChange={update}
      />
    </Card>
  );
}
