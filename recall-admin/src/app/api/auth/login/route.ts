import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  getLoginRateLimitStatus,
  recordLoginAttempt
} from "@/modules/auth/login-rate-limit";
import {
  hashPassword,
  verifyPassword
} from "@/modules/auth/password";
import {
  createSession,
  AUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  sessionCookieOptions
} from "@/modules/auth/session";

const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12)
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { code: "INVALID_ORIGIN" },
      { status: 403 }
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: "INVALID_LOGIN_REQUEST" },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  const ipAddress = getClientIp(request);
  const rateLimit = await getLoginRateLimitStatus(email, ipAddress);
  if (rateLimit.limited) {
    return NextResponse.json(
      {
        code: "LOGIN_RATE_LIMITED",
        retryAt: rateLimit.retryAt.toISOString()
      },
      { status: 429 }
    );
  }

  const member = await prisma.member.findUnique({ where: { email } });
  const passwordMatches = member
    ? await verifyPassword(member.passwordHash, password)
    : (await hashPassword(password), false);
  const succeeded = Boolean(
    member && member.active && passwordMatches
  );

  await recordLoginAttempt(email, ipAddress, succeeded);

  if (!succeeded || !member) {
    return NextResponse.json(
      { code: "INVALID_CREDENTIALS" },
      { status: 401 }
    );
  }

  const secondFactorRequired =
    member.role !== "OPERATOR" || member.twoFactorOn;
  const authState = member.twoFactorOn ? "verify" : "enroll";
  const session = await createSession(member.id, {
    secondFactorRequired
  });
  const response = NextResponse.json({
    member: {
      id: member.id,
      displayName: member.displayName,
      role: member.role
    },
    ...(secondFactorRequired
      ? {
          nextStep:
            authState === "verify" ? "VERIFY_2FA" : "ENROLL_2FA"
        }
      : {})
  });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    session.token,
    sessionCookieOptions(session.expiresAt)
  );
  if (secondFactorRequired) {
    response.cookies.set(
      AUTH_STATE_COOKIE_NAME,
      authState,
      sessionCookieOptions(session.expiresAt)
    );
  }
  return response;
}
