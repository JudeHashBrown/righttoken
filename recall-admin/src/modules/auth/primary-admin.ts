import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";

export async function countPrimaryAdmins(): Promise<number> {
  return prisma.member.count({
    where: { role: "PRIMARY_ADMIN" }
  });
}

export async function transferPrimaryAdmin(
  currentPrimaryId: string,
  targetAdminId: string
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT "id"
          FROM "recall"."Member"
          WHERE "id" IN (${currentPrimaryId}, ${targetAdminId})
          FOR UPDATE
        `
      );

      const [currentPrimary, targetAdmin] = await Promise.all([
          tx.member.findUniqueOrThrow({
            where: { id: currentPrimaryId }
          }),
          tx.member.findUniqueOrThrow({
            where: { id: targetAdminId }
          })
        ]);

      if (currentPrimary.role !== "PRIMARY_ADMIN") {
        throw new ForbiddenError("admins:manage");
      }
      if (
        targetAdmin.role !== "ADMIN" ||
        !targetAdmin.active ||
        targetAdmin.id === currentPrimary.id
      ) {
        throw new Error("target must be a different active administrator");
      }

      await tx.member.update({
        where: { id: currentPrimary.id },
        data: { role: "ADMIN" }
      });
      await tx.member.update({
        where: { id: targetAdmin.id },
        data: { role: "PRIMARY_ADMIN" }
      });

      const primaryCount = await tx.member.count({
        where: { role: "PRIMARY_ADMIN" }
      });
      if (primaryCount !== 1) {
        throw new Error("primary administrator invariant violated");
      }

      await tx.auditLog.create({
        data: {
          actorId: currentPrimary.id,
          action: "primary_admin.transferred",
          entityType: "Member",
          entityId: targetAdmin.id,
          metadata: {
            previousPrimaryId: currentPrimary.id,
            newPrimaryId: targetAdmin.id,
            identitySource: "righttoken-managed"
          }
        }
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}
