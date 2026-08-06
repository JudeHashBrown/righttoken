import type {
  MailBatchRecipientStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ForbiddenError
} from "@/modules/auth/authorization";
import {
  MailSendBlockedError
} from "@/modules/mail/send-guard";
import {
  reserveBulkMailRecipient,
  senderDomainFromAddress
} from "@/modules/mail/bulk-mail-throttle";
import {
  sendReviewedMail
} from "@/modules/mail/send-reviewed-mail";
import type {
  MailboxAdapter
} from "@/modules/mail/types";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

export type MailBatchJobInput = {
  batchId: string;
};

export type MailBatchDeliveryDependencies = {
  adapter: Pick<MailboxAdapter, "send">;
  random?: () => number;
  reservationNow?: Date;
};

type MailBatchCounts = {
  pending: number;
  sending: number;
  sent: number;
  skipped: number;
  failed: number;
};

const skippedCodes = new Set([
  "RECIPIENT_SUPPRESSED",
  "RECIPIENT_PAUSED",
  "CONTACT_FREQUENCY_LIMIT",
  "SOURCE_USER_DELETED"
]);

async function recipientCounts(
  batchId: string
): Promise<MailBatchCounts> {
  const grouped = await prisma.mailBatchRecipient.groupBy({
    by: ["status"],
    where: { batchId },
    _count: { _all: true }
  });
  const counts: MailBatchCounts = {
    pending: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    failed: 0
  };
  for (const row of grouped) {
    const count = row._count._all;
    if (row.status === "PENDING") counts.pending = count;
    if (row.status === "SENDING") counts.sending = count;
    if (row.status === "SENT") counts.sent = count;
    if (row.status === "SKIPPED") counts.skipped = count;
    if (
      row.status === "FAILED" ||
      row.status === "BOUNCED"
    ) {
      counts.failed += count;
    }
  }
  return counts;
}

async function finishRecipient(
  recipientId: string,
  status: Extract<
    MailBatchRecipientStatus,
    "SKIPPED" | "FAILED"
  >,
  reasonCode: string,
  now: Date
): Promise<void> {
  await prisma.mailBatchRecipient.updateMany({
    where: {
      id: recipientId,
      status: "SENDING"
    },
    data: {
      status,
      reasonCode,
      completedAt: now
    }
  });
}

async function deliverClaimedMailBatchRecipient(
  recipientId: string,
  now: Date,
  dependencies: MailBatchDeliveryDependencies
): Promise<"SENT" | "SKIPPED" | "FAILED"> {
  const recipient =
    await prisma.mailBatchRecipient.findFirstOrThrow({
      where: { id: recipientId, status: "SENDING" },
      select: {
        id: true,
        userId: true,
        emailNormalized: true,
        user: {
          select: { sourceDeletedAt: true }
        },
        batch: {
          select: {
            mailboxId: true,
            createdById: true,
            subject: true,
            purpose: true,
            bodyText: true,
            bodyHtml: true,
            assets: {
              orderBy: { sortOrder: "asc" },
              select: {
                assetId: true,
                disposition: true,
                sortOrder: true
              }
            }
          }
        }
      }
    });
  if (recipient.user.sourceDeletedAt) {
    await finishRecipient(
      recipient.id,
      "SKIPPED",
      "SOURCE_USER_DELETED",
      now
    );
    return "SKIPPED";
  }

  try {
    await sendReviewedMail(
      {
        actorId: recipient.batch.createdById,
        mailboxId: recipient.batch.mailboxId,
        userId: recipient.userId,
        recipient: recipient.emailNormalized,
        subject: recipient.batch.subject,
        purpose: recipient.batch.purpose,
        bodyText: recipient.batch.bodyText,
        bodyHtml: recipient.batch.bodyHtml,
        assets: recipient.batch.assets.map((asset) => ({
          id: asset.assetId,
          disposition: asset.disposition,
          sortOrder: asset.sortOrder
        })),
        minimumContactIntervalMinutes: 24 * 60,
        authorizationScope: "BATCH_SNAPSHOT",
        batchRecipientId: recipient.id,
        now
      },
      dependencies.adapter
    );
    return "SENT";
  } catch (error) {
    if (
      error instanceof MailSendBlockedError &&
      skippedCodes.has(error.code)
    ) {
      await finishRecipient(
        recipient.id,
        "SKIPPED",
        error.code,
        now
      );
      return "SKIPPED";
    }
    await finishRecipient(
      recipient.id,
      "FAILED",
      error instanceof ForbiddenError
        ? "BATCH_CREATOR_UNAVAILABLE"
        : "SMTP_SEND_FAILED",
      now
    );
    return "FAILED";
  }
}

export async function processMailBatch(
  input: MailBatchJobInput,
  now: Date,
  scheduler: TaskScheduler,
  dependencies: MailBatchDeliveryDependencies
): Promise<{
  completed: boolean;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const staleBefore = new Date(
    now.getTime() - 30 * 60_000
  );
  await prisma.mailBatchRecipient.updateMany({
    where: {
      batchId: input.batchId,
      status: "SENDING",
      claimedAt: { lte: staleBefore }
    },
    data: {
      status: "FAILED",
      reasonCode: "SMTP_SEND_FAILED",
      completedAt: now
    }
  });
  await prisma.mailBatch.updateMany({
    where: {
      id: input.batchId,
      startedAt: null
    },
    data: { startedAt: now }
  });
  await prisma.mailBatch.update({
    where: { id: input.batchId },
    data: { status: "RUNNING" }
  });
  const batch = await prisma.mailBatch.findUniqueOrThrow({
    where: { id: input.batchId },
    select: {
      mailbox: { select: { emailAddress: true } }
    }
  });
  const senderDomain = senderDomainFromAddress(
    batch.mailbox.emailAddress
  );
  const reservation = await prisma.$transaction((tx) =>
    reserveBulkMailRecipient(tx, {
      batchId: input.batchId,
      senderDomain,
      ...(dependencies.reservationNow
        ? { now: dependencies.reservationNow }
        : {}),
      random: dependencies.random
    })
  );
  if (reservation.status === "CLAIMED") {
    await deliverClaimedMailBatchRecipient(
      reservation.recipientId,
      reservation.claimedAt,
      dependencies
    );
  }

  const counts = await recipientCounts(input.batchId);
  const completed =
    counts.pending === 0 && counts.sending === 0;
  const status = completed
    ? counts.failed > 0
      ? counts.sent > 0 || counts.skipped > 0
        ? "PARTIAL_FAILURE"
        : "FAILED"
      : "COMPLETED"
    : "RUNNING";
  await prisma.mailBatch.update({
    where: { id: input.batchId },
    data: {
      status,
      pendingRecipients: counts.pending + counts.sending,
      sentRecipients: counts.sent,
      skippedRecipients: counts.skipped,
      failedRecipients: counts.failed,
      completedAt: completed
        ? reservation.status === "CLAIMED"
          ? reservation.claimedAt
          : now
        : null
    }
  });
  if (!completed) {
    let nextRunAt =
      reservation.status === "EMPTY"
        ? undefined
        : reservation.runAt;
    if (
      reservation.status === "EMPTY" &&
      counts.sending > 0
    ) {
      const earliestClaim =
        await prisma.mailBatchRecipient.findFirst({
          where: {
            batchId: input.batchId,
            status: "SENDING",
            claimedAt: { not: null }
          },
          orderBy: { claimedAt: "asc" },
          select: { claimedAt: true }
        });
      nextRunAt = new Date(
        (earliestClaim?.claimedAt?.getTime() ??
          now.getTime()) +
          30 * 60_000
      );
    }
    await scheduler.scheduleMailBatch?.({
      batchId: input.batchId,
      runAt: nextRunAt
    });
  }
  return {
    completed,
    sent: counts.sent,
    skipped: counts.skipped,
    failed: counts.failed
  };
}
