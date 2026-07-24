import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import type { TaskScheduler } from "@/modules/tasks/scheduler";
import { handleSegmentRecalculation } from "@/worker/handlers/segment-recalculation";

describe("segment recalculation worker", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  let memberId: string;
  let userId: string;
  let ruleVersionId: string;
  let runId: string;
  let oldTodoTaskId: string;
  let activeTaskId: string;
  let manualTaskId: string;
  const scheduledChecks: unknown[] = [];

  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck(input) {
      scheduledChecks.push(input);
    },
    async scheduleSegmentRecalculation() {}
  };

  beforeAll(async () => {
    const latest = await prisma.automationRuleVersion.findFirst({
      where: { kind: "segmentation" },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    const version = (latest?.version ?? 0) + 100;
    const member = await prisma.member.create({
      data: {
        email: `recalculation-${randomUUID()}@example.test`,
        displayName: "Recalculation Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    memberId = member.id;
    const ruleVersion = await prisma.automationRuleVersion.create({
      data: {
        kind: "segmentation",
        version,
        config: {
          ...structuredClone(defaultSegmentRuleSet),
          changeSummary: "集成测试全量重算"
        },
        active: false,
        createdById: member.id
      }
    });
    ruleVersionId = ruleVersion.id;
    const user = await prisma.userProfile.create({
      data: {
        id: `zz-recalculation-${randomUUID()}`,
        externalUserId: `recalculation-user-${randomUUID()}`,
        email: `recalculation-user-${randomUUID()}@example.test`,
        emailNormalized:
          `recalculation-user-${randomUUID()}@example.test`,
        registeredAt: new Date("2026-07-20T08:00:00.000Z"),
        checkoutStartedAt: null,
        currentSegment: "G",
        anomalyActive: true,
        anomalyChangedAt: new Date("2026-07-24T11:55:00.000Z")
      }
    });
    userId = user.id;
    const baseTask = {
      userId: user.id,
      ruleVersion: version - 1,
      title: "旧任务",
      reason: "验证规则发布迁移",
      priority: "NORMAL" as const,
      dueAt: new Date("2026-07-25T12:00:00.000Z")
    };
    const [oldTodo, active, manual] = await Promise.all([
      prisma.recallTask.create({
        data: {
          ...baseTask,
          origin: "AUTOMATION",
          triggerKey: `G:old-todo:${randomUUID()}`,
          status: "TODO"
        }
      }),
      prisma.recallTask.create({
        data: {
          ...baseTask,
          origin: "AUTOMATION",
          triggerKey: `G:active:${randomUUID()}`,
          status: "IN_PROGRESS"
        }
      }),
      prisma.recallTask.create({
        data: {
          ...baseTask,
          origin: "MANUAL",
          triggerKey: `G:manual:${randomUUID()}`,
          status: "TODO"
        }
      })
    ]);
    oldTodoTaskId = oldTodo.id;
    activeTaskId = active.id;
    manualTaskId = manual.id;
    const run = await prisma.segmentRecalculationRun.create({
      data: {
        ruleVersionId: ruleVersion.id,
        ruleVersionNumber: version,
        requestedById: member.id,
        idempotencyKey: randomUUID(),
        totalUsers: 1,
        lastProcessedUserId: "zy",
        upperBoundUserId: user.id,
        previewSummary: {}
      }
    });
    runId = run.id;
  });

  afterAll(async () => {
    await prisma.segmentRecalculationRun.deleteMany({
      where: { id: runId }
    });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.automationRuleVersion.deleteMany({
      where: { id: ruleVersionId }
    });
    await prisma.member.deleteMany({ where: { id: memberId } });
    await prisma.$disconnect();
  });

  it("reclassifies all users and preserves started or manual tasks", async () => {
    const result = await handleSegmentRecalculation(
      { runId },
      now,
      scheduler
    );

    expect(result).toMatchObject({
      completed: true,
      processedUsers: 1,
      failedUsers: 0
    });
    expect(
      await prisma.userProfile.findUniqueOrThrow({
        where: { id: userId }
      })
    ).toMatchObject({
      currentSegment: "F",
      segmentRuleVersion:
        expect.any(Number)
    });
    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: oldTodoTaskId }
      })
    ).toMatchObject({
      status: "CANCELLED",
      cancelReason: "segment_rule_republished"
    });
    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: activeTaskId }
      })
    ).toMatchObject({ status: "IN_PROGRESS", cancelReason: null });
    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: manualTaskId }
      })
    ).toMatchObject({ status: "TODO", cancelReason: null });
    expect(
      await prisma.recallTask.findFirstOrThrow({
        where: {
          userId,
          ruleVersion:
            (
              await prisma.segmentRecalculationRun.findUniqueOrThrow({
                where: { id: runId }
              })
            ).ruleVersionNumber,
          triggerKey: { startsWith: "F:task:F:" }
        }
      })
    ).toMatchObject({ priority: "URGENT" });
    expect(
      await prisma.segmentRecalculationRun.findUniqueOrThrow({
        where: { id: runId }
      })
    ).toMatchObject({
      status: "COMPLETED",
      processedUsers: 1,
      succeededUsers: 1,
      failedUsers: 0,
      segmentChanges: 1,
      cancelledTasks: 1,
      createdTasks: 1
    });
  });
});
