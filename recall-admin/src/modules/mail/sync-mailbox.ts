import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";
import {
  matchInboundReply,
  type OutboundReplyCandidate
} from "@/modules/mail/reply-matcher";
import type {
  MailboxAdapter,
  MailboxMessage
} from "@/modules/mail/types";
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
import {
  inspectDeliveryStatus,
  type DeliveryStatusInspection
} from "@/modules/mail/delivery-status";
import {
  matchDeliveryStatusRecipient,
  normalizeDeliveryMessageId,
  normalizeDeliverySubject,
  type OutboundDeliveryCandidate
} from "@/modules/mail/delivery-status-matcher";
import {
  applyDeliveryStatus
} from "@/modules/mail/apply-delivery-status";

type SyncResult = {
  received: number;
  matched: number;
  unmatched: number;
  replyTasksCreated: number;
  replyTasksReopened: number;
  deliveryEvents: number;
  finalBounces: number;
  delayedDeliveries: number;
  unmatchedBounces: number;
};

function emptySyncResult(): SyncResult {
  return {
    received: 0,
    matched: 0,
    unmatched: 0,
    replyTasksCreated: 0,
    replyTasksReopened: 0,
    deliveryEvents: 0,
    finalBounces: 0,
    delayedDeliveries: 0,
    unmatchedBounces: 0
  };
}

const MAIL_SYNC_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000
} as const;

const MAIL_SYNC_ADVISORY_LOCK = "righttoken:mail-sync";

export function uniqueMailboxMessages<
  T extends Pick<MailboxMessage, "providerMessageId">
>(messages: T[]): T[] {
  return [
    ...new Map(
      messages.map((message) => [
        message.providerMessageId,
        message
      ])
    ).values()
  ];
}

export async function syncMailbox(
  mailboxId: string,
  adapter: Pick<MailboxAdapter, "listMessagesSince">,
  configurationVersion: number,
  now = new Date(),
  dependencies: {
    storage?: MailAssetStorage;
  } = {}
): Promise<SyncResult> {
  const mailbox = await prisma.mailbox.findFirstOrThrow({
    where: {
      id: mailboxId,
      configurationVersion,
      ...configuredMailboxWhere
    },
    select: {
      id: true,
      emailAddress: true,
      enabled: true,
      lastSyncedAt: true
    }
  });
  if (!mailbox.enabled) {
    return emptySyncResult();
  }
  const since = mailbox.lastSyncedAt
    ? new Date(mailbox.lastSyncedAt.getTime() - 5 * 60 * 1000)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inbound = uniqueMailboxMessages(
    await adapter.listMessagesSince(since)
  );
  const deliveryInspectionByProviderId = new Map<
    string,
    DeliveryStatusInspection
  >(
    inbound.map((message) => [
      message.providerMessageId,
      inspectDeliveryStatus(message)
    ])
  );
  const exactOutboundMessageIds = [
    ...new Set(
      [...deliveryInspectionByProviderId.values()].flatMap(
        (inspection) =>
          inspection.kind === "PARSED"
            ? inspection.deliveryStatus.recipients.flatMap(
                (recipient) =>
                  recipient.originalMessageId
                    ? [recipient.originalMessageId]
                    : []
              )
            : []
      )
    )
  ];
  const normalizedExactOutboundMessageIds = exactOutboundMessageIds
    .map(normalizeDeliveryMessageId)
    .filter((value): value is string => Boolean(value));
  const historicalExactCandidates =
    normalizedExactOutboundMessageIds.length > 0
      ? await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM "recall"."MailMessage"
          WHERE "mailboxId" = ${mailboxId}
            AND "direction" = 'OUTBOUND'::"recall"."MailDirection"
            AND "status" IN (
              'SENT'::"recall"."MailMessageStatus",
              'BOUNCED'::"recall"."MailMessageStatus"
            )
            AND "sentAt" IS NOT NULL
            AND LOWER(TRIM(BOTH '<>' FROM BTRIM("providerMessageId")))
              IN (${Prisma.join(normalizedExactOutboundMessageIds)})
        `)
      : [];
  const providerIds = inbound.map(
    (message) => message.providerMessageId
  );
  const [existing, existingDeliveryEvents, outboundRows] =
    await Promise.all([
    prisma.mailMessage.findMany({
      where: { providerMessageId: { in: providerIds } },
      select: { providerMessageId: true }
    }),
    prisma.mailDeliveryEvent.findMany({
      where: { inboundProviderMessageId: { in: providerIds } },
      distinct: ["inboundProviderMessageId"],
      select: { inboundProviderMessageId: true }
    }),
    prisma.mailMessage.findMany({
      where: {
        mailboxId,
        direction: "OUTBOUND",
        status: { in: ["SENT", "BOUNCED"] },
        sentAt: { not: null },
        providerMessageId: { not: null },
        OR: [
          {
            sentAt: {
              gte: new Date(
                now.getTime() - 30 * 24 * 60 * 60 * 1000
              )
            }
          },
          ...(historicalExactCandidates.length > 0
            ? [
                {
                  id: {
                    in: historicalExactCandidates.map(
                      (candidate) => candidate.id
                    )
                  }
                }
              ]
            : [])
        ]
      },
      select: {
        id: true,
        mailboxId: true,
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
    [
      ...existing.map((message) => message.providerMessageId),
      ...existingDeliveryEvents.map(
        (event) => event.inboundProviderMessageId
      )
    ]
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
    if (
      deliveryInspectionByProviderId.get(
        message.providerMessageId
      )?.kind !== "NOT_DSN"
    ) {
      continue;
    }
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
  const deliveryCandidates: OutboundDeliveryCandidate[] =
    outboundRows.flatMap((message) =>
      message.providerMessageId &&
      message.sentAt &&
      message.toAddresses[0]
        ? [
            {
              messageId: message.id,
              providerMessageId: message.providerMessageId,
              mailboxId: message.mailboxId,
              recipientNormalized:
                message.toAddresses[0].trim().toLowerCase(),
              normalizedSubject: normalizeDeliverySubject(
                message.subject
              ),
              sentAt: message.sentAt
            }
          ]
        : []
    );

  const notificationTaskIds: string[] = [];
  const skippedPrepared: PreparedInboundMessage[] = [];
  let result: SyncResult;
  try {
    result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${MAIL_SYNC_ADVISORY_LOCK}, 0)
      )::text AS "locked"
    `;
    const [currentExisting, currentDeliveryEvents] =
      await Promise.all([
        tx.mailMessage.findMany({
          where: { providerMessageId: { in: providerIds } },
          select: { providerMessageId: true }
        }),
        tx.mailDeliveryEvent.findMany({
          where: {
            inboundProviderMessageId: { in: providerIds }
          },
          distinct: ["inboundProviderMessageId"],
          select: { inboundProviderMessageId: true }
        })
      ]);
    const currentExistingIds = new Set(
      [
        ...currentExisting.map(
          (message) => message.providerMessageId
        ),
        ...currentDeliveryEvents.map(
          (event) => event.inboundProviderMessageId
        )
      ]
        .filter((value): value is string => Boolean(value))
    );
    const result = emptySyncResult();
    for (const message of inbound) {
      if (currentExistingIds.has(message.providerMessageId)) {
        const prepared = preparedByProviderId.get(
          message.providerMessageId
        );
        if (prepared) {
          skippedPrepared.push(prepared);
        }
        continue;
      }
      const prepared = preparedByProviderId.get(
        message.providerMessageId
      );
      result.received += 1;
      const deliveryInspection = deliveryInspectionByProviderId.get(
        message.providerMessageId
      );
      if (deliveryInspection?.kind === "MALFORMED") {
        result.unmatched += 1;
        result.unmatchedBounces += 1;
        const unmatched = await tx.mailMessage.create({
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
            bodyHtml: null,
            receivedAt: message.receivedAt,
            lastErrorCode: "DELIVERY_STATUS_MALFORMED"
          }
        });
        await tx.auditLog.create({
          data: {
            action: "MAIL_BOUNCE_UNMATCHED",
            entityType: "MailMessage",
            entityId: unmatched.id,
            metadata: {
              mailboxId,
              providerMessageId: message.providerMessageId,
              reasons: ["DELIVERY_STATUS_MALFORMED"]
            }
          }
        });
        continue;
      }
      if (deliveryInspection?.kind === "PARSED") {
        const deliveryStatus = deliveryInspection.deliveryStatus;
        const unmatchedReasons: string[] =
          deliveryStatus.malformedRecipientBlocks > 0
            ? ["DELIVERY_STATUS_MALFORMED_RECIPIENT"]
            : [];
        for (const recipient of deliveryStatus.recipients) {
          const deliveryMatch = matchDeliveryStatusRecipient(
            {
              recipient,
              inbound: {
                mailboxId,
                inReplyTo: message.inReplyTo,
                references: message.references,
                subject: message.subject,
                reportedAt: message.receivedAt
              }
            },
            deliveryCandidates
          );
          if (deliveryMatch.kind === "UNMATCHED") {
            unmatchedReasons.push(deliveryMatch.reason);
            continue;
          }
          const applied = await applyDeliveryStatus(tx, {
            mailboxId,
            outboundMessageId: deliveryMatch.messageId,
            inboundProviderMessageId:
              message.providerMessageId,
            recipient,
            reportedAt: message.receivedAt
          });
          if (applied.eventCreated) result.deliveryEvents += 1;
          if (applied.finalBounce) result.finalBounces += 1;
          if (applied.delayedDelivery) {
            result.delayedDeliveries += 1;
          }
        }
        if (unmatchedReasons.length > 0) {
          result.unmatched += 1;
          result.unmatchedBounces += 1;
          const unmatched = await tx.mailMessage.create({
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
              bodyHtml: null,
              receivedAt: message.receivedAt,
              lastErrorCode: unmatchedReasons[0]
            }
          });
          await tx.auditLog.create({
            data: {
              action: "MAIL_BOUNCE_UNMATCHED",
              entityType: "MailMessage",
              entityId: unmatched.id,
              metadata: {
                mailboxId,
                providerMessageId: message.providerMessageId,
                reasons: [...new Set(unmatchedReasons)]
              }
            }
          });
        }
        continue;
      }
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
    await tx.mailbox.updateMany({
      where: {
        id: mailboxId,
        configurationVersion,
        encryptedConfig: { not: null },
        configurationDeletedAt: null,
        enabled: true
      },
      data: {
        lastSyncedAt: now,
        lastSuccessAt: now,
        lastErrorCode: null
      }
    });
      return result;
    }, MAIL_SYNC_TRANSACTION_OPTIONS);
  } catch (error) {
    await discardPreparedInboundAssets(
      [...preparedByProviderId.values()],
      storage
    );
    throw error;
  }
  if (skippedPrepared.length > 0) {
    await discardPreparedInboundAssets(skippedPrepared, storage);
  }
  await Promise.all(
    notificationTaskIds.map((taskId) =>
      createTaskNotificationIntents(taskId, now)
    )
  );
  return result;
}
