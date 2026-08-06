import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserActionAccess } from "@/modules/b-group/action-access";
import { z } from "zod";

export const maintenanceInputSchema = z
  .object({
    occurredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/),
    body: z.string().trim().min(1).max(2_000)
  })
  .strict();

export function shanghaiDateToUtc(value: string): Date {
  return new Date(`${value}T12:00:00+08:00`);
}

export async function addManualMaintenanceRecord(
  actorId: string,
  userId: string,
  input: unknown
) {
  const parsed = maintenanceInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { actor, user } = await requireUserActionAccess(
      tx,
      actorId,
      userId
    );
    const record = await tx.userMaintenanceRecord.create({
      data: {
        userId: user.id,
        actorId: actor.id,
        source: "MANUAL",
        occurredAt: shanghaiDateToUtc(parsed.occurredOn),
        body: parsed.body
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user_maintenance.created",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          recordId: record.id,
          source: record.source,
          characterCount: record.body.length
        } satisfies Prisma.InputJsonValue
      }
    });
    return record;
  });
}
