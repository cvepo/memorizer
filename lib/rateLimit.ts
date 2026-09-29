import "server-only";

import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Small fixed-window limiter for the sign-in form.
 *
 * State lives in the process, so on Vercel it is per function instance rather
 * than global: someone determined could get more attempts than the limit by
 * landing on different instances. It is not a substitute for a strong password.
 * What it does buy is making a fast online guessing run against one instance
 * impractical, which together with bcrypt at cost 12 (~100ms per attempt) is
 * proportionate for a site behind a shared password. Move this to Redis or
 * Postgres if the app ever gets real accounts.
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) sweep(now);
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true };
}

/** Forget a client's failures once they prove they know the password. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * Caller IP. On Vercel `x-forwarded-for` is set by the platform and the
 * left-most entry is the real client. Locally it is usually absent.
 */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}
