import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Member } from "@/generated/prisma/client";
import {
  can,
  type Permission
} from "@/modules/auth/permissions";
import {
  findMemberBySessionToken,
  findSessionByToken,
  type SessionContext,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

export class UnauthorizedError extends Error {
  constructor() {
    super("authentication required");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertMemberPermission<
  T extends Pick<Member, "id" | "role">
>(member: T, permission: Permission): T {
  if (!can(member.role, permission)) {
    throw new ForbiddenError(permission);
  }
  return member;
}

export async function getCurrentMember(): Promise<Member | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return findMemberBySessionToken(token);
}

export async function requirePermission(
  permission: Permission
): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) {
    throw new UnauthorizedError();
  }
  return assertMemberPermission(member, permission);
}

export async function requireRequestPermission(
  request: NextRequest,
  permission: Permission,
  options: { allowPendingSecondFactor?: boolean } = {}
): Promise<SessionContext> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new UnauthorizedError();
  }
  const context = await findSessionByToken(token, {
    allowPending: options.allowPendingSecondFactor
  });
  if (!context) {
    throw new UnauthorizedError();
  }
  assertMemberPermission(context.member, permission);
  return context;
}
