import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { previewSegmentRuleSet } from "@/modules/segmentation/preview-rule-set";
import { publishSegmentRuleSet } from "@/modules/segmentation/publish-rule-set";
import type { TaskScheduler } from "@/modules/tasks/scheduler";

describe("segment rule publication", () => {
  let adminId: string;
  let operatorId: string;
  let originalActiveId: string | null;
  const createdVersionIds: string[] = [];
  const scheduledRunIds: string[] = [];

  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck() {},
    async scheduleSegmentRecalculation(input) {
      scheduledRunIds.push(input.runId);
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
    const [admin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `segment-publish-admin-${randomUUID()}@example.test`,
          displayName: "Publish Admin",
          passwordHash: "not-used",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `segment-publish-operator-${randomUUID()}@example.test`,
          displayName: "Publish Operator",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
  });

  afterAll(async () => {
    await prisma.segmentRecalculationRun.deleteMany({
      where: { ruleVersionId: { in: createdVersionIds } }
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

  it("publishes exactly the previewed draft and schedules one run", async () => {
    const draft = {
      ...structuredClone(defaultSegmentRuleSet),
      changeSummary: "测试发布完整互斥规则"
    };
    const preview = await previewSegmentRuleSet(adminId, draft);
    const idempotencyKey = randomUUID();

    const first = await publishSegmentRuleSet({
      actorId: adminId,
      draft,
      previewToken: preview.token,
      idempotencyKey,
      scheduler
    });
    createdVersionIds.push(first.ruleVersion.id);
    const repeated = await publishSegmentRuleSet({
      actorId: adminId,
      draft,
      previewToken: preview.token,
      idempotencyKey,
      scheduler
    });

    expect(repeated.run.id).toBe(first.run.id);
    expect(scheduledRunIds).toEqual([first.run.id]);
    expect(
      await prisma.segmentRecalculationRun.count({
        where: { idempotencyKey }
      })
    ).toBe(1);
    expect(
      await prisma.automationRuleVersion.count({
        where: { kind: "segmentation", active: true }
      })
    ).toBe(1);
  });

  it("rejects an operator and a changed draft", async () => {
    const draft = {
      ...structuredClone(defaultSegmentRuleSet),
      changeSummary: "测试拒绝未授权发布"
    };
    const operatorPreview = await previewSegmentRuleSet(
      operatorId,
      draft
    );
    await expect(
      publishSegmentRuleSet({
        actorId: operatorId,
        draft,
        previewToken: operatorPreview.token,
        idempotencyKey: randomUUID(),
        scheduler
      })
    ).rejects.toThrow(ForbiddenError);

    const adminPreview = await previewSegmentRuleSet(adminId, draft);
    await expect(
      publishSegmentRuleSet({
        actorId: adminId,
        draft: { ...draft, changeSummary: "草稿已经被修改" },
        previewToken: adminPreview.token,
        idempotencyKey: randomUUID(),
        scheduler
      })
    ).rejects.toThrow(/preview/i);
  });
});
