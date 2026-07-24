import { Prisma, type SegmentCode } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import { resegmentUser } from "@/modules/segmentation/resegment-user";

const MAX_OVERRIDE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function validateOverride(
  reason: string,
  expiresAt: Date,
  now: Date
): string {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    throw new Error("override reason must be between 3 and 500 characters");
  }
  if (
    expiresAt <= now ||
    expiresAt.getTime() - now.getTime() > MAX_OVERRIDE_DURATION_MS
  ) {
    throw new Error("override expiry must be within 30 days");
  }
  return normalizedReason;
}

async function requireActiveRulePublisher(
  actorId: string,
  tx: Prisma.TransactionClient
) {
  const actor = await tx.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("rules:publish");
  }
  return assertMemberPermission(actor, "rules:publish");
}

export async function createSegmentOverride(
  actorId: string,
  userId: string,
  segment: SegmentCode,
  reason: string,
  expiresAt: Date,
  now = new Date()
) {
  const normalizedReason = validateOverride(reason, expiresAt, now);

  return prisma.$transaction(
    async (tx) => {
      const actor = await requireActiveRulePublisher(actorId, tx);
      await tx.$queryRaw(
        Prisma.sql`
          SELECT "id"
          FROM "UserProfile"
          WHERE "id" = ${userId}
          FOR UPDATE
        `
      );
      const user = await tx.userProfile.findUniqueOrThrow({
        where: { id: userId }
      });
      if (user.anomalyActive) {
        throw new Error(
          "active service anomalies cannot be overridden"
        );
      }

      await tx.segmentOverride.updateMany({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        data: { revokedAt: now }
      });
      const override = await tx.segmentOverride.create({
        data: {
          userId,
          segment,
          reason: normalizedReason,
          createdById: actor.id,
          expiresAt
        }
      });
      await resegmentUser(tx, user, "manual override created", now);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "segment_override.created",
          entityType: "SegmentOverride",
          entityId: override.id,
          metadata: {
            userId,
            segment,
            expiresAt: expiresAt.toISOString()
          }
        }
      });

      return override;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}

export async function revokeSegmentOverride(
  actorId: string,
  overrideId: string,
  now = new Date(),
  expectedUserId?: string
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const actor = await requireActiveRulePublisher(actorId, tx);
      const override = await tx.segmentOverride.findUniqueOrThrow({
        where: { id: overrideId }
      });
      if (
        expectedUserId &&
        override.userId !== expectedUserId
      ) {
        throw new Error("segment override does not belong to user");
      }
      await tx.$queryRaw(
        Prisma.sql`
          SELECT "id"
          FROM "UserProfile"
          WHERE "id" = ${override.userId}
          FOR UPDATE
        `
      );
      if (override.revokedAt) {
        throw new Error("segment override is already revoked");
      }

      await tx.segmentOverride.update({
        where: { id: override.id },
        data: { revokedAt: now }
      });
      const user = await tx.userProfile.findUniqueOrThrow({
        where: { id: override.userId }
      });
      await resegmentUser(tx, user, "manual override revoked", now);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "segment_override.revoked",
          entityType: "SegmentOverride",
          entityId: override.id,
          metadata: {
            userId: override.userId,
            segment: override.segment
          }
        }
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}
