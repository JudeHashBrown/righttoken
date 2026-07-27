import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { Member } from "@/generated/prisma/client";
import {
  assertMemberPermission,
  ForbiddenError,
  UnauthorizedError
} from "@/modules/auth/authorization";
import type { Permission } from "@/modules/auth/permissions";
import {
  findMemberBySessionToken,
  findSessionByToken,
  type SessionContext,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";
import {
  createDevelopmentSessionContext,
  getDevelopmentPrimaryAdmin
} from "@/modules/auth/development-identity";
import { isDevelopmentAuthMode } from "@/modules/auth/development-mode";

export {
  assertMemberPermission,
  ForbiddenError,
  UnauthorizedError
};

export async function getCurrentMember(): Promise<Member | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const member = await findMemberBySessionToken(token);
    if (member) {
      return member;
    }
  }
  if (isDevelopmentAuthMode()) {
    return getDevelopmentPrimaryAdmin();
  }
  return null;
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
  if (token) {
    const context = await findSessionByToken(token, {
      allowPending: options.allowPendingSecondFactor
    });
    if (context) {
      assertMemberPermission(context.member, permission);
      return context;
    }
  }
  if (isDevelopmentAuthMode()) {
    const member = assertMemberPermission(
      await getDevelopmentPrimaryAdmin(),
      permission
    );
    return createDevelopmentSessionContext(member);
  }
  throw new UnauthorizedError();
}
