import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserActionAccess } from "@/modules/b-group/action-access";
import { z } from "zod";

export const outreachInputSchema = z.object({
  reason: z.string().trim().max(1_000).nullish(),
  body: z.string().trim().min(1).max(4_000),
  assetId: z.string().trim().min(1).max(128).nullish()
}).strict();

export const carePlanInputSchema = z.object({
  body: z.string().trim().min(1).max(6_000)
}).strict();

export async function addRechargeOutreach(actorId: string, userId: string, input: unknown) {
  const parsed = outreachInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { actor, user } = await requireUserActionAccess(tx, actorId, userId);
    const record = await tx.rechargeOutreachRecord.create({
      data: {
        userId: user.id,
        actorId: actor.id,
        reason: parsed.reason || null,
        body: parsed.body,
        assetId: parsed.assetId || null
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "recharge_outreach.created",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: { recordId: record.id, hasScreenshot: Boolean(record.assetId) } satisfies Prisma.InputJsonValue
      }
    });
    return record;
  });
}

export async function addPersonalizedCarePlan(actorId: string, userId: string, input: unknown) {
  const parsed = carePlanInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { actor, user } = await requireUserActionAccess(tx, actorId, userId);
    const plan = await tx.personalizedCarePlan.create({
      data: { userId: user.id, authorId: actor.id, body: parsed.body }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "personalized_care_plan.created",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: { planId: plan.id, characterCount: plan.body.length } satisfies Prisma.InputJsonValue
      }
    });
    return plan;
  });
}
