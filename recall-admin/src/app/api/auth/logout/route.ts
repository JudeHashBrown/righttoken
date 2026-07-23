import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  AUTH_STATE_COOKIE_NAME,
  revokeSessionByToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions
} from "@/modules/auth/session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { code: "INVALID_ORIGIN" },
      { status: 403 }
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await revokeSessionByToken(token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0
  });
  response.cookies.set(AUTH_STATE_COOKIE_NAME, "", {
    ...sessionCookieOptions(new Date(0)),
    maxAge: 0
  });
  return response;
}
