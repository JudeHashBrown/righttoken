import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";

export async function addUserNote(
  actorId: string,
  userId: string,
  body: string
) {
  const normalizedBody = body.trim();
  if (!normalizedBody || normalizedBody.length > 2_000) {
    throw new Error("note must be between 1 and 2000 characters");
  }

  return prisma.$transaction(async (tx) => {
    const [actor, user] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: actorId },
        select: { id: true, role: true, active: true }
      }),
      tx.userProfile.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          ownerId: true,
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
    if (!actor.active) {
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

    const note = await tx.userNote.create({
      data: {
        userId: user.id,
        authorId: actor.id,
        body: normalizedBody
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user_note.created",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          noteId: note.id,
          characterCount: normalizedBody.length
        } satisfies Prisma.InputJsonValue
      }
    });
    return note;
  });
}
