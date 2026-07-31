import { randomUUID } from "node:crypto";
import type { MailMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/authorization";
import type { MailboxAdapter } from "@/modules/mail/types";
import {
  assertMailSendAllowed,
  MailSendBlockedError
} from "@/modules/mail/send-guard";
import {
  resolveOutboundMailAssets,
  type OutboundAssetReference
} from "@/modules/mail/outbound-assets";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";
import {
  plainTextToMailHtml
} from "@/modules/mail/rich-content";
import {
  processMailHtml
} from "@/modules/mail/html-policy";

export type ReviewedMailInput = {
  actorId: string;
  mailboxId: string;
  userId: string;
  taskId?: string;
  recipient: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  assets?: OutboundAssetReference[];
  minimumContactIntervalMinutes: number;
  authorizationScope?: "CURRENT" | "BATCH_SNAPSHOT";
  batchRecipientId?: string;
  now?: Date;
};

export async function sendReviewedMail(
  input: ReviewedMailInput,
  adapter: Pick<MailboxAdapter, "send">,
  dependencies: {
    storage?: MailAssetStorage;
  } = {}
): Promise<{ message: MailMessage; taskId: string }> {
  const now = input.now ?? new Date();
  const recipient = input.recipient.trim().toLowerCase();
  const outboundHtml =
    input.bodyHtml?.trim() ||
    plainTextToMailHtml(input.bodyText);
  const reviewedBodyText =
    processMailHtml(outboundHtml).text;
  const [
    actor,
    mailbox,
    user,
    existingTask,
    batchRecipient
  ] =
    await Promise.all([
    prisma.member.findUniqueOrThrow({
      where: { id: input.actorId },
      select: { id: true, role: true, active: true }
    }),
    prisma.mailbox.findUniqueOrThrow({
      where: { id: input.mailboxId },
      select: { id: true, emailAddress: true, enabled: true }
    }),
    prisma.userProfile.findUniqueOrThrow({
      where: { id: input.userId },
      select: {
        id: true,
        ownerId: true,
        email: true,
        emailNormalized: true,
        unsubscribedAt: true,
        pausedAt: true,
        sourceDeletedAt: true
      }
    }),
    input.taskId
      ? prisma.recallTask.findUniqueOrThrow({
          where: { id: input.taskId },
          select: {
            id: true,
            userId: true,
            assigneeId: true,
            status: true,
            startedAt: true
          }
        })
      : null,
    input.batchRecipientId
      ? prisma.mailBatchRecipient.findUnique({
          where: { id: input.batchRecipientId },
          select: {
            id: true,
            userId: true,
            status: true,
            batch: {
              select: {
                createdById: true,
                mailboxId: true
              }
            }
          }
        })
      : null
    ]);
  if (!actor.active) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  assertMemberPermission(actor, "mail:send-reviewed");
  const authorizedBatchSnapshot =
    input.authorizationScope === "BATCH_SNAPSHOT" &&
    Boolean(batchRecipient) &&
    batchRecipient?.userId === user.id &&
    batchRecipient.batch.createdById === actor.id &&
    batchRecipient.batch.mailboxId === mailbox.id;
  if (
    input.authorizationScope === "BATCH_SNAPSHOT" &&
    !authorizedBatchSnapshot
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (
    existingTask &&
    (existingTask.userId !== user.id ||
      existingTask.status === "COMPLETED" ||
      existingTask.status === "CANCELLED")
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (
    actor.role === "OPERATOR" &&
    !authorizedBatchSnapshot &&
    existingTask?.assigneeId !== actor.id &&
    user.ownerId !== actor.id &&
    user.ownerId !== null
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (!mailbox.enabled) {
    throw new MailSendBlockedError("EMPTY_MESSAGE");
  }
  if (user.sourceDeletedAt) {
    throw new MailSendBlockedError(
      "SOURCE_USER_DELETED"
    );
  }

  const [userSuppressed, recipientSuppressed, lastSent] =
    await Promise.all([
    prisma.suppressionEntry.findUnique({
      where: { emailNormalized: user.emailNormalized },
      select: { id: true }
    }),
    prisma.suppressionEntry.findUnique({
      where: { emailNormalized: recipient },
      select: { id: true }
    }),
    prisma.mailMessage.findFirst({
      where: {
        userId: user.id,
        direction: "OUTBOUND",
        status: "SENT"
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true }
    })
    ]);
  assertMailSendAllowed(
    {
      emailNormalized: user.emailNormalized,
      unsubscribedAt: userSuppressed || recipientSuppressed
        ? now
        : user.unsubscribedAt,
      pausedAt: user.pausedAt
    },
    {
      reviewedById: actor.id,
      subject: input.subject,
      bodyText: reviewedBodyText,
      lastSentAt: lastSent?.sentAt ?? null,
      minimumContactIntervalMinutes:
        input.minimumContactIntervalMinutes
    },
    now
  );

  const task =
    existingTask ??
    (await prisma.recallTask.create({
      data: {
        userId: user.id,
        origin: "MANUAL",
        triggerKey: `manual-mail:${randomUUID()}`,
        ruleVersion: 1,
        title: `主动联系：${input.subject.trim()}`.slice(0, 200),
        reason: "运营人员主动联系用户",
        priority: "NORMAL",
        status: "IN_PROGRESS",
        assigneeId: actor.id,
        assignmentReason: "由发件运营人员创建",
        dueAt: new Date(
          now.getTime() + 24 * 60 * 60 * 1000
        ),
        startedAt: now
      },
      select: {
        id: true,
        userId: true,
        assigneeId: true,
        status: true,
        startedAt: true
      }
    }));
  const thread =
    (await prisma.mailThread.findFirst({
      where: {
        userId: user.id,
        mailboxId: mailbox.id,
        subject: input.subject.trim()
      },
      orderBy: { updatedAt: "desc" }
    })) ??
    (await prisma.mailThread.create({
      data: {
        userId: user.id,
        mailboxId: mailbox.id,
        subject: input.subject.trim()
      }
    }));
  const richContent = await resolveOutboundMailAssets(
    {
      bodyHtml: outboundHtml,
      assets: input.assets ?? []
    },
    {
      database: prisma,
      ...(dependencies.storage
        ? { storage: dependencies.storage }
        : {})
    }
  );
  const draft = await prisma.mailMessage.create({
    data: {
      mailboxId: mailbox.id,
      threadId: thread.id,
      userId: user.id,
      taskId: task.id,
      direction: "OUTBOUND",
      status: "DRAFT",
      references: [],
      fromAddress: mailbox.emailAddress,
      toAddresses: [recipient],
      subject: input.subject.trim(),
      bodyText: richContent.bodyText,
      bodyHtml: richContent.bodyHtml,
      reviewedById: actor.id,
      assets: {
        create: richContent.messageAssets
      }
    }
  });

  let delivery: { providerMessageId: string };
  try {
    delivery = await adapter.send({
      to: [recipient],
      subject: draft.subject,
      text: draft.bodyText,
      html: richContent.html,
      attachments: richContent.attachments
    });
  } catch {
    await prisma.mailMessage.update({
      where: { id: draft.id },
      data: {
        status: "FAILED",
        lastErrorCode: "SMTP_SEND_FAILED"
      }
    });
    throw new Error("SMTP_SEND_FAILED");
  }

  const message = await prisma.$transaction(async (tx) => {
    const sent = await tx.mailMessage.update({
      where: { id: draft.id },
      data: {
        status: "SENT",
        providerMessageId: delivery.providerMessageId,
        sentAt: now,
        lastErrorCode: null
      }
    });
    if (input.batchRecipientId) {
      await tx.mailBatchRecipient.update({
        where: { id: input.batchRecipientId },
        data: {
          status: "SENT",
          reasonCode: null,
          messageId: sent.id,
          taskId: task.id,
          completedAt: now
        }
      });
    }
    await tx.recallTask.update({
      where: { id: task.id },
      data: {
        status: "WAITING_USER",
        startedAt: task.startedAt ?? now
      }
    });
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        action: "task.waiting_user",
        detail: {
          from: task.status,
          to: "WAITING_USER",
          source: "mail.reviewed_sent"
        }
      }
    });
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        action: "mail.reviewed_sent",
        detail: {
          messageId: sent.id,
          mailboxId: mailbox.id
        }
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "mail.reviewed_sent",
        entityType: "MailMessage",
        entityId: sent.id,
        metadata: {
          taskId: task.id,
          mailboxId: mailbox.id,
          recipientOverridden:
            recipient !== user.email.trim().toLowerCase(),
          recipientDomain:
            recipient.split("@")[1] ?? "unknown",
          originalRecipientDomain:
            user.email.trim().toLowerCase().split("@")[1] ??
            "unknown"
        }
      }
    });
    return sent;
  });
  return { message, taskId: task.id };
}
