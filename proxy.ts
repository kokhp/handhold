import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED = [/^\/dashboard(\/.*)?$/];
const AUTH_PAGES = ["/login", "/signup"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = getSessionCookie(req, { cookiePrefix: "handhold" });

  const isProtected = PROTECTED.some((r) => r.test(pathname));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
