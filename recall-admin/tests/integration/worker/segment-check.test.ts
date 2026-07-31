import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { loadActiveSegmentRuleSet } from "@/modules/segmentation/rule-config";
import { handleSegmentCheck } from "@/worker/handlers/segment-check";

const userIds: string[] = [];

describe("delayed segment checks", () => {
  afterAll(async () => {
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.$disconnect();
  });

  it("creates one A task when the two-hour check executes twice", async () => {
    const registeredAt = new Date("2026-07-23T08:00:00.000Z");
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `worker-a-${randomUUID()}`,
        email: `worker-a-${randomUUID()}@example.test`,
        emailNormalized: `worker-a-${randomUUID()}@example.test`,
        registeredAt,
        currentSegment: "A"
      }
    });
    userIds.push(user.id);
    const input = {
      userId: user.id,
      expectedSegment: "A" as const,
      expectedFactTimestamp: registeredAt.toISOString(),
      runAt: new Date("2026-07-23T10:00:00.000Z"),
      reasonKey: "registration_unpaid"
    };
    const now = new Date("2026-07-23T10:01:00.000Z");

    await handleSegmentCheck(input, now);
    await handleSegmentCheck(input, now);

    expect(
      await prisma.recallTask.count({
        where: {
          userId: user.id,
          triggerKey: { startsWith: "A:" }
        }
      })
    ).toBe(1);
  });

  it("creates one task for a structured versioned boundary", async () => {
    const registeredAt = new Date("2026-07-23T08:00:00.000Z");
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `worker-structured-${randomUUID()}`,
        email: `worker-structured-${randomUUID()}@example.test`,
        emailNormalized:
          `worker-structured-${randomUUID()}@example.test`,
        registeredAt,
        currentSegment: "A"
      }
    });
    userIds.push(user.id);
    const active = await prisma.$transaction((tx) =>
      loadActiveSegmentRuleSet(tx)
    );
    const input = {
      userId: user.id,
      ruleVersion: active.version,
      runAt: new Date("2026-07-23T10:00:00.000Z"),
      boundaryKey: `task:A:${registeredAt.toISOString()}`,
      purpose: "TASK" as const,
      expectedSegment: "A" as const
    };
    const now = new Date("2026-07-23T10:01:00.000Z");

    await handleSegmentCheck(input, now);
    await handleSegmentCheck(input, now);

    expect(
      await prisma.recallTask.count({
        where: {
          userId: user.id,
          ruleVersion: active.version,
          triggerKey: { startsWith: "A:" }
        }
      })
    ).toBe(1);
  });

  it("puts the concrete F anomaly evidence into the urgent task", async () => {
    const anomalyChangedAt = new Date("2026-07-23T09:55:00.000Z");
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `worker-f-${randomUUID()}`,
        email: `worker-f-${randomUUID()}@example.test`,
        emailNormalized: `worker-f-${randomUUID()}@example.test`,
        registeredAt: new Date("2026-07-20T08:00:00.000Z"),
        firstPaidAt: new Date("2026-07-20T09:00:00.000Z"),
        successfulCallCount: 2,
        balanceMinor: 5_000,
        anomalyActive: true,
        anomalyChangedAt,
        anomalyErrorPhase: "upstream",
        anomalyErrorType: "provider_error",
        anomalyErrorOwner: "provider",
        anomalyStatusCode: 502,
        anomalyModel: "gpt-5",
        anomalyPlatform: "openai",
        anomalyRequestCount: 5,
        anomalyFailureCount: 4,
        anomalyConsecutiveFailures: 3,
        anomalyLastOccurredAt: new Date("2026-07-23T09:54:00.000Z"),
        currentSegment: "F"
      }
    });
    userIds.push(user.id);
    const active = await prisma.$transaction((tx) =>
      loadActiveSegmentRuleSet(tx)
    );

    await handleSegmentCheck(
      {
        userId: user.id,
        ruleVersion: active.version,
        runAt: new Date("2026-07-23T10:00:00.000Z"),
        boundaryKey: `task:F:${anomalyChangedAt.toISOString()}`,
        purpose: "TASK",
        expectedSegment: "F"
      },
      new Date("2026-07-23T10:01:00.000Z")
    );

    await expect(
      prisma.recallTask.findFirstOrThrow({
        where: { userId: user.id, priority: "URGENT" }
      })
    ).resolves.toMatchObject({
      reason:
        "上游服务异常（HTTP 502），近30分钟5次请求失败4次，错误类型 provider_error，模型 gpt-5，最近发生于07/23 17:54。"
    });
    await expect(
      prisma.userProfile.findUniqueOrThrow({
        where: { id: user.id }
      })
    ).resolves.toMatchObject({
      reasonLabel:
        "上游服务异常（HTTP 502），近30分钟5次请求失败4次，错误类型 provider_error，模型 gpt-5，最近发生于07/23 17:54。"
    });
  });

  it("skips a stale G boundary after a newer successful call", async () => {
    const oldCall = new Date("2026-07-16T08:00:00.000Z");
    const newerCall = new Date("2026-07-20T08:00:00.000Z");
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `worker-g-${randomUUID()}`,
        email: `worker-g-${randomUUID()}@example.test`,
        emailNormalized: `worker-g-${randomUUID()}@example.test`,
        registeredAt: new Date("2026-07-01T08:00:00.000Z"),
        firstPaidAt: new Date("2026-07-01T09:00:00.000Z"),
        successfulCallCount: 2,
        lastCallAt: newerCall,
        balanceMinor: 5_000,
        currentSegment: "G"
      }
    });
    userIds.push(user.id);

    await expect(
      handleSegmentCheck(
        {
          userId: user.id,
          expectedSegment: "G",
          expectedFactTimestamp: oldCall.toISOString(),
          runAt: new Date("2026-07-23T08:00:00.000Z"),
          reasonKey: "inactivity_boundary"
        },
        new Date("2026-07-23T08:01:00.000Z")
      )
    ).resolves.toEqual({ skipped: "state_changed" });
  });

  it("never recreates work for a tombstoned main-site user", async () => {
    const deletedAt = new Date("2026-07-23T09:00:00.000Z");
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `worker-deleted-${randomUUID()}`,
        email: `worker-deleted-${randomUUID()}@example.test`,
        emailNormalized:
          `worker-deleted-${randomUUID()}@example.test`,
        registeredAt: new Date("2026-07-23T08:00:00.000Z"),
        currentSegment: "A",
        sourceDeletedAt: deletedAt
      }
    });
    userIds.push(user.id);

    await expect(
      handleSegmentCheck(
        {
          userId: user.id,
          ruleVersion: 1,
          runAt: new Date("2026-07-23T10:00:00.000Z"),
          boundaryKey: "task:A:deleted-user",
          purpose: "TASK",
          expectedSegment: "A"
        },
        new Date("2026-07-23T10:01:00.000Z")
      )
    ).resolves.toEqual({ skipped: "user_deleted" });
    await expect(
      prisma.recallTask.count({ where: { userId: user.id } })
    ).resolves.toBe(0);
  });
});
