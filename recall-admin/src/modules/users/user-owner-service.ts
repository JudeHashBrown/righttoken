import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import { assignUserOwnerInTransaction } from "@/modules/assignment/assign-task";
import { UserOwnerError } from "@/modules/users/owner-errors";
import { transferOpenUserTasks } from "@/modules/users/transfer-open-user-tasks";

export type OwnerChangeResult = {
  userId: string;
  previousOwnerId: string | null;
  ownerId: string;
  mode: "AUTO" | "MANUAL";
  transferredTasks: number;
};

type OwnerChangeInput = {
  userId: string;
  actorId: string;
  now?: Date;
};

function assertAdministrator(actor: {
  role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
  active: boolean;
}): void {
  if (
    !actor.active ||
    !["PRIMARY_ADMIN", "ADMIN"].includes(actor.role)
  ) {
    throw new UserOwnerError("FORBIDDEN");
  }
}

async function lockUser(
  tx: TransactionClient,
  userId: string
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT "id"
      FROM "recall"."UserProfile"
      WHERE "id" = ${userId}
      FOR UPDATE
    `
  );
}

export async function manuallyAssignUserOwner(
  input: OwnerChangeInput & {
    targetOwnerId: string;
    reason: string;
  }
): Promise<OwnerChangeResult> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (!reason) {
    throw new UserOwnerError("REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const [actor, target, user] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      tx.member.findUniqueOrThrow({
        where: { id: input.targetOwnerId },
        select: { id: true, role: true, active: true }
      }),
      tx.userProfile.findUniqueOrThrow({
        where: { id: input.userId },
        select: {
          id: true,
          ownerId: true,
          ownerAssignmentMode: true,
          ownerAssignedAt: true,
          countryCode: true,
          region: true,
          sourceDeletedAt: true
        }
      })
    ]);
    assertAdministrator(actor);
    if (!target.active) {
      throw new UserOwnerError("TARGET_OWNER_INACTIVE");
    }
    if (
      !["PRIMARY_ADMIN", "ADMIN", "OPERATOR"].includes(
        target.role
      )
    ) {
      throw new UserOwnerError("TARGET_OWNER_INVALID");
    }
    if (user.sourceDeletedAt) {
      throw new UserOwnerError("USER_NOT_FOUND");
    }
    if (!user.ownerId || !user.ownerAssignedAt) {
      throw new UserOwnerError(
        "INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED"
      );
    }

    await tx.userProfile.update({
      where: { id: user.id },
      data: {
        ownerId: target.id,
        ownerAssignmentMode: "MANUAL",
        ownerAssignedAt: now,
        ownerAssignedById: actor.id,
        ownerAssignmentReason: reason
      }
    });
    const transferredTasks = await transferOpenUserTasks(tx, {
      userId: user.id,
      actorId: actor.id,
      ownerId: target.id,
      reason,
      now
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user.owner_manually_assigned",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          previousOwnerId: user.ownerId,
          ownerId: target.id,
          assignmentMode: "MANUAL",
          countryCode: user.countryCode,
          region: user.region,
          reason,
          transferredTasks
        }
      }
    });

    return {
      userId: user.id,
      previousOwnerId: user.ownerId,
      ownerId: target.id,
      mode: "MANUAL",
      transferredTasks
    };
  });
}

export async function restoreAutomaticUserOwner(
  input: OwnerChangeInput
): Promise<OwnerChangeResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const [actor, user] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      tx.userProfile.findUniqueOrThrow({
        where: { id: input.userId },
        select: {
          id: true,
          ownerId: true,
          ownerAssignmentMode: true,
          countryCode: true,
          region: true,
          sourceDeletedAt: true
        }
      })
    ]);
    assertAdministrator(actor);
    if (user.sourceDeletedAt) {
      throw new UserOwnerError("USER_NOT_FOUND");
    }
    if (user.ownerAssignmentMode !== "MANUAL") {
      throw new UserOwnerError("OWNER_ALREADY_AUTOMATIC");
    }

    const decision = await assignUserOwnerInTransaction(
      tx,
      user.id,
      now,
      { forceAutomatic: true }
    );
    if (!decision.assigneeId) {
      throw new Error("ASSIGNMENT_OWNER_REQUIRED");
    }
    const reason = "管理员恢复系统自动分配";
    const transferredTasks = await transferOpenUserTasks(tx, {
      userId: user.id,
      actorId: actor.id,
      ownerId: decision.assigneeId,
      reason,
      now
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user.owner_auto_restored",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          previousOwnerId: user.ownerId,
          ownerId: decision.assigneeId,
          assignmentMode: "AUTO",
          countryCode: user.countryCode,
          region: user.region,
          matchedRuleId: decision.matchedRuleId,
          assignmentReason: decision.assignmentReason,
          transferredTasks
        }
      }
    });

    return {
      userId: user.id,
      previousOwnerId: user.ownerId,
      ownerId: decision.assigneeId,
      mode: "AUTO",
      transferredTasks
    };
  });
}
