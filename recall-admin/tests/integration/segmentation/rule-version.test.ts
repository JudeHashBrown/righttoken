import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import { publishAutomationRuleVersion } from "@/modules/automation/rule-version";
import {
  defaultNotificationPolicy,
  notificationPolicySchema
} from "@/modules/notifications/policy-config";

describe("versioned segmentation rules", () => {
  const ruleKind = `segmentation-${randomUUID()}`;
  const notificationRuleKind = `notifications-${randomUUID()}`;
  let adminId: string;
  let operatorId: string;

  beforeAll(async () => {
    const [admin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `rule-admin-${randomUUID()}@example.test`,
          displayName: "Rule Admin",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `rule-operator-${randomUUID()}@example.test`,
          displayName: "Rule Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityType: "AutomationRuleVersion", actorId: adminId }
    });
    await prisma.automationRuleVersion.deleteMany({
      where: { kind: { in: [ruleKind, notificationRuleKind] } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [adminId, operatorId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  it("rejects publishing by an operator", async () => {
    await expect(
      publishAutomationRuleVersion(operatorId, ruleKind, {
        emptyBalanceMinor: 0,
        inactiveMs: 7 * 24 * 60 * 60 * 1000
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("increments versions and leaves exactly one active version", async () => {
    const first = await publishAutomationRuleVersion(
      adminId,
      ruleKind,
      {
        emptyBalanceMinor: 0,
        inactiveMs: 7 * 24 * 60 * 60 * 1000
      }
    );
    const second = await publishAutomationRuleVersion(
      adminId,
      ruleKind,
      {
        emptyBalanceMinor: 100,
        inactiveMs: 14 * 24 * 60 * 60 * 1000
      }
    );

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(
      await prisma.automationRuleVersion.count({
        where: { kind: ruleKind, active: true }
      })
    ).toBe(1);
    expect(
      await prisma.automationRuleVersion.findUniqueOrThrow({
        where: {
          kind_version: { kind: ruleKind, version: first.version }
        }
      })
    ).toMatchObject({ active: false });
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: adminId,
          action: "automation_rule.published",
          entityType: "AutomationRuleVersion"
        }
      })
    ).toBe(2);
  });

  it("serializes concurrent publications without duplicate versions", async () => {
    const [third, fourth] = await Promise.all([
      publishAutomationRuleVersion(adminId, ruleKind, {
        emptyBalanceMinor: 200,
        inactiveMs: 21 * 24 * 60 * 60 * 1000
      }),
      publishAutomationRuleVersion(adminId, ruleKind, {
        emptyBalanceMinor: 300,
        inactiveMs: 28 * 24 * 60 * 60 * 1000
      })
    ]);

    expect([third.version, fourth.version].sort()).toEqual([3, 4]);
    expect(
      await prisma.automationRuleVersion.count({
        where: { kind: ruleKind, active: true }
      })
    ).toBe(1);
  });

  it("enforces one active version at the database boundary", async () => {
    await expect(
      prisma.automationRuleVersion.create({
        data: {
          kind: ruleKind,
          version: 5,
          config: {
            emptyBalanceMinor: 0,
            inactiveMs: 7 * 24 * 60 * 60 * 1000
          },
          active: true,
          createdById: adminId
        }
      })
    ).rejects.toThrow();
  });

  it("rejects an invalid segmentation configuration", async () => {
    await expect(
      publishAutomationRuleVersion(adminId, ruleKind, {
        emptyBalanceMinor: 0,
        inactiveMs: 0
      })
    ).rejects.toThrow();
  });

  it("supports a validated notification policy version", async () => {
    const published = await publishAutomationRuleVersion(
      adminId,
      notificationRuleKind,
      defaultNotificationPolicy,
      notificationPolicySchema
    );

    expect(published).toMatchObject({
      kind: notificationRuleKind,
      version: 1,
      active: true
    });
    expect(published.config).toMatchObject({
      dailyDigestTime: "10:00"
    });
  });
});
