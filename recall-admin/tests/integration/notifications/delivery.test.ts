import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createTaskNotificationIntents,
  sendNotificationIntent
} from "@/modules/notifications/notification-service";
import type { NotificationAdapter } from "@/modules/notifications/types";

describe("redacted multichannel notification delivery", () => {
  let memberId: string;
  let userId: string;
  let taskId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `notify-admin-${randomUUID()}@example.test`,
        displayName: "Notify Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
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
  });

  afterAll(async () => {
    await prisma.recallTask.deleteMany({ where: { id: taskId } });
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
      "WECOM"
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

  it("sends an intent once and stores the provider id", async () => {
    const [intent] = await prisma.notificationIntent.findMany({
      where: { taskId, channel: "WECOM" },
      take: 1
    });
    expect(intent).toBeDefined();
    const adapter: NotificationAdapter = {
      channel: "WECOM",
      send: vi.fn().mockResolvedValue({
        providerMessageId: "wecom-message-1"
      })
    };

    const sent = await sendNotificationIntent(intent!.id, {
      WECOM: adapter
    });

    expect(sent).toMatchObject({
      status: "SENT",
      attemptCount: 1,
      providerMessageId: "wecom-message-1"
    });
    await expect(
      sendNotificationIntent(intent!.id, { WECOM: adapter })
    ).resolves.toMatchObject({ attemptCount: 1 });
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });
});
