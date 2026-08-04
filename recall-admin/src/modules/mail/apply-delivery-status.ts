import type { Prisma } from "@/generated/prisma/client";
import type {
  DeliveryStatusRecipient
} from "@/modules/mail/delivery-status";

export type ApplyDeliveryStatusInput = {
  mailboxId: string;
  outboundMessageId: string;
  inboundProviderMessageId: string;
  recipient: DeliveryStatusRecipient;
  reportedAt: Date;
};

export type ApplyDeliveryStatusResult = {
  eventCreated: boolean;
  finalBounce: boolean;
  delayedDelivery: boolean;
};

async function updateBatchState(
  tx: Prisma.TransactionClient,
  messageId: string,
  recipient: DeliveryStatusRecipient,
  reportedAt: Date
): Promise<void> {
  const changed = await tx.mailBatchRecipient.updateMany({
    where: { messageId, status: "SENT" },
    data: {
      status: "BOUNCED",
      reasonCode: "FINAL_BOUNCE",
      bouncedAt: reportedAt,
      bounceStatusCode: recipient.statusCode,
      bounceDiagnostic: recipient.diagnosticCode
    }
  });
  if (changed.count === 0) return;

  const batchRecipient =
    await tx.mailBatchRecipient.findUniqueOrThrow({
      where: { messageId },
      select: { batchId: true }
    });
  const grouped = await tx.mailBatchRecipient.groupBy({
    by: ["status"],
    where: { batchId: batchRecipient.batchId },
    _count: { _all: true }
  });
  const count = (status: (typeof grouped)[number]["status"]) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;
  const pending = count("PENDING") + count("SENDING");
  const sent = count("SENT");
  const skipped = count("SKIPPED");
  const failed = count("FAILED") + count("BOUNCED");
  const status =
    pending > 0
      ? "RUNNING"
      : failed === 0
        ? "COMPLETED"
        : sent > 0 || skipped > 0
          ? "PARTIAL_FAILURE"
          : "FAILED";
  await tx.mailBatch.update({
    where: { id: batchRecipient.batchId },
    data: {
      status,
      pendingRecipients: pending,
      sentRecipients: sent,
      skippedRecipients: skipped,
      failedRecipients: failed
    }
  });
}

async function reopenLatestWaitingTask(
  tx: Prisma.TransactionClient,
  message: {
    id: string;
    taskId: string | null;
    userId: string | null;
  },
  input: ApplyDeliveryStatusInput
): Promise<void> {
  if (!message.taskId || !message.userId) return;
  const lockedTask = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status"::text AS "status"
    FROM "recall"."RecallTask"
    WHERE "id" = ${message.taskId}
      AND "userId" = ${message.userId}
    FOR UPDATE
  `;
  if (lockedTask[0]?.status !== "WAITING_USER") return;
  const latest = await tx.mailMessage.findFirst({
    where: {
      taskId: message.taskId,
      userId: message.userId,
      direction: "OUTBOUND",
      sentAt: { not: null }
    },
    orderBy: [
      { sentAt: "desc" },
      { createdAt: "desc" },
      { id: "desc" }
    ],
    select: { id: true }
  });
  if (latest?.id !== message.id) return;
  const reopened = await tx.recallTask.updateMany({
    where: {
      id: message.taskId,
      userId: message.userId,
      status: "WAITING_USER"
    },
    data: { status: "IN_PROGRESS" }
  });
  if (reopened.count === 0) return;
  await tx.taskActivity.create({
    data: {
      taskId: message.taskId,
      action: "mail.final_bounced",
      detail: {
        messageId: message.id,
        reportedAt: input.reportedAt.toISOString(),
        statusCode: input.recipient.statusCode
      }
    }
  });
}

export async function applyDeliveryStatus(
  tx: Prisma.TransactionClient,
  input: ApplyDeliveryStatusInput
): Promise<ApplyDeliveryStatusResult> {
  const inserted = await tx.mailDeliveryEvent.createMany({
    data: {
      mailboxId: input.mailboxId,
      outboundMessageId: input.outboundMessageId,
      inboundProviderMessageId: input.inboundProviderMessageId,
      action: input.recipient.action,
      recipientNormalized: input.recipient.recipientNormalized,
      statusCode: input.recipient.statusCode,
      diagnosticCode: input.recipient.diagnosticCode,
      reportedAt: input.reportedAt
    },
    skipDuplicates: true
  });
  if (inserted.count === 0) {
    return {
      eventCreated: false,
      finalBounce: false,
      delayedDelivery: false
    };
  }
  if (input.recipient.action !== "FAILED") {
    return {
      eventCreated: true,
      finalBounce: false,
      delayedDelivery: input.recipient.action === "DELAYED"
    };
  }

  const changed = await tx.mailMessage.updateMany({
    where: { id: input.outboundMessageId, status: "SENT" },
    data: {
      status: "BOUNCED",
      bouncedAt: input.reportedAt,
      bounceStatusCode: input.recipient.statusCode,
      bounceDiagnostic: input.recipient.diagnosticCode,
      lastErrorCode: "FINAL_BOUNCE"
    }
  });
  if (changed.count === 0) {
    return {
      eventCreated: true,
      finalBounce: false,
      delayedDelivery: false
    };
  }

  const message = await tx.mailMessage.findUniqueOrThrow({
    where: { id: input.outboundMessageId },
    select: { id: true, taskId: true, userId: true }
  });
  await updateBatchState(
    tx,
    message.id,
    input.recipient,
    input.reportedAt
  );
  await reopenLatestWaitingTask(tx, message, input);
  await tx.auditLog.create({
    data: {
      action: "MAIL_FINAL_BOUNCE_MATCHED",
      entityType: "MailMessage",
      entityId: message.id,
      metadata: {
        mailboxId: input.mailboxId,
        recipient: input.recipient.recipientNormalized,
        statusCode: input.recipient.statusCode,
        reportedAt: input.reportedAt.toISOString()
      }
    }
  });
  return {
    eventCreated: true,
    finalBounce: true,
    delayedDelivery: false
  };
}
