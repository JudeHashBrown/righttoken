import type { TransactionClient } from "@/lib/db/transaction";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";

export async function requireUserActionAccess(
  tx: TransactionClient,
  actorId: string,
  userId: string
) {
  const [actor, user] = await Promise.all([
    tx.member.findUniqueOrThrow({
      where: { id: actorId },
      select: { id: true, role: true, active: true }
    }),
    tx.userProfile.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        externalUserId: true,
        ownerId: true,
        sourceDeletedAt: true,
        tasks: {
          where: {
            OR: [
              { assigneeId: actorId },
              { assigneeId: null, status: "UNASSIGNED" }
            ]
          },
          take: 1,
          select: { id: true }
        }
      }
    })
  ]);
  if (!actor.active || user.sourceDeletedAt) {
    throw new ForbiddenError("tasks:work");
  }
  assertMemberPermission(actor, "tasks:work");
  if (
    actor.role === "OPERATOR" &&
    user.ownerId !== actor.id &&
    user.tasks.length === 0
  ) {
    throw new ForbiddenError("tasks:work");
  }
  return { actor, user };
}
