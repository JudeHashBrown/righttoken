import type { MailMessage } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import type { MailboxAdapter } from "@/modules/mail/types";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";
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

export type ThreadReplyInput = {
  actorId: string;
  threadId: string;
  taskId: string;
  mailboxId: string;
  recipient: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  assets?: OutboundAssetReference[];
  templateId: string | null;
  minimumContactIntervalMinutes: number;
  now?: Date;
};

function uniqueMessageIds(values: Array<string | null>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ];
}

export async function replyToMailThread(
  input: ThreadReplyInput,
  adapter: Pick<MailboxAdapter, "send">,
  dependencies: {
    storage?: MailAssetStorage;
  } = {}
): Promise<MailMessage> {
  const now = input.now ?? new Date();
  const recipient = input.recipient.trim().toLowerCase();
  const outboundHtml =
    input.bodyHtml?.trim() ||
    plainTextToMailHtml(input.bodyText);
  const reviewedBodyText =
    processMailHtml(outboundHtml).text;
  const [actor, mailbox, task, thread, template] =
    await Promise.all([
      prisma.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      prisma.mailbox.findFirstOrThrow({
        where: {
          id: input.mailboxId,
          ...configuredMailboxWhere
        },
        select: { id: true, emailAddress: true, enabled: true }
      }),
      prisma.recallTask.findUniqueOrThrow({
        where: { id: input.taskId },
        select: {
          id: true,
          userId: true,
          assigneeId: true
        }
      }),
      prisma.mailThread.findUniqueOrThrow({
        where: { id: input.threadId },
        select: {
          id: true,
          userId: true,
          mailboxId: true,
          user: {
            select: {
              id: true,
              ownerId: true,
              email: true,
              emailNormalized: true,
              unsubscribedAt: true,
              pausedAt: true
            }
          },
          messages: {
            where: { providerMessageId: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              providerMessageId: true,
              inReplyTo: true,
              references: true
            }
          }
        }
      }),
      input.templateId
        ? prisma.mailTemplate.findUniqueOrThrow({
            where: { id: input.templateId },
            select: {
              id: true,
              key: true,
              version: true,
              archivedAt: true
            }
          })
        : Promise.resolve(null)
    ]);

  if (!actor.active) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  assertMemberPermission(actor, "mail:send-reviewed");
  if (
    thread.userId !== task.userId ||
    thread.mailboxId !== mailbox.id
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (
    actor.role === "OPERATOR" &&
    task.assigneeId !== actor.id &&
    thread.user.ownerId !== actor.id
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (!mailbox.enabled) {
    throw new MailSendBlockedError("EMPTY_MESSAGE");
  }
  if (template?.archivedAt) {
    throw new MailSendBlockedError("EMPTY_MESSAGE");
  }

  const [userSuppressed, recipientSuppressed, lastSent] =
    await Promise.all([
      prisma.suppressionEntry.findUnique({
        where: {
          emailNormalized: thread.user.emailNormalized
        },
        select: { id: true }
      }),
      prisma.suppressionEntry.findUnique({
        where: { emailNormalized: recipient },
        select: { id: true }
      }),
      prisma.mailMessage.findFirst({
        where: {
          userId: thread.user.id,
          direction: "OUTBOUND",
          status: "SENT"
        },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true }
      })
    ]);
  assertMailSendAllowed(
    {
      emailNormalized: thread.user.emailNormalized,
      unsubscribedAt: userSuppressed || recipientSuppressed
        ? now
        : thread.user.unsubscribedAt,
      pausedAt: thread.user.pausedAt
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

  const latest = thread.messages[0] ?? null;
  const inReplyTo = latest?.providerMessageId ?? null;
  const references = uniqueMessageIds([
    ...(latest?.references ?? []),
    latest?.inReplyTo ?? null,
    inReplyTo
  ]);
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
      userId: thread.user.id,
      taskId: task.id,
      direction: "OUTBOUND",
      status: "DRAFT",
      inReplyTo,
      references,
      fromAddress: mailbox.emailAddress,
      toAddresses: [recipient],
      subject: input.subject.trim(),
      bodyText: richContent.bodyText,
      bodyHtml: richContent.bodyHtml,
      templateKey: template?.key ?? null,
      templateVersion: template?.version ?? null,
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
      attachments: richContent.attachments,
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references.length ? { references } : {})
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
        action: "mail.thread_replied",
        detail: {
          messageId: sent.id,
          mailboxId: mailbox.id,
          threadId: thread.id,
          templateId: template?.id ?? null
        }
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "mail.thread_replied",
        entityType: "MailMessage",
        entityId: sent.id,
        metadata: {
          taskId: task.id,
          mailboxId: mailbox.id,
          threadId: thread.id,
          templateKey: template?.key ?? null,
          templateVersion: template?.version ?? null,
          recipientDomain:
            recipient.split("@")[1] ?? "unknown"
        }
      }
    });
    return sent;
  });
}
