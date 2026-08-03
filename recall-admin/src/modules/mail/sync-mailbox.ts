import { prisma } from "@/lib/db/prisma";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";
import {
  matchInboundReply,
  type OutboundReplyCandidate
} from "@/modules/mail/reply-matcher";
import type { MailboxAdapter } from "@/modules/mail/types";
import { createTaskNotificationIntents } from "@/modules/notifications/notification-service";
import {
  replyTriggerKey
} from "@/modules/mail/reply-task-key";
import {
  discardPreparedInboundAssets,
  prepareInboundMailAssets,
  type PreparedInboundMessage
} from "@/modules/mail/inbound-assets";
import {
  getMailAssetStorage
} from "@/modules/mail/assets/storage-factory";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";

type SyncResult = {
  received: number;
  matched: number;
  unmatched: number;
  replyTasksCreated: number;
  replyTasksReopened: number;
};

export async function syncMailbox(
  mailboxId: string,
  adapter: Pick<MailboxAdapter, "listMessagesSince">,
  now = new Date(),
  dependencies: {
    storage?: MailAssetStorage;
  } = {}
): Promise<SyncResult> {
  const mailbox = await prisma.mailbox.findFirstOrThrow({
    where: { id: mailboxId, ...configuredMailboxWhere },
    select: {
      id: true,
      emailAddress: true,
      enabled: true,
      lastSyncedAt: true
    }
  });
  if (!mailbox.enabled) {
    return {
      received: 0,
      matched: 0,
      unmatched: 0,
      replyTasksCreated: 0,
      replyTasksReopened: 0
    };
  }
  const since = mailbox.lastSyncedAt
    ? new Date(mailbox.lastSyncedAt.getTime() - 5 * 60 * 1000)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inbound = await adapter.listMessagesSince(since);
  const providerIds = inbound.map(
    (message) => message.providerMessageId
  );
  const [existing, outboundRows] = await Promise.all([
    prisma.mailMessage.findMany({
      where: { providerMessageId: { in: providerIds } },
      select: { providerMessageId: true }
    }),
    prisma.mailMessage.findMany({
      where: {
        mailboxId,
        direction: "OUTBOUND",
        status: "SENT",
        sentAt: {
          gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        },
        providerMessageId: { not: null },
        threadId: { not: null }
      },
      select: {
        threadId: true,
        taskId: true,
        providerMessageId: true,
        toAddresses: true,
        fromAddress: true,
        subject: true,
        sentAt: true
      }
    })
  ]);
  const existingIds = new Set(
    existing
      .map((message) => message.providerMessageId)
      .filter((value): value is string => Boolean(value))
  );
  const storage =
    dependencies.storage ?? getMailAssetStorage();
  const newInbound = inbound.filter(
    (message) => !existingIds.has(message.providerMessageId)
  );
  const preparedByProviderId = new Map<
    string,
    PreparedInboundMessage
  >();
  for (const message of newInbound) {
    preparedByProviderId.set(
      message.providerMessageId,
      await prepareInboundMailAssets(message, { storage })
    );
  }
  const outbound: OutboundReplyCandidate[] = outboundRows.flatMap(
    (message) =>
      message.threadId &&
      message.providerMessageId &&
      message.sentAt &&
      message.toAddresses[0]
        ? [
            {
              threadId: message.threadId,
              taskId: message.taskId,
              providerMessageId: message.providerMessageId,
              recipientAddress: message.toAddresses[0],
              mailboxAddress: message.fromAddress,
              subject: message.subject,
              sentAt: message.sentAt
            }
          ]
        : []
  );

  const notificationTaskIds: string[] = [];
  let result: SyncResult;
  try {
    result = await prisma.$transaction(async (tx) => {
    const result: SyncResult = {
      received: 0,
      matched: 0,
      unmatched: 0,
      replyTasksCreated: 0,
      replyTasksReopened: 0
    };
    for (const message of inbound) {
      if (existingIds.has(message.providerMessageId)) {
        continue;
      }
      const prepared = preparedByProviderId.get(
        message.providerMessageId
      );
      result.received += 1;
      const match = matchInboundReply(
        {
          providerMessageId: message.providerMessageId,
          inReplyTo: message.inReplyTo,
          references: message.references,
          fromAddress: message.fromAddress,
          mailboxAddress: mailbox.emailAddress,
          subject: message.subject,
          receivedAt: message.receivedAt
        },
        outbound
      );
      if (match.kind === "UNMATCHED") {
        result.unmatched += 1;
        await tx.mailMessage.create({
          data: {
            mailboxId,
            direction: "INBOUND",
            status: "UNMATCHED",
            providerMessageId: message.providerMessageId,
            inReplyTo: message.inReplyTo,
            references: message.references,
            fromAddress: message.fromAddress,
            toAddresses: message.toAddresses,
            subject: message.subject,
            bodyText: message.bodyText,
            bodyHtml: prepared?.bodyHtml ?? null,
            externalImagesBlocked:
              prepared?.externalImagesBlocked ?? false,
            receivedAt: message.receivedAt,
            lastErrorCode: match.reason,
            assets: prepared?.assets.length
              ? {
                  create: prepared.assets.map(
                    ({ assetId, disposition, cid, sortOrder }) => ({
                      assetId,
                      disposition,
                      cid,
                      sortOrder
                    })
                  )
                }
              : undefined
          }
        });
        continue;
      }

      result.matched += 1;
      const thread = await tx.mailThread.findUniqueOrThrow({
        where: { id: match.threadId },
        select: { id: true, userId: true }
      });
      await tx.mailMessage.create({
        data: {
          mailboxId,
          threadId: thread.id,
          userId: thread.userId,
          direction: "INBOUND",
          status: "RECEIVED",
          providerMessageId: message.providerMessageId,
          inReplyTo: message.inReplyTo,
          references: message.references,
          fromAddress: message.fromAddress,
          toAddresses: message.toAddresses,
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: prepared?.bodyHtml ?? null,
          externalImagesBlocked:
            prepared?.externalImagesBlocked ?? false,
          assets: prepared?.assets.length
            ? {
                create: prepared.assets.map(
                  ({ assetId, disposition, cid, sortOrder }) => ({
                    assetId,
                    disposition,
                    cid,
                    sortOrder
                  })
                )
              }
            : undefined,
          receivedAt: message.receivedAt
        }
      });
      const waitingTask = match.taskId
        ? await tx.recallTask.findFirst({
            where: {
              id: match.taskId,
              userId: thread.userId,
              status: "WAITING_USER"
            },
            select: { id: true }
          })
        : null;
      if (waitingTask) {
        await tx.recallTask.update({
          where: { id: waitingTask.id },
          data: { status: "IN_PROGRESS" }
        });
        await tx.taskActivity.create({
          data: {
            taskId: waitingTask.id,
            action: "task.user_replied",
            detail: {
              providerMessageId: message.providerMessageId
            }
          }
        });
        notificationTaskIds.push(waitingTask.id);
        result.replyTasksReopened += 1;
      } else {
        const created = await tx.recallTask.create({
          data: {
            userId: thread.userId,
            origin: "EMAIL_REPLY",
            triggerKey: replyTriggerKey(
              message.providerMessageId
            ),
            ruleVersion: 1,
            title: `用户邮件回复：${message.subject}`.slice(
              0,
              200
            ),
            reason: "用户回复了运营邮件，需要人工处理",
            priority: "IMPORTANT",
            status: "UNASSIGNED",
            dueAt: new Date(
              message.receivedAt.getTime() +
                4 * 60 * 60 * 1000
            )
          }
        });
        notificationTaskIds.push(created.id);
        result.replyTasksCreated += 1;
      }
    }
    await tx.mailbox.update({
      where: { id: mailboxId },
      data: {
        lastSyncedAt: now,
        lastSuccessAt: now,
        lastErrorCode: null
      }
    });
      return result;
    });
  } catch (error) {
    await discardPreparedInboundAssets(
      [...preparedByProviderId.values()],
      storage
    );
    throw error;
  }
  await Promise.all(
    notificationTaskIds.map((taskId) =>
      createTaskNotificationIntents(taskId, now)
    )
  );
  return result;
}
