import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import { assignUserOwnerInTransaction } from "@/modules/assignment/assign-task";
import { UserAssignmentError } from "@/modules/users/assignment-errors";
import { transferOpenUserTasks } from "@/modules/users/transfer-open-user-tasks";

export type ResolveUserAssignmentInput = {
  userId: string;
  actorId: string;
  countryCode?: string;
  region?: string | null;
  targetOwnerId?: string;
  reason: string;
  now?: Date;
};

export type ResolveUserAssignmentResult = {
  userId: string;
  countryCode: string | null;
  region: string | null;
  ownerId: string | null;
  ownerAssignmentMode: "AUTO" | "MANUAL";
  matchedRuleId: string | null;
  transferredTasks: number;
};

type AssignmentUser = {
  id: string;
  countryCode: string | null;
  region: string | null;
  ownerId: string | null;
  ownerAssignmentMode: "AUTO" | "MANUAL";
  sourceDeletedAt: Date | null;
};

function assertAdministrator(actor: {
  role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
  active: boolean;
}): void {
  if (
    !actor.active ||
    !["PRIMARY_ADMIN", "ADMIN"].includes(actor.role)
  ) {
    throw new UserAssignmentError("FORBIDDEN");
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

function normalizeInput(input: ResolveUserAssignmentInput): {
  countryCode: string | undefined;
  region: string | null;
  targetOwnerId: string | undefined;
  reason: string;
} {
  const countryCode = input.countryCode?.trim().toUpperCase() || undefined;
  const region = input.region?.trim() || null;
  const targetOwnerId = input.targetOwnerId?.trim() || undefined;
  const reason = input.reason.trim();

  if (!countryCode && !targetOwnerId) {
    throw new UserAssignmentError("ASSIGNMENT_REQUIRED");
  }
  if (countryCode && !/^[A-Z]{2}$/u.test(countryCode)) {
    throw new UserAssignmentError("COUNTRY_INVALID");
  }
  if (region && !countryCode) {
    throw new UserAssignmentError("REGION_WITHOUT_COUNTRY");
  }
  if (!reason) {
    throw new UserAssignmentError("REASON_REQUIRED");
  }
  return { countryCode, region, targetOwnerId, reason };
}

async function loadUser(
  tx: TransactionClient,
  userId: string
): Promise<AssignmentUser> {
  const user = await tx.userProfile.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      countryCode: true,
      region: true,
      ownerId: true,
      ownerAssignmentMode: true,
      sourceDeletedAt: true
    }
  });
  if (user.sourceDeletedAt) {
    throw new UserAssignmentError("USER_NOT_FOUND");
  }
  return user;
}

export async function resolveUserAssignment(
  input: ResolveUserAssignmentInput
): Promise<ResolveUserAssignmentResult> {
  const normalized = normalizeInput(input);
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const [actor, user] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      loadUser(tx, input.userId)
    ]);
    assertAdministrator(actor);

    const target = normalized.targetOwnerId
      ? await tx.member.findUniqueOrThrow({
          where: { id: normalized.targetOwnerId },
          select: { id: true, role: true, active: true }
        })
      : null;
    if (target && !target.active) {
      throw new UserAssignmentError("TARGET_OWNER_INACTIVE");
    }
    if (
      target &&
      !["PRIMARY_ADMIN", "ADMIN", "OPERATOR"].includes(target.role)
    ) {
      throw new UserAssignmentError("TARGET_OWNER_INVALID");
    }

    if (normalized.countryCode) {
      await tx.userProfile.update({
        where: { id: user.id },
        data: {
          countryCode: normalized.countryCode,
          region: normalized.region,
          locationSource: null,
          locationRuleId: null,
          locationEvaluatedAt: now,
          locationAssignmentMode: "MANUAL",
          locationAssignedAt: now,
          locationAssignedById: actor.id,
          locationAssignmentReason: normalized.reason
        }
      });
    }

    const shouldRecalculateOwner = Boolean(
      normalized.countryCode &&
        (user.ownerAssignmentMode === "AUTO" || target)
    );
    const automaticDecision = shouldRecalculateOwner
      ? await assignUserOwnerInTransaction(tx, user.id, now, {
          forceAutomatic: true
        })
      : null;

    if (target) {
      await tx.userProfile.update({
        where: { id: user.id },
        data: {
          ownerId: target.id,
          ownerAssignmentMode: "MANUAL",
          ownerAssignedAt: now,
          ownerAssignedById: actor.id,
          ownerAssignmentReason: normalized.reason
        }
      });
    }

    const ownerId = target
      ? target.id
      : automaticDecision
        ? automaticDecision.assigneeId
        : user.ownerId;
    const ownerAssignmentMode = target
      ? ("MANUAL" as const)
      : automaticDecision
        ? ("AUTO" as const)
        : user.ownerAssignmentMode;
    const transferredTasks =
      ownerId !== user.ownerId
        ? await transferOpenUserTasks(tx, {
            userId: user.id,
            actorId: actor.id,
            ownerId,
            reason: normalized.reason,
            now,
            source: normalized.countryCode
              ? "user_location_change"
              : "user_owner_change"
          })
        : 0;
    const countryCode =
      normalized.countryCode ?? user.countryCode;
    const region = normalized.countryCode
      ? normalized.region
      : user.region;
    const matchedRuleId =
      automaticDecision?.matchedRuleId ?? null;

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user.assignment_resolved",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          previousCountryCode: user.countryCode,
          previousRegion: user.region,
          countryCode,
          region,
          previousOwnerId: user.ownerId,
          ownerId,
          ownerAssignmentMode,
          matchedRuleId,
          reason: normalized.reason,
          transferredTasks
        }
      }
    });

    return {
      userId: user.id,
      countryCode,
      region,
      ownerId,
      ownerAssignmentMode,
      matchedRuleId,
      transferredTasks
    };
  });
}
