import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import {
  MailBatchNotFoundError
} from "@/modules/mail/mail-batch-query";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

export type RetryMailBatchInput = {
  actorId: string;
  batchId: string;
  scheduler: TaskScheduler;
  now?: Date;
};

export async function retryMailBatch(
  input: RetryMailBatchInput
) {
  const now = input.now ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [actor, batch] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      tx.mailBatch.findUnique({
        where: { id: input.batchId },
        select: { id: true, createdById: true }
      })
    ]);
    if (!actor.active) {
      throw new ForbiddenError("mail:send-reviewed");
    }
    assertMemberPermission(actor, "mail:send-reviewed");
    if (!batch) {
      throw new MailBatchNotFoundError();
    }
    if (
      actor.role === "OPERATOR" &&
      batch.createdById !== actor.id
    ) {
      throw new ForbiddenError("mail:send-reviewed");
    }

    const retried = await tx.mailBatchRecipient.updateMany({
      where: {
        batchId: batch.id,
        status: "FAILED"
      },
      data: {
        status: "PENDING",
        reasonCode: null,
        claimedAt: null,
        completedAt: null
      }
    });
    const grouped = await tx.mailBatchRecipient.groupBy({
      by: ["status"],
      where: { batchId: batch.id },
      _count: { _all: true }
    });
    const count = (
      status:
        | "PENDING"
        | "SENDING"
        | "SENT"
        | "BOUNCED"
        | "SKIPPED"
        | "FAILED"
    ) =>
      grouped.find((row) => row.status === status)?._count
        ._all ?? 0;
    const updated = await tx.mailBatch.update({
      where: { id: batch.id },
      data: {
        status: retried.count > 0 ? "PENDING" : undefined,
        pendingRecipients:
          count("PENDING") + count("SENDING"),
        sentRecipients: count("SENT"),
        skippedRecipients: count("SKIPPED"),
        failedRecipients:
          count("FAILED") + count("BOUNCED"),
        completedAt: retried.count > 0 ? null : undefined
      }
    });
    if (retried.count > 0) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "mail.batch_retried",
          entityType: "MailBatch",
          entityId: batch.id,
          metadata: {
            retriedRecipients: retried.count,
            requestedAt: now.toISOString()
          }
        }
      });
    }
    return { batch: updated, shouldSchedule: retried.count > 0 };
  });

  if (result.shouldSchedule) {
    await input.scheduler.scheduleMailBatch?.({
      batchId: result.batch.id
    });
  }
  return result.batch;
}
