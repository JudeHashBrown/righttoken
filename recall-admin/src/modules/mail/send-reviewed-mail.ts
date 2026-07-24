import type { MailMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertMemberPermission, ForbiddenError } from "@/modules/auth/guards";
import type { MailboxAdapter } from "@/modules/mail/types";
import {
  assertMailSendAllowed,
  MailSendBlockedError
} from "@/modules/mail/send-guard";

export type ReviewedMailInput = {
  actorId: string;
  mailboxId: string;
  taskId: string;
  subject: string;
  bodyText: string;
  minimumContactIntervalMinutes: number;
  now?: Date;
};

export async function sendReviewedMail(
  input: ReviewedMailInput,
  adapter: Pick<MailboxAdapter, "send">
): Promise<MailMessage> {
  const now = input.now ?? new Date();
  const [actor, mailbox, task] = await Promise.all([
    prisma.member.findUniqueOrThrow({
      where: { id: input.actorId },
      select: { id: true, role: true, active: true }
    }),
    prisma.mailbox.findUniqueOrThrow({
      where: { id: input.mailboxId },
      select: { id: true, emailAddress: true, enabled: true }
    }),
    prisma.recallTask.findUniqueOrThrow({
      where: { id: input.taskId },
      select: {
        id: true,
        assigneeId: true,
        user: {
          select: {
            id: true,
            ownerId: true,
            email: true,
            emailNormalized: true,
            unsubscribedAt: true,
            pausedAt: true
          }
        }
      }
    })
  ]);
  if (!actor.active) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  assertMemberPermission(actor, "mail:send-reviewed");
  if (
    actor.role === "OPERATOR" &&
    task.assigneeId !== actor.id &&
    task.user.ownerId !== actor.id
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (!mailbox.enabled) {
    throw new MailSendBlockedError("EMPTY_MESSAGE");
  }

  const [suppressed, lastSent] = await Promise.all([
    prisma.suppressionEntry.findUnique({
      where: { emailNormalized: task.user.emailNormalized },
      select: { id: true }
    }),
    prisma.mailMessage.findFirst({
      where: {
        userId: task.user.id,
        direction: "OUTBOUND",
        status: "SENT"
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true }
    })
  ]);
  assertMailSendAllowed(
    {
      emailNormalized: task.user.emailNormalized,
      unsubscribedAt: suppressed
        ? now
        : task.user.unsubscribedAt,
      pausedAt: task.user.pausedAt
    },
    {
      reviewedById: actor.id,
      subject: input.subject,
      bodyText: input.bodyText,
      lastSentAt: lastSent?.sentAt ?? null,
      minimumContactIntervalMinutes:
        input.minimumContactIntervalMinutes
    },
    now
  );

  const thread =
    (await prisma.mailThread.findFirst({
      where: {
        userId: task.user.id,
        mailboxId: mailbox.id,
        subject: input.subject.trim()
      },
      orderBy: { updatedAt: "desc" }
    })) ??
    (await prisma.mailThread.create({
      data: {
        userId: task.user.id,
        mailboxId: mailbox.id,
        subject: input.subject.trim()
      }
    }));
  const draft = await prisma.mailMessage.create({
    data: {
      mailboxId: mailbox.id,
      threadId: thread.id,
      userId: task.user.id,
      taskId: task.id,
      direction: "OUTBOUND",
      status: "DRAFT",
      references: [],
      fromAddress: mailbox.emailAddress,
      toAddresses: [task.user.email],
      subject: input.subject.trim(),
      bodyText: input.bodyText.trim(),
      reviewedById: actor.id
    }
  });

  let delivery: { providerMessageId: string };
  try {
    delivery = await adapter.send({
      to: [task.user.email],
      subject: draft.subject,
      text: draft.bodyText
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

  return prisma.$transaction(async (tx) => {
    const sent = await tx.mailMessage.update({
      where: { id: draft.id },
      data: {
        status: "SENT",
        providerMessageId: delivery.providerMessageId,
        sentAt: now,
        lastErrorCode: null
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
          recipientDomain:
            task.user.emailNormalized.split("@")[1] ?? "unknown"
        }
      }
    });
    return sent;
  });
}
