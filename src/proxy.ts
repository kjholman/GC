import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/**
 * Cheap edge gate: bounce requests without a session cookie to /login.
 * The session itself is validated against the database in every page,
 * route handler and server action (see lib/auth/session.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("ga_session");
  if (!hasSession && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|team/|api/knowledge-files/upload|robots.txt).*)"],
};
