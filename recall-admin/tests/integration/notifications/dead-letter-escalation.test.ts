import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createDeadLetterEscalationIntents } from "@/modules/notifications/dead-letter-escalation";

describe("dead-letter notification escalation", () => {
  let memberId: string;
  let userId: string;
  let taskId: string;
  let failedIntentId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `dead-letter-owner-${randomUUID()}@example.test`,
        displayName: "失败通知任务负责人",
        passwordHash: "not-used",
        role: "OPERATOR",
        wecomUserId: `dead-letter-${randomUUID()}`
      }
    });
    memberId = member.id;
    const email = `dead-letter-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `dead-letter-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date(),
        currentSegment: "F",
        ownerId: member.id
      }
    });
    userId = user.id;
    const task = await prisma.recallTask.create({
      data: {
        userId: user.id,
        origin: "AUTOMATION",
        triggerKey: `dead-letter-${randomUUID()}`,
        ruleVersion: 1,
        title: "企微发送失败",
        reason: "测试最终失败升级",
        priority: "URGENT",
        status: "TODO",
        assigneeId: member.id,
        dueAt: new Date(Date.now() + 60_000)
      }
    });
    taskId = task.id;
    failedIntentId = (
      await prisma.notificationIntent.create({
        data: {
          taskId: task.id,
          channel: "WECOM_APP",
          recipient: member.wecomUserId!,
          payload: {
            title: "脱敏企微通知",
            summary: "用户 RT-*** · F 组",
            taskUrl: `http://127.0.0.1:3000/tasks/${task.id}`
          },
          status: "DEAD_LETTER",
          attemptCount: 1,
          lastErrorCode: "WECOM_RECIPIENT_INVALID"
        }
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.recallTask.deleteMany({
      where: { id: taskId }
    });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.member.deleteMany({ where: { id: memberId } });
    await prisma.$disconnect();
  });

  it("creates one primary-admin in-app, email and robot fallback", async () => {
    await createDeadLetterEscalationIntents(
      failedIntentId,
      new Date("2026-07-26T07:30:00.000Z")
    );
    await createDeadLetterEscalationIntents(
      failedIntentId,
      new Date("2026-07-26T07:31:00.000Z")
    );

    const primary = await prisma.member.findFirstOrThrow({
      where: { role: "PRIMARY_ADMIN", active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true }
    });
    const escalations = await prisma.notificationIntent.findMany({
      where: {
        taskId,
        OR: [
          { channel: "IN_APP", recipient: primary.id },
          { channel: "EMAIL", recipient: primary.email },
          {
            channel: "WECOM_ROBOT",
            recipient: "integration:wecom-robot"
          }
        ]
      },
      orderBy: { channel: "asc" }
    });
    expect(escalations).toHaveLength(3);
    expect(escalations.map((item) => item.channel).sort()).toEqual([
      "EMAIL",
      "IN_APP",
      "WECOM_ROBOT"
    ]);
    for (const escalation of escalations) {
      expect(JSON.stringify(escalation.payload)).not.toContain(
        "@example.test"
      );
    }
  });
});
