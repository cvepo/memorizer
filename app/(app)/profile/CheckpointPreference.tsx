"use client";

import { useEffect, useState } from "react";

import { Slider } from "@/components/Slider";
import { Card } from "@/components/ui";
import {
  DEFAULT_CHECKPOINT,
  JITTER_MAX,
  normalizeCheckpoint,
  type CheckpointSetting,
} from "@/lib/learnAlgorithm";

/** Same key Learn has always used for the checkpoint length. */
const LENGTH_STORAGE_KEY = "memorizer-checkpoint-range";

/**
 * Per person, not per deck. LearnSession reads this same key: varying the
 * checkpoint is a preference about how you study, so it follows the profile
 * the way flashcard position follows a person — without a deck id.
 */
function jitterStorageKey(profileId: string) {
  return `memorizer-checkpoint-jitter:${profileId}`;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The previous slider stored { min, max } on the length key. */
function isLegacyRange(value: unknown): boolean {
  return isRecord(value) && "min" in value && "max" in value && !("length" in value);
}

function writeStoredJitter(profileId: string, jitter: number) {
  try {
    localStorage.setItem(jitterStorageKey(profileId), JSON.stringify(jitter));
  } catch {
    // Private mode: the choice applies now but will not persist.
  }
}

/**
 * Length stays on the original key so a saved { min, max } is migrated
 * rather than dropped. A jitter this profile has saved replaces the spread
 * that migration would invent. Deck size does not change the jitter clamp;
 * callers that only need jitter can pass 0.
 *
 * Keep this in step with LearnSession. A partial { length } handed to
 * normalizeCheckpoint on its own is treated as invalid, so both fields are
 * filled in first.
 */
function readStoredCheckpoint(profileId: string, deckSize: number): CheckpointSetting {
  const storedLength = readJson(LENGTH_STORAGE_KEY);
  const storedJitter = readJson(jitterStorageKey(profileId));
  const legacy = isLegacyRange(storedLength);

  if (legacy && typeof storedJitter !== "number") {
    return normalizeCheckpoint(storedLength, deckSize);
  }

  const migrated = legacy ? normalizeCheckpoint(storedLength, deckSize) : null;
  const length =
    migrated?.length ??
    (isRecord(storedLength) &&
    typeof storedLength.length === "number" &&
    Number.isFinite(storedLength.length)
      ? storedLength.length
      : DEFAULT_CHECKPOINT.length);
  // A non-finite jitter must not be passed through: normalizeCheckpoint
  // rejects the whole setting, which would throw away a valid length.
  const jitter =
    typeof storedJitter === "number" && Number.isFinite(storedJitter)
      ? storedJitter
      : (migrated?.jitter ?? DEFAULT_CHECKPOINT.jitter);

  return normalizeCheckpoint({ length, jitter }, deckSize);
}

export function CheckpointPreference({ profileId }: { profileId: string }) {
  const [jitter, setJitter] = useState(DEFAULT_CHECKPOINT.jitter);

  // localStorage during render would disagree with the server HTML.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJitter(readStoredCheckpoint(profileId, 0).jitter);
  }, [profileId]);

  const update = (next: number) => {
    const saved = normalizeCheckpoint({ length: DEFAULT_CHECKPOINT.length, jitter: next }, 0);
    setJitter(saved.jitter);
    writeStoredJitter(profileId, saved.jitter);
  };

  return (
    <Card className="max-w-md">
      <Slider
        label="Vary checkpoint length"
        hint="Checkpoints land within plus or minus this many questions, so sessions do not feel identical. 0 keeps every checkpoint the same."
        min={0}
        max={JITTER_MAX}
        value={jitter}
        onChange={update}
      />
    </Card>
  );
}
