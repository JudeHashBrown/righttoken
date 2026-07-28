import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import {
  listSegmentRuleHistory,
  retrySegmentRecalculation,
  rollbackSegmentRuleVersion
} from "@/modules/segmentation/rule-history-actions";
import type { TaskScheduler } from "@/modules/tasks/scheduler";

describe("segment rule history actions", () => {
  let adminId: string;
  let operatorId: string;
  let targetVersionId: string;
  let failedRunId: string;
  const createdVersionIds: string[] = [];
  const createdRunIds: string[] = [];
  const scheduledRunIds: string[] = [];
  let originalActiveId: string | null;

  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck() {},
    async scheduleSegmentRecalculation({ runId }) {
      scheduledRunIds.push(runId);
    }
  };

  beforeAll(async () => {
    originalActiveId =
      (
        await prisma.automationRuleVersion.findFirst({
          where: { kind: "segmentation", active: true },
          select: { id: true }
        })
      )?.id ?? null;
    const latest = await prisma.automationRuleVersion.findFirst({
      where: { kind: "segmentation" },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    const [admin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `history-admin-${randomUUID()}@example.test`,
          displayName: "History Admin",
          passwordHash: "not-used",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `history-operator-${randomUUID()}@example.test`,
          displayName: "History Operator",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
    const target = await prisma.automationRuleVersion.create({
      data: {
        kind: "segmentation",
        version: (latest?.version ?? 0) + 100,
        config: {
          ...structuredClone(defaultSegmentRuleSet),
          changeSummary: "历史版本"
        },
        active: false,
        createdById: admin.id
      }
    });
    targetVersionId = target.id;
    createdVersionIds.push(target.id);
    const failed = await prisma.segmentRecalculationRun.create({
      data: {
        ruleVersionId: target.id,
        ruleVersionNumber: target.version,
        requestedById: admin.id,
        idempotencyKey: randomUUID(),
        status: "PARTIAL_FAILURE",
        totalUsers: 3,
        processedUsers: 3,
        succeededUsers: 2,
        failedUsers: 1,
        previewSummary: {}
      }
    });
    failedRunId = failed.id;
    createdRunIds.push(failed.id);
  });

  afterAll(async () => {
    await prisma.segmentRecalculationRun.deleteMany({
      where: { id: { in: createdRunIds } }
    });
    await prisma.$transaction(async (tx) => {
      await tx.automationRuleVersion.updateMany({
        where: { kind: "segmentation", active: true },
        data: { active: false }
      });
      await tx.automationRuleVersion.deleteMany({
        where: { id: { in: createdVersionIds } }
      });
      if (originalActiveId) {
        await tx.automationRuleVersion.update({
          where: { id: originalActiveId },
          data: { active: true }
        });
      }
    });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [adminId, operatorId] } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [adminId, operatorId] } }
    });
    await prisma.$disconnect();
  });

  it("lets an operator read PII-free version history", async () => {
    const history = await listSegmentRuleHistory(operatorId);
    const target = history.find((item) => item.id === targetVersionId);

    expect(target).toMatchObject({
      id: targetVersionId,
      changeSummary: "历史版本"
    });
    expect(JSON.stringify(target)).not.toContain("@example.test");
  });

  it("retries a failed run idempotently", async () => {
    const idempotencyKey = randomUUID();
    const first = await retrySegmentRecalculation({
      actorId: adminId,
      runId: failedRunId,
      idempotencyKey,
      scheduler
    });
    createdRunIds.push(first.id);
    const repeated = await retrySegmentRecalculation({
      actorId: adminId,
      runId: failedRunId,
      idempotencyKey,
      scheduler
    });

    expect(repeated.id).toBe(first.id);
    expect(first).toMatchObject({
      ruleVersionId: targetVersionId,
      status: "PENDING"
    });
    expect(scheduledRunIds.filter((id) => id === first.id)).toHaveLength(1);
  });

  it("rolls back by publishing a new immutable version", async () => {
    const rolledBack = await rollbackSegmentRuleVersion({
      actorId: adminId,
      targetVersionId,
      changeSummary: "回滚到已验证的历史规则",
      idempotencyKey: randomUUID(),
      scheduler
    });
    createdVersionIds.push(rolledBack.ruleVersion.id);
    createdRunIds.push(rolledBack.run.id);

    expect(rolledBack.ruleVersion.version).toBeGreaterThan(
      (
        await prisma.automationRuleVersion.findUniqueOrThrow({
          where: { id: targetVersionId }
        })
      ).version
    );
    expect(rolledBack.ruleVersion.active).toBe(true);
    expect(
      (
        rolledBack.ruleVersion.config as {
          changeSummary: string;
        }
      ).changeSummary
    ).toBe("回滚到已验证的历史规则");
  });
});
