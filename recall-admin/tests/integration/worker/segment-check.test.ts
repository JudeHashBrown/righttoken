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
});
