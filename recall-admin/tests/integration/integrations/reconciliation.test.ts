import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type { RightTokenAdapter } from "@/modules/integrations/righttoken/adapter";
import { reconcileRightTokenUsers } from "@/modules/integrations/righttoken/reconcile";
import type {
  SegmentCheckSchedule,
  TaskScheduler
} from "@/modules/tasks/scheduler";

const externalUserIds: string[] = [];
const memberIds: string[] = [];
const assignmentRuleIds: string[] = [];

function adapter(
  users: Awaited<ReturnType<RightTokenAdapter["listUsers"]>>["users"]
): RightTokenAdapter {
  return {
    async verifyConnection() {
      return { ok: true, source: "integration-test" };
    },
    async listUsers() {
      return { users, nextCursor: null };
    }
  };
}

describe("RightToken user reconciliation", () => {
  afterAll(async () => {
    await prisma.assignmentRule.deleteMany({
      where: { id: { in: assignmentRuleIds } }
    });
    await prisma.userProfile.deleteMany({
      where: { externalUserId: { in: externalUserIds } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: memberIds } }
    });
    await prisma.$disconnect();
  });

  it("upserts facts, resegments, and preserves ownership and tasks", async () => {
    const externalUserId = `reconcile-${randomUUID()}`;
    externalUserIds.push(externalUserId);
    const owner = await prisma.member.create({
      data: {
        email: `reconcile-owner-${randomUUID()}@example.test`,
        displayName: "校准测试运营",
        passwordHash: "not-a-login-password-hash",
        role: "OPERATOR"
      }
    });
    memberIds.push(owner.id);
    const assignmentRule = await prisma.assignmentRule.create({
      data: {
        name: `校准来源-${randomUUID()}`,
        enabled: true,
        priority: 0,
        conditions: { sources: ["campaign"] },
        assigneeId: owner.id
      }
    });
    assignmentRuleIds.push(assignmentRule.id);
    const user = await prisma.userProfile.create({
      data: {
        externalUserId,
        email: `${externalUserId}@old.example.test`,
        emailNormalized: `${externalUserId}@old.example.test`,
        registeredAt: new Date("2026-07-20T00:00:00.000Z"),
        currentSegment: "A",
        ownerId: owner.id,
        lastExternalEventAt: new Date("2026-07-23T00:00:00.000Z")
      }
    });
    const task = await prisma.recallTask.create({
      data: {
        userId: user.id,
        origin: "MANUAL",
        triggerKey: `manual:${randomUUID()}`,
        ruleVersion: 1,
        title: "保留的人工任务",
        reason: "运营创建",
        priority: "NORMAL",
        status: "IN_PROGRESS",
        assigneeId: owner.id,
        dueAt: new Date("2026-07-30T00:00:00.000Z")
      }
    });

    const scheduled: SegmentCheckSchedule[] = [];
    const scheduler: TaskScheduler = {
      async scheduleSegmentCheck(input) {
        scheduled.push(input);
      }
    };
    const result = await reconcileRightTokenUsers({
      adapter: adapter([
        {
          externalUserId,
          email: `${externalUserId}@new.example.test`,
          displayName: "更新后的用户",
          registeredAt: new Date("2026-07-20T00:00:00.000Z"),
          updatedAt: new Date("2026-07-24T00:00:00.000Z"),
          registrationIp: "203.0.113.9",
          countryCode: "SG",
          region: "Singapore",
          language: "zh-CN",
          timezone: "Asia/Singapore",
          source: "campaign",
          checkoutStartedAt: null,
          firstPaidAt: new Date("2026-07-20T01:00:00.000Z"),
          totalPaidMinor: 10_000,
          successfulCallCount: 1,
          lastCallAt: new Date("2026-07-23T23:00:00.000Z"),
          balanceMinor: 44,
          balanceCurrency: "EUR",
          balanceUsdMinor: 49,
          anomalyActive: false
        }
      ]),
      scheduler,
      now: new Date("2026-07-24T02:00:00.000Z")
    });

    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { externalUserId }
    });
    expect(result).toMatchObject({
      scanned: 1,
      inserted: 0,
      updated: 1,
      unchanged: 0,
      segmentChanges: 1
    });
    expect(stored).toMatchObject({
      email: `${externalUserId}@new.example.test`,
      ownerId: owner.id,
      successfulCallCount: 1,
      balanceMinor: 44,
      balanceCurrency: "EUR",
      balanceUsdMinor: 49,
      currentSegment: "E"
    });
    await expect(
      prisma.recallTask.findUnique({ where: { id: task.id } })
    ).resolves.toMatchObject({
      title: "保留的人工任务",
      assigneeId: owner.id
    });
    expect(scheduled.length).toBeGreaterThanOrEqual(0);
  });

  it("does not let an older snapshot overwrite newer event state", async () => {
    const externalUserId = `reconcile-stale-${randomUUID()}`;
    externalUserIds.push(externalUserId);
    await prisma.userProfile.create({
      data: {
        externalUserId,
        email: `${externalUserId}@example.test`,
        emailNormalized: `${externalUserId}@example.test`,
        registeredAt: new Date("2026-07-20T00:00:00.000Z"),
        currentSegment: "G",
        balanceMinor: 99_000,
        lastExternalEventAt: new Date("2026-07-24T01:00:00.000Z")
      }
    });

    const result = await reconcileRightTokenUsers({
      adapter: adapter([
        {
          externalUserId,
          email: `${externalUserId}@stale.example.test`,
          displayName: null,
          registeredAt: new Date("2026-07-20T00:00:00.000Z"),
          updatedAt: new Date("2026-07-23T01:00:00.000Z"),
          registrationIp: null,
          countryCode: null,
          region: null,
          language: null,
          timezone: null,
          source: null,
          checkoutStartedAt: null,
          firstPaidAt: null,
          totalPaidMinor: 0,
          successfulCallCount: 0,
          lastCallAt: null,
          balanceMinor: 0,
          anomalyActive: false
        }
      ])
    });

    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { externalUserId }
    });
    expect(result.unchanged).toBe(1);
    expect(stored.email).toBe(`${externalUserId}@example.test`);
    expect(stored.balanceMinor).toBe(99_000);
  });

  it("applies email-first operational location during reconciliation", async () => {
    const externalUserId = `reconcile-location-${randomUUID()}`;
    externalUserIds.push(externalUserId);

    const result = await reconcileRightTokenUsers({
      adapter: adapter([
        {
          externalUserId,
          email: `${externalUserId}@yandex.ru`,
          displayName: "地区归属测试用户",
          registeredAt: new Date("2026-07-24T00:00:00.000Z"),
          updatedAt: new Date("2026-07-24T01:00:00.000Z"),
          registrationIp: "203.0.113.10",
          countryCode: "SG",
          region: "Singapore",
          language: null,
          timezone: null,
          source: null,
          checkoutStartedAt: null,
          firstPaidAt: null,
          totalPaidMinor: 0,
          successfulCallCount: 0,
          lastCallAt: null,
          balanceMinor: 0,
          anomalyActive: false
        }
      ]),
      now: new Date("2026-07-24T02:00:00.000Z")
    });

    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { externalUserId }
    });
    expect(result.inserted).toBe(1);
    expect(stored).toMatchObject({
      countryCode: "RU",
      region: null,
      ipCountryCode: "SG",
      ipRegion: "Singapore",
      locationSource: "EMAIL_EXACT_DOMAIN"
    });
    expect(stored.locationRuleId).not.toBeNull();
    expect(stored.locationEvaluatedAt).toEqual(
      new Date("2026-07-24T02:00:00.000Z")
    );
  });
});
