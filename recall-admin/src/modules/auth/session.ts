import { createHash, randomBytes } from "node:crypto";
import type {
  Member,
  Session
} from "@/generated/prisma/client";

export const SESSION_COOKIE_NAME = "rt_recall_session";
export const AUTH_STATE_COOKIE_NAME = "rt_recall_auth_state";
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export type CreatedSession = {
  id: string;
  token: string;
  expiresAt: Date;
};

export type SessionSummary = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  reauthenticatedAt: Date | null;
};

export type SessionContext = {
  session: Session;
  member: Member;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt
  };
}

export async function createSession(
  memberId: string,
  options: { secondFactorRequired?: boolean } = {}
): Promise<CreatedSession> {
  const { prisma } = await import("@/lib/db/prisma");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await prisma.session.create({
    data: {
      memberId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      secondFactorRequired: options.secondFactorRequired ?? false
    },
    select: { id: true }
  });

  return { id: session.id, token, expiresAt };
}

export async function findMemberBySessionToken(
  token: string
): Promise<Member | null> {
  return (await findSessionByToken(token))?.member ?? null;
}

export async function findSessionByToken(
  token: string,
  options: { allowPending?: boolean } = {}
): Promise<SessionContext | null> {
  const { prisma } = await import("@/lib/db/prisma");
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { member: true }
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.member.active ||
    (session.secondFactorRequired &&
      !session.secondFactorVerifiedAt &&
      !options.allowPending)
  ) {
    return null;
  }

  const { member, ...sessionRecord } = session;
  return { member, session: sessionRecord };
}

export async function markReauthenticated(
  sessionId: string
): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.session.update({
    where: { id: sessionId },
    data: { reauthenticatedAt: new Date() }
  });
}

export async function markSecondFactorVerified(
  sessionId: string
): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");
  const verifiedAt = new Date();
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      secondFactorVerifiedAt: verifiedAt,
      reauthenticatedAt: verifiedAt
    }
  });
}

export async function revokeSessionByToken(
  token: string
): Promise<void> {
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) }
  });
}

export async function listMemberSessions(
  memberId: string
): Promise<SessionSummary[]> {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.session.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      reauthenticatedAt: true
    }
  });
}

export async function revokeAllMemberSessions(
  memberId: string,
  exceptSessionId?: string
): Promise<number> {
  const { prisma } = await import("@/lib/db/prisma");
  const result = await prisma.session.deleteMany({
    where: {
      memberId,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {})
    }
  });

  return result.count;
}
