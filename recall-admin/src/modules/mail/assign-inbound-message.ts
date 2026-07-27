import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import {
  replyTriggerKey
} from "@/modules/mail/reply-task-key";
import {
  createTaskNotificationIntents
} from "@/modules/notifications/notification-service";

export class MailMessageAssignmentError extends Error {
  constructor() {
    super("mail message is already assigned to another user");
    this.name = "MailMessageAssignmentError";
  }
}

export async function assignInboundMessage(input: {
  actorId: string;
  messageId: string;
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [actor, message, user] = await Promise.all([
    prisma.member.findUniqueOrThrow({
      where: { id: input.actorId },
      select: { id: true, role: true, active: true }
    }),
    prisma.mailMessage.findUniqueOrThrow({
      where: { id: input.messageId },
      select: {
        id: true,
        mailboxId: true,
        threadId: true,
        userId: true,
        direction: true,
        status: true,
        providerMessageId: true,
        subject: true,
        receivedAt: true
      }
    }),
    prisma.userProfile.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, ownerId: true }
    })
  ]);
  if (!actor.active) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  assertMemberPermission(actor, "mail:send-reviewed");
  if (
    actor.role === "OPERATOR" &&
    user.ownerId &&
    user.ownerId !== actor.id
  ) {
    throw new ForbiddenError("mail:send-reviewed");
  }
  if (message.direction !== "INBOUND") {
    throw new MailMessageAssignmentError();
  }
  if (message.userId && message.userId !== user.id) {
    throw new MailMessageAssignmentError();
  }

  const triggerKey = replyTriggerKey(
    message.providerMessageId ?? message.id
  );
  if (message.userId === user.id && message.threadId) {
    const [thread, task, currentMessage] = await Promise.all([
      prisma.mailThread.findUniqueOrThrow({
        where: { id: message.threadId }
      }),
      prisma.recallTask.findUniqueOrThrow({
        where: {
          userId_triggerKey_ruleVersion: {
            userId: user.id,
            triggerKey,
            ruleVersion: 1
          }
        }
      }),
      prisma.mailMessage.findUniqueOrThrow({
        where: { id: message.id }
      })
    ]);
    return { message: currentMessage, thread, task };
  }

  let taskCreated = false;
  const result = await prisma.$transaction(async (tx) => {
    const thread =
      (await tx.mailThread.findFirst({
        where: {
          userId: user.id,
          mailboxId: message.mailboxId,
          subject: message.subject
        },
        orderBy: { updatedAt: "desc" }
      })) ??
      (await tx.mailThread.create({
        data: {
          userId: user.id,
          mailboxId: message.mailboxId,
          subject: message.subject
        }
      }));
    const assigned = await tx.mailMessage.update({
      where: { id: message.id },
      data: {
        threadId: thread.id,
        userId: user.id,
        status: "RECEIVED",
        lastErrorCode: null
      }
    });
    const existingTask = await tx.recallTask.findUnique({
      where: {
        userId_triggerKey_ruleVersion: {
          userId: user.id,
          triggerKey,
          ruleVersion: 1
        }
      }
    });
    const task =
      existingTask ??
      (await tx.recallTask.create({
        data: {
          userId: user.id,
          origin: "EMAIL_REPLY",
          triggerKey,
          ruleVersion: 1,
          title: `用户邮件回复：${message.subject}`.slice(0, 200),
          reason: "用户回复了运营邮件，需要人工处理",
          priority: "IMPORTANT",
          status: "UNASSIGNED",
          dueAt: new Date(
            (message.receivedAt ?? now).getTime() +
              4 * 60 * 60 * 1000
          )
        }
      }));
    taskCreated = !existingTask;
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "mail.inbound_assigned",
        entityType: "MailMessage",
        entityId: assigned.id,
        metadata: {
          userId: user.id,
          threadId: thread.id,
          taskId: task.id
        }
      }
    });
    return { message: assigned, thread, task };
  });
  if (taskCreated) {
    await createTaskNotificationIntents(result.task.id, now);
  }
  return result;
}
