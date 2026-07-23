import { Prisma } from "@/generated/prisma/client";
import type { Session } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";

const REAUTHENTICATION_WINDOW_MS = 5 * 60 * 1000;

export class ReauthenticationRequiredError extends Error {
  constructor() {
    super("recent reauthentication is required");
    this.name = "ReauthenticationRequiredError";
  }
}

export function assertRecentReauthentication(
  session: Pick<
    Session,
    "expiresAt" | "reauthenticatedAt"
  >
): void {
  const reauthenticationCutoff = new Date(
    Date.now() - REAUTHENTICATION_WINDOW_MS
  );
  if (
    session.expiresAt <= new Date() ||
    !session.reauthenticatedAt ||
    session.reauthenticatedAt < reauthenticationCutoff
  ) {
    throw new ReauthenticationRequiredError();
  }
}

export async function countPrimaryAdmins(): Promise<number> {
  return prisma.member.count({
    where: { role: "PRIMARY_ADMIN" }
  });
}

export async function transferPrimaryAdmin(
  currentPrimaryId: string,
  targetAdminId: string,
  verifiedSessionId: string
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT "id"
          FROM "Member"
          WHERE "id" IN (${currentPrimaryId}, ${targetAdminId})
          FOR UPDATE
        `
      );

      const [currentPrimary, targetAdmin, session] =
        await Promise.all([
          tx.member.findUniqueOrThrow({
            where: { id: currentPrimaryId }
          }),
          tx.member.findUniqueOrThrow({
            where: { id: targetAdminId }
          }),
          tx.session.findUnique({
            where: { id: verifiedSessionId }
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

      if (
        !session ||
        session.memberId !== currentPrimary.id
      ) {
        throw new ReauthenticationRequiredError();
      }
      assertRecentReauthentication(session);

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
            verifiedSessionId
          }
        }
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}
