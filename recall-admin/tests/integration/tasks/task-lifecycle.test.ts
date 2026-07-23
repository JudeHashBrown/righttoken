import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { resegmentUser } from "@/modules/segmentation/resegment-user";
import { createTriggeredTask } from "@/modules/tasks/create-triggered-task";
import {
  cancelTask,
  claimTask,
  completeTask,
  pauseTask,
  resumeTask,
  startTask,
  transferTask,
  waitForUser
} from "@/modules/tasks/task-service";

describe("recall task lifecycle", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  let firstOperatorId: string;
  let secondOperatorId: string;
  let userId: string;

  beforeAll(async () => {
    const [firstOperator, secondOperator, user] = await Promise.all([
      prisma.member.create({
        data: {
          email: `task-operator-one-${randomUUID()}@example.test`,
          displayName: "Task Operator One",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `task-operator-two-${randomUUID()}@example.test`,
          displayName: "Task Operator Two",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `task-user-${randomUUID()}`,
          email: `task-user-${randomUUID()}@example.test`,
          emailNormalized: `task-user-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-23T08:00:00.000Z"),
          checkoutStartedAt: new Date("2026-07-23T09:00:00.000Z"),
          currentSegment: "B"
        }
      })
    ]);
    firstOperatorId = firstOperator.id;
    secondOperatorId = secondOperator.id;
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.userProfile.delete({ where: { id: userId } });
    }
    await prisma.member.deleteMany({
      where: {
        id: {
          in: [firstOperatorId, secondOperatorId].filter(Boolean)
        }
      }
    });
    await prisma.$disconnect();
  });

  it("returns the existing task for a duplicate segment check", async () => {
    const input = {
      userId,
      segment: "B" as const,
      policyKey: "checkout_unpaid",
      windowStart: new Date("2026-07-23T09:00:00.000Z"),
      ruleVersion: 1,
      reason: "结账后 30 分钟仍未支付",
      now
    };
    const first = await createTriggeredTask(input);
    const duplicate = await createTriggeredTask(input);

    expect(duplicate.id).toBe(first.id);
    expect(
      await prisma.recallTask.count({
        where: {
          userId,
          triggerKey: first.triggerKey,
          ruleVersion: 1
        }
      })
    ).toBe(1);
  });

  it("cancels an old-segment automation task but keeps manual tasks", async () => {
    const automationTask = await createTriggeredTask({
      userId,
      segment: "B",
      policyKey: "old-segment",
      windowStart: new Date("2026-07-23T09:05:00.000Z"),
      ruleVersion: 1,
      reason: "旧 B 组任务",
      now
    });
    const manualTask = await prisma.recallTask.create({
      data: {
        userId,
        origin: "MANUAL",
        triggerKey: `B:manual:${now.toISOString()}`,
        ruleVersion: 1,
        title: "人工任务",
        reason: "人工持续关注",
        priority: "NORMAL",
        status: "TODO",
        dueAt: new Date(now.getTime() + 60 * 60 * 1000)
      }
    });
    const paidUser = await prisma.userProfile.update({
      where: { id: userId },
      data: {
        paymentStatus: "PAID",
        firstPaidAt: now,
        currentSegment: "B"
      }
    });

    await prisma.$transaction((tx) =>
      resegmentUser(tx, paidUser, "payment received", now)
    );

    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: automationTask.id }
      })
    ).toMatchObject({
      status: "CANCELLED",
      cancelReason: "segment_changed"
    });
    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: manualTask.id }
      })
    ).toMatchObject({ status: "TODO", cancelReason: null });
  });

  it("rejects the invalid COMPLETED to IN_PROGRESS transition", async () => {
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "MANUAL",
        triggerKey: `C:lifecycle:${randomUUID()}`,
        ruleVersion: 1,
        title: "状态机测试",
        reason: "验证不可逆终态",
        priority: "NORMAL",
        dueAt: new Date(now.getTime() + 60 * 60 * 1000)
      }
    });

    await claimTask(task.id, firstOperatorId, now);
    await startTask(task.id, firstOperatorId, now);
    await completeTask(task.id, firstOperatorId, now);

    await expect(
      startTask(task.id, firstOperatorId, now)
    ).rejects.toThrow(/invalid task transition/);
  });

  it("records pause, resume, waiting, restart, and cancellation", async () => {
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "MANUAL",
        triggerKey: `C:open-lifecycle:${randomUUID()}`,
        ruleVersion: 1,
        title: "开放状态流转",
        reason: "验证所有可操作状态",
        priority: "NORMAL",
        dueAt: new Date(now.getTime() + 60 * 60 * 1000)
      }
    });

    await claimTask(task.id, firstOperatorId, now);
    await pauseTask(task.id, firstOperatorId, now);
    await resumeTask(task.id, firstOperatorId, now);
    await startTask(task.id, firstOperatorId, now);
    await waitForUser(task.id, firstOperatorId, now);
    await startTask(task.id, firstOperatorId, now);
    await cancelTask(
      task.id,
      firstOperatorId,
      "用户明确不再继续",
      now
    );

    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: task.id }
      })
    ).toMatchObject({
      status: "CANCELLED",
      cancelReason: "用户明确不再继续",
      startedAt: now,
      cancelledAt: now
    });
    expect(
      await prisma.taskActivity.count({
        where: { taskId: task.id }
      })
    ).toBe(7);
  });

  it("records operator transfer activity", async () => {
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "MANUAL",
        triggerKey: `C:transfer:${randomUUID()}`,
        ruleVersion: 1,
        title: "转派测试",
        reason: "验证任务活动记录",
        priority: "IMPORTANT",
        status: "TODO",
        assigneeId: firstOperatorId,
        dueAt: new Date(now.getTime() + 60 * 60 * 1000)
      }
    });

    await transferTask(
      task.id,
      firstOperatorId,
      secondOperatorId,
      "区域调整",
      now
    );

    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: task.id }
      })
    ).toMatchObject({ assigneeId: secondOperatorId });
    expect(
      await prisma.taskActivity.findFirst({
        where: { taskId: task.id, action: "task.transferred" }
      })
    ).toMatchObject({ actorId: firstOperatorId });
  });
});
