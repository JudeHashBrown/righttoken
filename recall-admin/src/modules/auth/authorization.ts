import type { Member } from "@/generated/prisma/client";
import {
  can,
  type Permission
} from "@/modules/auth/permissions";

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
