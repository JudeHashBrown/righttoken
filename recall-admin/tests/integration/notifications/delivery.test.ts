import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createTaskNotificationIntents,
  sendNotificationIntent
} from "@/modules/notifications/notification-service";
import { WecomDeliveryError } from "@/modules/notifications/adapters/wecom-app";
import type { NotificationAdapter } from "@/modules/notifications/types";

describe("redacted multichannel notification delivery", () => {
  let memberId: string;
  let userId: string;
  let taskId: string;
  let importantTaskId: string;
  const standaloneIntentIds: string[] = [];

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `notify-admin-${randomUUID()}@example.test`,
        displayName: "Notify Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN",
        wecomUserId: `notify-admin-${randomUUID()}`
      }
    });
    memberId = member.id;
    const email = `notify-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `RT-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-07-24T08:00:00.000Z"),
        countryCode: "CN",
        region: "上海",
        currentSegment: "F",
        ownerId: memberId
      }
    });
    userId = user.id;
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "AUTOMATION",
        triggerKey: `notification-test-${randomUUID()}`,
        ruleVersion: 1,
        title: "服务异常待处理",
        reason: "连续调用失败",
        priority: "URGENT",
        status: "TODO",
        assigneeId: memberId,
        dueAt: new Date("2026-07-24T10:30:00.000Z")
      }
    });
    taskId = task.id;
    importantTaskId = (
      await prisma.recallTask.create({
        data: {
          userId,
          origin: "AUTOMATION",
          triggerKey: `notification-important-${randomUUID()}`,
          ruleVersion: 1,
          title: "支付未完成",
          reason: "结账后未支付",
          priority: "IMPORTANT",
          status: "TODO",
          assigneeId: memberId,
          dueAt: new Date("2026-07-24T12:00:00.000Z")
        }
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.notificationIntent.deleteMany({
      where: { id: { in: standaloneIntentIds } }
    });
    await prisma.recallTask.deleteMany({
      where: { id: { in: [taskId, importantTaskId] } }
    });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.member.deleteMany({ where: { id: memberId } });
    await prisma.$disconnect();
  });

  it("creates in-app, WeCom and email intents without full user email or IP", async () => {
    const intents = await createTaskNotificationIntents(
      taskId,
      new Date("2026-07-24T10:00:00.000Z"),
      "https://recall.righttoken.ai"
    );

    expect(intents.map((intent) => intent.channel).sort()).toEqual([
      "EMAIL",
      "IN_APP",
      "WECOM_APP",
      "WECOM_ROBOT"
    ]);
    for (const intent of intents) {
      expect(JSON.stringify(intent.payload)).not.toContain(
        "@example.test"
      );
      expect(JSON.stringify(intent.payload)).not.toMatch(
        /\b\d{1,3}(?:\.\d{1,3}){3}\b/
      );
    }
  });

  it("sends an important task directly without posting it to the group", async () => {
    const intents = await createTaskNotificationIntents(
      importantTaskId,
      new Date("2026-07-24T10:00:00.000Z"),
      "https://recall.righttoken.ai"
    );

    expect(intents.map((intent) => intent.channel).sort()).toEqual([
      "IN_APP",
      "WECOM_APP"
    ]);
    expect(
      intents.find((intent) => intent.channel === "WECOM_APP")
        ?.recipient
    ).toBe(
      (
        await prisma.member.findUniqueOrThrow({
          where: { id: memberId },
          select: { wecomUserId: true }
        })
      ).wecomUserId
    );
  });

  it("escalates an unmapped task to the primary administrator and group", async () => {
    const primary = await prisma.member.findFirstOrThrow({
      where: { role: "PRIMARY_ADMIN", active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, wecomUserId: true }
    });
    const primaryWecomUserId = `primary-${randomUUID()}`;
    await prisma.member.update({
      where: { id: primary.id },
      data: { wecomUserId: primaryWecomUserId }
    });
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "AUTOMATION",
        triggerKey: `notification-fallback-${randomUUID()}`,
        ruleVersion: 1,
        title: "无人负责的紧急任务",
        reason: "负责人缺失",
        priority: "URGENT",
        status: "UNASSIGNED",
        dueAt: new Date("2026-07-24T10:30:00.000Z")
      }
    });

    try {
      const intents = await createTaskNotificationIntents(
        task.id,
        new Date("2026-07-24T10:00:00.000Z"),
        "https://recall.righttoken.ai"
      );
      expect(
        intents.find((intent) => intent.channel === "WECOM_APP")
          ?.recipient
      ).toBe(primaryWecomUserId);
      expect(
        intents.some(
          (intent) => intent.channel === "WECOM_ROBOT"
        )
      ).toBe(true);
    } finally {
      await prisma.recallTask.delete({ where: { id: task.id } });
      await prisma.member.update({
        where: { id: primary.id },
        data: { wecomUserId: primary.wecomUserId }
      });
    }
  });

  it("sends an intent once and stores the provider id", async () => {
    const [intent] = await prisma.notificationIntent.findMany({
      where: { taskId, channel: "WECOM_ROBOT" },
      take: 1
    });
    expect(intent).toBeDefined();
    const adapter: NotificationAdapter = {
      channel: "WECOM_ROBOT",
      send: vi.fn().mockResolvedValue({
        providerMessageId: "wecom-message-1"
      })
    };

    const sent = await sendNotificationIntent(intent!.id, {
      WECOM_ROBOT: adapter
    });

    expect(sent).toMatchObject({
      status: "SENT",
      attemptCount: 1,
      providerMessageId: "wecom-message-1"
    });
    await expect(
      sendNotificationIntent(intent!.id, {
        WECOM_ROBOT: adapter
      })
    ).resolves.toMatchObject({ attemptCount: 1 });
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it("preserves retryable provider errors and schedules another attempt", async () => {
    const intent = await prisma.notificationIntent.create({
      data: {
        channel: "WECOM_APP",
        recipient: "retry-member",
        payload: {
          title: "测试",
          summary: "脱敏摘要",
          taskUrl: "http://127.0.0.1:3000/tasks/test"
        },
        nextAttemptAt: new Date("2026-07-24T10:00:00.000Z")
      }
    });
    standaloneIntentIds.push(intent.id);
    const adapter: NotificationAdapter = {
      channel: "WECOM_APP",
      async send() {
        throw new WecomDeliveryError(
          "WECOM_NETWORK_ERROR",
          true
        );
      }
    };

    await expect(
      sendNotificationIntent(
        intent.id,
        { WECOM_APP: adapter },
        new Date("2026-07-24T10:00:00.000Z")
      )
    ).resolves.toMatchObject({
      status: "FAILED",
      attemptCount: 1,
      lastErrorCode: "WECOM_NETWORK_ERROR",
      nextAttemptAt: new Date("2026-07-24T10:01:00.000Z")
    });
  });

  it("dead-letters non-retryable provider errors immediately", async () => {
    const intent = await prisma.notificationIntent.create({
      data: {
        channel: "WECOM_APP",
        recipient: "invalid-member",
        payload: {
          title: "测试",
          summary: "脱敏摘要",
          taskUrl: "http://127.0.0.1:3000/tasks/test"
        }
      }
    });
    standaloneIntentIds.push(intent.id);
    const adapter: NotificationAdapter = {
      channel: "WECOM_APP",
      async send() {
        throw new WecomDeliveryError(
          "WECOM_RECIPIENT_INVALID",
          false
        );
      }
    };

    await expect(
      sendNotificationIntent(intent.id, {
        WECOM_APP: adapter
      })
    ).resolves.toMatchObject({
      status: "DEAD_LETTER",
      attemptCount: 1,
      lastErrorCode: "WECOM_RECIPIENT_INVALID",
      nextAttemptAt: null
    });
  });
});
