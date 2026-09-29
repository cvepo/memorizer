import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  needsRenewal,
  readSession,
  signSession,
} from "@/lib/auth";

/**
 * Gate the whole application behind the shared password. Only /login and the
 * static asset routes excluded by `config.matcher` are reachable signed out.
 *
 * Valid sessions past halfway through their life are re-issued here, so anyone
 * who keeps using the site stays signed in indefinitely.
 */
export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const result = await readSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    if (result) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!result) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (needsRenewal(result.expiresAt)) {
    response.cookies.set(SESSION_COOKIE, await signSession(result.session), SESSION_COOKIE_OPTIONS);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|csv|xlsx)$).*)"],
};
