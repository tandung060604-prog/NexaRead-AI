import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "nexaread_session";
const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/health"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    isPublicPath(pathname)
    || pathname.startsWith("/_next/")
    || pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!favicon.ico|.*\\..*).*)"],
};
