"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

import { clearSessionCookie, getSession, setSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";
import { findOrCreateProfile } from "@/lib/data";
import { clientKey, rateLimit, resetRateLimit } from "@/lib/rateLimit";

export type FormState = { error: string | null };

/**
 * Two ways in:
 *   study — the shared password everyone has. Read-only for course material.
 *   admin — an email and password. Also allowed to import, edit and delete.
 * Both pick a profile name so mastery is tracked per person.
 */
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const mode = formData.get("mode") === "admin" ? "admin" : "study";
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  let name = String(formData.get("profile") ?? "").trim();

  if (!password) return { error: "Enter your password." };

  // Throttle guessing before doing any comparison work.
  const key = await clientKey();
  const allowed = rateLimit(`login:${key}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!allowed.ok) {
    const minutes = Math.max(1, Math.ceil(allowed.retryAfterSeconds / 60));
    return { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  let role: "member" | "admin";

  if (mode === "admin") {
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!email) return { error: "Enter your email." };

    // Both checks always run, and one shared message is returned, so a wrong
    // email cannot be told apart from a wrong password.
    const emailMatches = email === env.adminEmail.trim().toLowerCase();
    const passwordMatches = await bcrypt.compare(password, env.adminPasswordHash);
    if (!emailMatches || !passwordMatches) {
      return { error: "That email and password do not match." };
    }

    if (!name) name = email.split("@")[0];
    role = "admin";
  } else {
    const passwordMatches = await bcrypt.compare(password, env.sitePasswordHash);
    if (!passwordMatches) return { error: "That password is not right." };
    if (!name) return { error: "Enter a name so your progress can be saved." };
    role = "member";
  }

  if (name.length > 40) return { error: "That name is too long." };

  let profileId: string;
  let profileName: string;
  try {
    const profile = await findOrCreateProfile(name);
    profileId = profile.id;
    profileName = profile.name;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create that profile." };
  }

  resetRateLimit(`login:${key}`);
  await setSessionCookie({ role, profileId, profileName });
  redirect(next.startsWith("/") ? next : "/");
}

export async function signOut() {
  await clearSessionCookie();
  redirect("/login");
}

/** Switch which profile's progress this browser writes to, keeping the role. */
export async function switchProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = String(formData.get("profile") ?? "").trim();
  if (!name) return { error: "Enter a name." };

  try {
    const profile = await findOrCreateProfile(name);
    await setSessionCookie({ ...session, profileId: profile.id, profileName: profile.name });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not switch profile." };
  }
  redirect("/");
}
