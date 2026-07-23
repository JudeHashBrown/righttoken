import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

export function proxy(request: NextRequest): NextResponse {
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  const authState = request.cookies.get(
    AUTH_STATE_COOKIE_NAME
  )?.value;
  if (authState === "enroll" || authState === "verify") {
    const setupUrl = new URL("/2fa/setup", request.url);
    setupUrl.searchParams.set("mode", authState);
    return NextResponse.redirect(setupUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tasks/:path*",
    "/users/:path*",
    "/mail/:path*",
    "/automation/:path*",
    "/reports/:path*",
    "/members/:path*",
    "/settings/:path*"
  ]
};
