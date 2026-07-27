import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  assignTask,
  assignUserOwner
} from "@/modules/assignment/assign-task";
import { previewRules } from "@/modules/assignment/preview-rules";

describe("configurable task assignment", () => {
  let usOperatorId: string;
  let southOperatorId: string;
  let usUserId: string;
  let southUserId: string;
  let workloadUserId: string;
  let ownerOnlyUserId: string;
  let usTaskId: string;
  let southTaskId: string;
  const ruleIds: string[] = [];

  beforeAll(async () => {
    const [usOperator, southOperator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `us-operator-${randomUUID()}@example.test`,
          displayName: "US Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `south-operator-${randomUUID()}@example.test`,
          displayName: "South Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    usOperatorId = usOperator.id;
    southOperatorId = southOperator.id;

    const [usUser, southUser, workloadUser, ownerOnlyUser] =
      await Promise.all([
      prisma.userProfile.create({
        data: {
          externalUserId: `assignment-us-${randomUUID()}`,
          email: `assignment-us-${randomUUID()}@example.test`,
          emailNormalized: `assignment-us-${randomUUID()}@example.test`,
          registeredAt: new Date(),
          countryCode: "US",
          currentSegment: "B"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `assignment-south-${randomUUID()}`,
          email: `assignment-south-${randomUUID()}@example.test`,
          emailNormalized: `assignment-south-${randomUUID()}@example.test`,
          registeredAt: new Date(),
          countryCode: "CN",
          region: "广东省深圳市",
          currentSegment: "A"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `assignment-load-${randomUUID()}`,
          email: `assignment-load-${randomUUID()}@example.test`,
          emailNormalized: `assignment-load-${randomUUID()}@example.test`,
          registeredAt: new Date(),
          currentSegment: "A"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `assignment-owner-only-${randomUUID()}`,
          email: `assignment-owner-only-${randomUUID()}@example.test`,
          emailNormalized: `assignment-owner-only-${randomUUID()}@example.test`,
          registeredAt: new Date(),
          countryCode: "US",
          currentSegment: "B"
        }
      })
    ]);
    usUserId = usUser.id;
    southUserId = southUser.id;
    workloadUserId = workloadUser.id;
    ownerOnlyUserId = ownerOnlyUser.id;

    await prisma.recallTask.createMany({
      data: Array.from({ length: 6 }, (_, index) => ({
        userId: workloadUserId,
        origin: "MANUAL" as const,
        triggerKey: `load:${index}:${randomUUID()}`,
        ruleVersion: 1,
        title: `负载 ${index + 1}`,
        reason: "分配规则负载测试",
        priority: "NORMAL" as const,
        status: "TODO" as const,
        assigneeId: usOperatorId,
        dueAt: new Date(Date.now() + 60 * 60 * 1000)
      }))
    });

    const rules = await Promise.all([
      prisma.assignmentRule.create({
        data: {
          name: "美国 B 组",
          priority: 10,
          conditions: {
            countryCodes: ["US"],
            segments: ["B"]
          },
          assigneeId: usOperatorId,
          workloadLimit: 20
        }
      }),
      prisma.assignmentRule.create({
        data: {
          name: "华南用户",
          priority: 20,
          conditions: {
            regionIncludes: ["广东"]
          },
          assigneeId: southOperatorId,
          workloadLimit: 10
        }
      }),
      prisma.assignmentRule.create({
        data: {
          name: "公共池",
          priority: 999,
          conditions: {},
          poolKey: "public"
        }
      })
    ]);
    ruleIds.push(...rules.map((rule) => rule.id));

    const [usTask, southTask] = await Promise.all([
      prisma.recallTask.create({
        data: {
          userId: usUserId,
          origin: "AUTOMATION",
          triggerKey: `B:assignment:${randomUUID()}`,
          ruleVersion: 1,
          title: "美国用户任务",
          reason: "测试美国分配规则",
          priority: "IMPORTANT",
          dueAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      }),
      prisma.recallTask.create({
        data: {
          userId: southUserId,
          origin: "AUTOMATION",
          triggerKey: `A:assignment:${randomUUID()}`,
          ruleVersion: 1,
          title: "广东用户任务",
          reason: "测试华南分配规则",
          priority: "NORMAL",
          dueAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      })
    ]);
    usTaskId = usTask.id;
    southTaskId = southTask.id;
  });

  afterAll(async () => {
    await prisma.assignmentRule.deleteMany({
      where: { id: { in: ruleIds } }
    });
    await prisma.userProfile.deleteMany({
      where: {
        id: {
          in: [
            usUserId,
            southUserId,
            workloadUserId,
            ownerOnlyUserId
          ].filter(Boolean)
        }
      }
    });
    await prisma.member.deleteMany({
      where: {
        id: { in: [usOperatorId, southOperatorId].filter(Boolean) }
      }
    });
    await prisma.$disconnect();
  });

  it("assigns US B users with an exact workload reason", async () => {
    const decision = await assignTask(usTaskId);

    expect(decision).toMatchObject({
      assigneeId: usOperatorId,
      matchedRulePriority: 10
    });
    expect(decision.assignmentReason).toBe(
      "规则“美国 B 组”命中：国家=US，分组=B；负责人当前未完成任务 6/20"
    );
    expect(
      await prisma.recallTask.findUniqueOrThrow({
        where: { id: usTaskId }
      })
    ).toMatchObject({
      assigneeId: usOperatorId,
      status: "TODO",
      assignmentReason: decision.assignmentReason
    });
  });

  it("assigns Guangdong users to the regional operator", async () => {
    const decision = await assignTask(southTaskId);

    expect(decision).toMatchObject({
      assigneeId: southOperatorId,
      matchedRulePriority: 20
    });
    expect(decision.assignmentReason).toContain(
      "规则“华南用户”命中：地区包含=广东"
    );
    expect(
      await prisma.userProfile.findUniqueOrThrow({
        where: { id: southUserId }
      })
    ).toMatchObject({ ownerId: southOperatorId });
  });

  it("assigns an owner even when the user has no task", async () => {
    const decision = await assignUserOwner(ownerOnlyUserId);

    expect(decision).toMatchObject({
      assigneeId: usOperatorId,
      matchedRulePriority: 10
    });
    await expect(
      prisma.userProfile.findUniqueOrThrow({
        where: { id: ownerOnlyUserId }
      })
    ).resolves.toMatchObject({ ownerId: usOperatorId });
    await expect(
      prisma.recallTask.count({
        where: { userId: ownerOnlyUserId }
      })
    ).resolves.toBe(0);
  });

  it("previews an unsaved ruleset without changing tasks or owners", async () => {
    const beforeTaskCount = await prisma.recallTask.count();
    const beforeOwners = await prisma.userProfile.findMany({
      where: {
        id: { in: [usUserId, southUserId, workloadUserId] }
      },
      orderBy: { id: "asc" },
      select: { id: true, ownerId: true }
    });

    const preview = await previewRules([
      {
        name: "预览美国用户",
        enabled: true,
        priority: 1,
        conditions: { countryCodes: ["US"] },
        assigneeId: usOperatorId,
        fallbackAssigneeId: null,
        poolKey: null,
        workloadLimit: 20,
        effectiveFrom: null,
        effectiveTo: null
      },
      {
        name: "预览公共池",
        enabled: true,
        priority: 999,
        conditions: {},
        assigneeId: null,
        fallbackAssigneeId: null,
        poolKey: "public",
        workloadLimit: null,
        effectiveFrom: null,
        effectiveTo: null
      }
    ]);

    expect(preview.sampledUsers).toBeGreaterThanOrEqual(3);
    expect(preview.countsByRule["draft:1"]).toBeGreaterThanOrEqual(1);
    expect(await prisma.recallTask.count()).toBe(beforeTaskCount);
    expect(
      await prisma.userProfile.findMany({
        where: {
          id: { in: [usUserId, southUserId, workloadUserId] }
        },
        orderBy: { id: "asc" },
        select: { id: true, ownerId: true }
      })
    ).toEqual(beforeOwners);
  });
});
