import { z } from "zod";
import type { NotificationChannel } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const payloadSchema = z.object({
  title: z.string(),
  summary: z.string(),
  taskUrl: z.string().url()
});

export async function createDeadLetterEscalationIntents(
  failedIntentId: string,
  now = new Date()
) {
  const failed = await prisma.notificationIntent.findUniqueOrThrow({
    where: { id: failedIntentId },
    select: {
      id: true,
      taskId: true,
      channel: true,
      status: true,
      lastErrorCode: true,
      payload: true
    }
  });
  if (!failed.taskId || failed.status !== "DEAD_LETTER") {
    return [];
  }
  const payload = payloadSchema.parse(failed.payload);
  const primary = await prisma.member.findFirstOrThrow({
    where: { role: "PRIMARY_ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true }
  });
  const escalationPayload = {
    title: `企微通知失败：${payload.title}`,
    summary:
      `${payload.summary}\n` +
      `投递状态：${failed.lastErrorCode ?? "DELIVERY_FAILED"}`,
    taskUrl: payload.taskUrl
  };
  const targets: Array<{
    channel: NotificationChannel;
    recipient: string;
  }> = [
    { channel: "IN_APP", recipient: primary.id },
    { channel: "EMAIL", recipient: primary.email },
    ...(failed.channel !== "WECOM_ROBOT"
      ? [
          {
            channel: "WECOM_ROBOT" as const,
            recipient: "integration:wecom-robot"
          }
        ]
      : [])
  ];

  return prisma.$transaction(async (tx) => {
    for (const target of targets) {
      await tx.notificationIntent.upsert({
        where: {
          taskId_channel_recipient: {
            taskId: failed.taskId!,
            channel: target.channel,
            recipient: target.recipient
          }
        },
        update: {},
        create: {
          taskId: failed.taskId,
          channel: target.channel,
          recipient: target.recipient,
          payload: escalationPayload,
          status:
            target.channel === "IN_APP" ? "SENT" : "PENDING",
          sentAt: target.channel === "IN_APP" ? now : null,
          nextAttemptAt:
            target.channel === "IN_APP" ? null : now
        }
      });
    }
    return tx.notificationIntent.findMany({
      where: {
        taskId: failed.taskId,
        OR: targets
      },
      orderBy: { channel: "asc" }
    });
  });
}
