import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { env } from "@/lib/env";

export const SESSION_COOKIE = "memorizer_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type Role = "member" | "admin";

export type Session = {
  /** "member" can study; "admin" can also create, edit, import and delete. */
  role: Role;
  /** profiles.id — which progress bucket this browser writes to. */
  profileId: string;
  profileName: string;
};

type SessionClaims = {
  role: Role;
  pid: string;
  pname: string;
};

function secret() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({
    role: session.role,
    pid: session.profileId,
    pname: session.profileName,
  } satisfies SessionClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, secret());
    if (!payload.pid || !payload.pname) return null;
    return {
      role: payload.role === "admin" ? "admin" : "member",
      profileId: payload.pid,
      profileName: payload.pname,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Every page under (app) is already gated by proxy.ts, but server actions are
 * separate entry points and must check for themselves.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in.");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") {
    throw new Error("Admin password required to change study material.");
  }
  return session;
}

export async function setSessionCookie(session: Session) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
