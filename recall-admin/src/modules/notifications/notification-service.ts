import { z } from "zod";
import type {
  NotificationChannel
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  defaultNotificationPolicy,
  notificationPolicySchema
} from "@/modules/notifications/policy-config";
import { redactForNotification } from "@/modules/notifications/redact-notification";
import type {
  NotificationAdapter,
  RedactedNotification
} from "@/modules/notifications/types";

const payloadSchema = z.object({
  title: z.string(),
  summary: z.string(),
  taskUrl: z.string().url()
});

const retryDelaysMinutes = [1, 5, 20, 60] as const;

type AdapterRegistry = Partial<
  Record<NotificationChannel, NotificationAdapter>
>;

function deliveryFailure(error: unknown): {
  code: string;
  retryable: boolean;
} {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return {
      code: error.code,
      retryable: error.retryable
    };
  }
  return {
    code: "DELIVERY_FAILED",
    retryable: true
  };
}

export async function createTaskNotificationIntents(
  taskId: string,
  now = new Date(),
  appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000"
) {
  const [task, activePolicy] = await Promise.all([
    prisma.recallTask.findUniqueOrThrow({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        reason: true,
        priority: true,
        dueAt: true,
        assignee: {
          select: {
            id: true,
            email: true,
            active: true,
            wecomUserId: true
          }
        },
        user: {
          select: {
            externalUserId: true,
            email: true,
            countryCode: true,
            region: true,
            currentSegment: true
          }
        }
      }
    }),
    prisma.automationRuleVersion.findFirst({
      where: { kind: "notifications", active: true },
      orderBy: { version: "desc" },
      select: { config: true }
    })
  ]);
  const parsed = activePolicy
    ? notificationPolicySchema.safeParse(activePolicy.config)
    : null;
  const policy =
    parsed?.success === true
      ? parsed.data
      : defaultNotificationPolicy;
  const level =
    task.priority === "URGENT"
      ? policy.urgent
      : task.priority === "IMPORTANT"
        ? policy.important
        : policy.normal;
  const assignedRecipient = task.assignee?.active
    ? task.assignee
    : null;
  const needsPrimary =
    !assignedRecipient || !assignedRecipient.wecomUserId;
  const primaryRecipient = needsPrimary
    ? await prisma.member.findFirst({
        where: { active: true, role: "PRIMARY_ADMIN" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          active: true,
          wecomUserId: true
        }
      })
    : null;
  const recipient = assignedRecipient ?? primaryRecipient;
  if (!recipient) {
    throw new Error("ACTIVE_NOTIFICATION_RECIPIENT_REQUIRED");
  }
  const wecomRecipient =
    assignedRecipient?.wecomUserId
      ? assignedRecipient
      : primaryRecipient?.wecomUserId
        ? primaryRecipient
        : null;
  const payload = redactForNotification({
    taskId: task.id,
    externalUserId: task.user.externalUserId,
    email: task.user.email,
    registrationIp: null,
    countryCode: task.user.countryCode,
    region: task.user.region,
    segment: task.user.currentSegment,
    reason: task.reason || task.title,
    priority: task.priority,
    dueAt: task.dueAt,
    now,
    appUrl
  });
  const targets: Array<{
    channel: NotificationChannel;
    recipient: string;
  }> = [
    { channel: "IN_APP", recipient: recipient.id },
    ...(level.wecom && wecomRecipient?.wecomUserId
      ? [
          {
            channel: "WECOM_APP" as const,
            recipient: wecomRecipient.wecomUserId
          }
        ]
      : []),
    ...(task.priority === "URGENT" || needsPrimary
      ? [
          {
            channel: "WECOM_ROBOT" as const,
            recipient: "integration:wecom-robot"
          }
        ]
      : []),
    ...(level.email
      ? [
          {
            channel: "EMAIL" as const,
            recipient: recipient.email
          }
        ]
      : [])
  ];

  return prisma.$transaction(async (tx) => {
    await tx.notificationIntent.deleteMany({
      where: {
        taskId: task.id,
        status: { in: ["PENDING", "FAILED"] },
        NOT: {
          OR: targets.map((target) => ({
            channel: target.channel,
            recipient: target.recipient
          }))
        }
      }
    });
    for (const target of targets) {
      await tx.notificationIntent.upsert({
        where: {
          taskId_channel_recipient: {
            taskId: task.id,
            channel: target.channel,
            recipient: target.recipient
          }
        },
        update: {},
        create: {
          taskId: task.id,
          channel: target.channel,
          recipient: target.recipient,
          payload,
          status:
            target.channel === "IN_APP" ? "SENT" : "PENDING",
          sentAt: target.channel === "IN_APP" ? now : null,
          nextAttemptAt:
            target.channel === "IN_APP" ? null : now
        }
      });
    }
    return tx.notificationIntent.findMany({
      where: { taskId: task.id },
      orderBy: { channel: "asc" }
    });
  });
}

export async function sendNotificationIntent(
  intentId: string,
  adapters: AdapterRegistry,
  now = new Date()
) {
  const intent = await prisma.notificationIntent.findUniqueOrThrow({
    where: { id: intentId }
  });
  if (intent.status === "SENT" || intent.status === "DEAD_LETTER") {
    return intent;
  }
  const adapter = adapters[intent.channel];
  if (!adapter || adapter.channel !== intent.channel) {
    throw new Error("NOTIFICATION_ADAPTER_UNAVAILABLE");
  }
  const payload: RedactedNotification = payloadSchema.parse(
    intent.payload
  );
  const attemptCount = intent.attemptCount + 1;
  try {
    const result = await adapter.send({
      recipient: intent.recipient,
      ...payload
    });
    return prisma.notificationIntent.update({
      where: { id: intent.id },
      data: {
        status: "SENT",
        attemptCount,
        providerMessageId: result.providerMessageId,
        sentAt: now,
        nextAttemptAt: null,
        lastErrorCode: null
      }
    });
  } catch (error) {
    const failure = deliveryFailure(error);
    const deadLetter =
      !failure.retryable ||
      attemptCount >= retryDelaysMinutes.length;
    return prisma.notificationIntent.update({
      where: { id: intent.id },
      data: {
        status: deadLetter ? "DEAD_LETTER" : "FAILED",
        attemptCount,
        lastErrorCode: failure.code,
        nextAttemptAt: deadLetter
          ? null
          : new Date(
              now.getTime() +
                retryDelaysMinutes[attemptCount - 1]! * 60_000
            )
      }
    });
  }
}
