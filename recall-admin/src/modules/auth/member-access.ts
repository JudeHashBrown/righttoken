import type { MemberRole } from "@/generated/prisma/client";

const openTaskStatuses = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
] as const;

export type MemberAccessRecord = {
  id: string;
  email: string;
  displayName: string;
  role: MemberRole;
  active: boolean;
  rightTokenUserId: string | null;
};

export type RegisteredRightTokenUser = {
  externalUserId: string;
  email: string;
  displayName: string | null;
};

export type MemberAccessGrantInput = {
  actorId: string;
  registeredUserId: string;
  email: string;
  displayName: string;
  role: Exclude<MemberRole, "PRIMARY_ADMIN">;
};

export type MemberAccessRevocationResult = {
  member: MemberAccessRecord;
  revokedSessions: number;
  releasedUsers: number;
  releasedTasks: number;
};

export interface MemberAccessStore {
  findMember(id: string): Promise<MemberAccessRecord | null>;
  findMemberByEmail(
    email: string
  ): Promise<MemberAccessRecord | null>;
  findRegisteredUser(
    email: string
  ): Promise<RegisteredRightTokenUser | null>;
  grantAccess(
    input: MemberAccessGrantInput
  ): Promise<MemberAccessRecord>;
  revokeAccess(input: {
    actorId: string;
    targetId: string;
  }): Promise<MemberAccessRevocationResult>;
}

export class MemberAccessError extends Error {
  constructor(
    readonly code:
      | "ACTOR_NOT_FOUND"
      | "TARGET_NOT_FOUND"
      | "RIGHTTOKEN_USER_NOT_FOUND"
      | "FORBIDDEN"
      | "CANNOT_REVOKE_SELF"
      | "CANNOT_REVOKE_PRIMARY_ADMIN"
      | "MEMBER_ALREADY_ACTIVE"
  ) {
    super(code);
    this.name = "MemberAccessError";
  }
}

function assertActiveActor(
  actor: MemberAccessRecord | null
): asserts actor is MemberAccessRecord {
  if (!actor?.active) {
    throw new MemberAccessError("ACTOR_NOT_FOUND");
  }
}

function canManageRole(
  actorRole: MemberRole,
  targetRole: MemberRole
): boolean {
  if (actorRole === "PRIMARY_ADMIN") {
    return targetRole !== "PRIMARY_ADMIN";
  }
  return actorRole === "ADMIN" && targetRole === "OPERATOR";
}

class PrismaMemberAccessStore implements MemberAccessStore {
  async findMember(id: string): Promise<MemberAccessRecord | null> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.member.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        active: true,
        rightTokenUserId: true
      }
    });
  }

  async findMemberByEmail(
    email: string
  ): Promise<MemberAccessRecord | null> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.member.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive"
        }
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        active: true,
        rightTokenUserId: true
      }
    });
  }

  async findRegisteredUser(
    email: string
  ): Promise<RegisteredRightTokenUser | null> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.userProfile.findFirst({
      where: { emailNormalized: email },
      orderBy: { updatedAt: "desc" },
      select: {
        externalUserId: true,
        email: true,
        displayName: true
      }
    });
  }

  async grantAccess(
    input: MemberAccessGrantInput
  ): Promise<MemberAccessRecord> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.$transaction(async (tx) => {
      const existing = await tx.member.findFirst({
        where: {
          email: {
            equals: input.email,
            mode: "insensitive"
          }
        },
        select: { id: true }
      });
      const data = {
        email: input.email,
        displayName: input.displayName,
        passwordHash: "RIGHTTOKEN_MANAGED_IDENTITY",
        rightTokenUserId: input.registeredUserId,
        role: input.role,
        active: true
      };
      const granted = existing
        ? await tx.member.update({
            where: { id: existing.id },
            data,
            select: {
              id: true,
              email: true,
              displayName: true,
              role: true,
              active: true,
              rightTokenUserId: true
            }
          })
        : await tx.member.create({
            data,
            select: {
              id: true,
              email: true,
              displayName: true,
              role: true,
              active: true,
              rightTokenUserId: true
            }
          });

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "member.access_granted",
          entityType: "Member",
          entityId: granted.id,
          metadata: {
            email: input.email,
            role: input.role,
            rightTokenUserId: input.registeredUserId
          }
        }
      });
      return granted;
    });
  }

  async revokeAccess(input: {
    actorId: string;
    targetId: string;
  }): Promise<MemberAccessRevocationResult> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.$transaction(async (tx) => {
      const member = await tx.member.update({
        where: { id: input.targetId },
        data: { active: false },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          active: true,
          rightTokenUserId: true
        }
      });
      const [sessions, users, tasks] = await Promise.all([
        tx.session.deleteMany({
          where: { memberId: input.targetId }
        }),
        tx.userProfile.updateMany({
          where: { ownerId: input.targetId },
          data: { ownerId: null }
        }),
        tx.recallTask.updateMany({
          where: {
            assigneeId: input.targetId,
            status: { in: [...openTaskStatuses] }
          },
          data: {
            assigneeId: null,
            status: "UNASSIGNED"
          }
        })
      ]);
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "member.access_revoked",
          entityType: "Member",
          entityId: input.targetId,
          metadata: {
            revokedSessions: sessions.count,
            releasedUsers: users.count,
            releasedTasks: tasks.count
          }
        }
      });
      return {
        member,
        revokedSessions: sessions.count,
        releasedUsers: users.count,
        releasedTasks: tasks.count
      };
    });
  }
}

const defaultStore = new PrismaMemberAccessStore();

export async function grantMemberAccess(
  actorId: string,
  email: string,
  role: Exclude<MemberRole, "PRIMARY_ADMIN">,
  store: MemberAccessStore = defaultStore
): Promise<MemberAccessRecord> {
  const normalizedEmail = email.trim().toLowerCase();
  const [actor, registeredUser, existingMember] = await Promise.all([
    store.findMember(actorId),
    store.findRegisteredUser(normalizedEmail),
    store.findMemberByEmail(normalizedEmail)
  ]);
  assertActiveActor(actor);
  if (!canManageRole(actor.role, role)) {
    throw new MemberAccessError("FORBIDDEN");
  }
  if (!registeredUser) {
    throw new MemberAccessError("RIGHTTOKEN_USER_NOT_FOUND");
  }
  if (existingMember?.id === actorId) {
    throw new MemberAccessError("FORBIDDEN");
  }
  if (
    existingMember &&
    !canManageRole(actor.role, existingMember.role)
  ) {
    throw new MemberAccessError("FORBIDDEN");
  }
  if (existingMember?.active) {
    throw new MemberAccessError("MEMBER_ALREADY_ACTIVE");
  }

  return store.grantAccess({
    actorId,
    registeredUserId: registeredUser.externalUserId,
    email: registeredUser.email.trim().toLowerCase(),
    displayName:
      registeredUser.displayName?.trim() ||
      registeredUser.email.split("@")[0],
    role
  });
}

export async function revokeMemberAccess(
  actorId: string,
  targetId: string,
  store: MemberAccessStore = defaultStore
): Promise<MemberAccessRevocationResult> {
  const [actor, target] = await Promise.all([
    store.findMember(actorId),
    store.findMember(targetId)
  ]);
  assertActiveActor(actor);
  if (!target) {
    throw new MemberAccessError("TARGET_NOT_FOUND");
  }
  if (actor.id === target.id) {
    throw new MemberAccessError("CANNOT_REVOKE_SELF");
  }
  if (target.role === "PRIMARY_ADMIN") {
    throw new MemberAccessError("CANNOT_REVOKE_PRIMARY_ADMIN");
  }
  if (!canManageRole(actor.role, target.role)) {
    throw new MemberAccessError("FORBIDDEN");
  }
  if (!target.active) {
    return {
      member: target,
      revokedSessions: 0,
      releasedUsers: 0,
      releasedTasks: 0
    };
  }
  return store.revokeAccess({ actorId, targetId });
}
