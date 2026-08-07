import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserActionAccess } from "@/modules/b-group/action-access";
import { z } from "zod";

export const inactivityReasonSchema = z.object({
  body: z.string().trim().min(1).max(4_000)
}).strict();

export const guidanceRecordSchema = z.object({
  category: z.enum(["GROUP_GUIDANCE", "TUTORIAL", "PERSONALIZED_PROMOTION"]),
  body: z.string().trim().min(1).max(6_000)
}).strict();

export async function addInactivityReason(actorId: string, userId: string, input: unknown) {
  const parsed = inactivityReasonSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { actor, user } = await requireUserActionAccess(tx, actorId, userId);
    const record = await tx.inactivityReasonRecord.create({
      data: { userId: user.id, actorId: actor.id, body: parsed.body }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "inactivity_reason.created",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: { recordId: record.id, characterCount: record.body.length } satisfies Prisma.InputJsonValue
      }
    });
    return record;
  });
}

export async function addGuidanceRecord(actorId: string, userId: string, input: unknown) {
  const parsed = guidanceRecordSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { actor, user } = await requireUserActionAccess(tx, actorId, userId);
    const record = await tx.userGuidanceRecord.create({
      data: { userId: user.id, actorId: actor.id, category: parsed.category, body: parsed.body }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user_guidance.created",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: { recordId: record.id, category: record.category } satisfies Prisma.InputJsonValue
      }
    });
    return record;
  });
}
