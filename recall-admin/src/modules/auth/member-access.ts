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
  reassignedUsers: number;
  transferredTasks: number;
  failedUsers: number;
  successor: {
    id: string;
    displayName: string;
    email: string;
  };
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
    successorId: string;
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
      | "SUCCESSOR_REQUIRED"
      | "SUCCESSOR_NOT_FOUND"
      | "SUCCESSOR_INACTIVE"
      | "SUCCESSOR_SAME_AS_TARGET"
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

export class PrismaMemberAccessStore implements MemberAccessStore {
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
    const users = await prisma.$queryRaw<
      RegisteredRightTokenUser[]
    >`
      SELECT
        id::text AS "externalUserId",
        email,
        NULLIF(username, '') AS "displayName"
      FROM public.users
      WHERE LOWER(email) = LOWER(${email})
        AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `;
    return users[0] ?? null;
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
    successorId: string;
  }): Promise<MemberAccessRevocationResult> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.$transaction(async (tx) => {
      const now = new Date();
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
      const [sessions, successor, users] = await Promise.all([
        tx.session.deleteMany({
          where: { memberId: input.targetId }
        }),
        tx.member.findFirstOrThrow({
          where: { id: input.successorId, active: true },
          select: {
            id: true,
            displayName: true,
            email: true
          }
        }),
        tx.userProfile.findMany({
          where: { ownerId: input.targetId },
          select: {
            id: true,
            ownerId: true,
            ownerAssignmentMode: true,
            countryCode: true,
            region: true
          }
        })
      ]);

      const assignmentReason =
        "原负责人权限已撤销，由指定成员接管";
      const reassigned = await tx.userProfile.updateMany({
        where: { ownerId: input.targetId },
        data: {
          ownerId: successor.id,
          ownerAssignmentMode: "MANUAL",
          ownerAssignedAt: now,
          ownerAssignedById: input.actorId,
          ownerAssignmentReason: assignmentReason
        }
      });
      const transferred = await tx.recallTask.updateMany({
        where: {
          status: { in: [...openTaskStatuses] },
          OR: [
            { userId: { in: users.map((user) => user.id) } },
            { assigneeId: input.targetId }
          ]
        },
        data: { assigneeId: successor.id }
      });
      if (users.length > 0) {
        await tx.auditLog.createMany({
          data: users.map((user) => ({
            actorId: input.actorId,
            action:
              "user.owner_reassigned_after_member_revoked",
            entityType: "UserProfile",
            entityId: user.id,
            metadata: {
              previousOwnerId: input.targetId,
              ownerId: successor.id,
              assignmentMode: "MANUAL",
              assignmentReason,
              previousAssignmentMode:
                user.ownerAssignmentMode,
              countryCode: user.countryCode,
              region: user.region
            }
          }))
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "member.access_revoked",
          entityType: "Member",
          entityId: input.targetId,
          metadata: {
            revokedSessions: sessions.count,
            reassignedUsers: reassigned.count,
            transferredTasks: transferred.count,
            failedUsers: 0,
            successorId: successor.id,
            successorEmail: successor.email
          }
        }
      });
      return {
        member,
        revokedSessions: sessions.count,
        reassignedUsers: reassigned.count,
        transferredTasks: transferred.count,
        failedUsers: 0,
        successor
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
  successorId: string,
  store: MemberAccessStore = defaultStore
): Promise<MemberAccessRevocationResult> {
  const normalizedSuccessorId = successorId.trim();
  const [actor, target, successor] = await Promise.all([
    store.findMember(actorId),
    store.findMember(targetId),
    normalizedSuccessorId
      ? store.findMember(normalizedSuccessorId)
      : null
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
  if (!normalizedSuccessorId) {
    throw new MemberAccessError("SUCCESSOR_REQUIRED");
  }
  if (!successor) {
    throw new MemberAccessError("SUCCESSOR_NOT_FOUND");
  }
  if (!successor.active) {
    throw new MemberAccessError("SUCCESSOR_INACTIVE");
  }
  if (successor.id === target.id) {
    throw new MemberAccessError("SUCCESSOR_SAME_AS_TARGET");
  }
  if (!target.active) {
    return {
      member: target,
      revokedSessions: 0,
      reassignedUsers: 0,
      transferredTasks: 0,
      failedUsers: 0,
      successor: {
        id: successor.id,
        displayName: successor.displayName,
        email: successor.email
      }
    };
  }
  return store.revokeAccess({
    actorId,
    targetId,
    successorId: successor.id
  });
}
