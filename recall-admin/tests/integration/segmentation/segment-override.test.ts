import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import {
  createSegmentOverride,
  revokeSegmentOverride
} from "@/modules/segmentation/segment-override";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("audited manual segment overrides", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");
  let adminId: string;
  let operatorId: string;
  let userId: string;

  beforeAll(async () => {
    const [admin, operator, user] = await Promise.all([
      prisma.member.create({
        data: {
          email: `override-admin-${randomUUID()}@example.test`,
          displayName: "Override Admin",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `override-operator-${randomUUID()}@example.test`,
          displayName: "Override Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `override-user-${randomUUID()}`,
          email: `override-user-${randomUUID()}@example.test`,
          emailNormalized: `override-user-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-23T08:00:00.000Z"),
          currentSegment: "A"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { entityType: "SegmentOverride", actorId: adminId }
    });
    if (userId) {
      await prisma.userProfile.delete({ where: { id: userId } });
    }
    await prisma.member.deleteMany({
      where: { id: { in: [adminId, operatorId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  it("allows an admin to override a segment for at most 30 days", async () => {
    const override = await createSegmentOverride(
      adminId,
      userId,
      "G",
      "人工确认已恢复活跃",
      new Date(now.getTime() + 7 * DAY_MS),
      now
    );

    expect(override.segment).toBe("G");
    expect(
      (
        await prisma.userProfile.findUniqueOrThrow({
          where: { id: userId }
        })
      ).currentSegment
    ).toBe("G");
    expect(
      await prisma.auditLog.findFirst({
        where: {
          actorId: adminId,
          action: "segment_override.created",
          entityId: override.id
        }
      })
    ).not.toBeNull();

    await expect(
      createSegmentOverride(
        adminId,
        userId,
        "B",
        "时间过长",
        new Date(now.getTime() + 31 * DAY_MS),
        now
      )
    ).rejects.toThrow(/30 days/);
  });

  it("rejects an operator override", async () => {
    await expect(
      createSegmentOverride(
        operatorId,
        userId,
        "B",
        "无权限操作",
        new Date(now.getTime() + DAY_MS),
        now
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects a manual override while anomaly segment F is active", async () => {
    await prisma.userProfile.update({
      where: { id: userId },
      data: {
        anomalyActive: true,
        anomalyChangedAt: now,
        currentSegment: "F"
      }
    });
    const overrideCount = await prisma.segmentOverride.count({
      where: { userId }
    });

    await expect(
      createSegmentOverride(
        adminId,
        userId,
        "G",
        "等待异常恢复",
        new Date(now.getTime() + DAY_MS),
        now
      )
    ).rejects.toThrow(/active service anomalies/);

    expect(
      (
        await prisma.userProfile.findUniqueOrThrow({
          where: { id: userId }
        })
      ).currentSegment
    ).toBe("F");
    expect(
      await prisma.segmentOverride.count({ where: { userId } })
    ).toBe(overrideCount);
  });

  it("revokes an override, resegments the user, and records an audit", async () => {
    await prisma.userProfile.update({
      where: { id: userId },
      data: { anomalyActive: false, anomalyChangedAt: now }
    });
    const override = await createSegmentOverride(
      adminId,
      userId,
      "G",
      "短期人工接管",
      new Date(now.getTime() + DAY_MS),
      now
    );

    await revokeSegmentOverride(adminId, override.id, now);

    expect(
      (
        await prisma.userProfile.findUniqueOrThrow({
          where: { id: userId }
        })
      ).currentSegment
    ).toBe("A");
    expect(
      await prisma.auditLog.findFirst({
        where: {
          actorId: adminId,
          action: "segment_override.revoked",
          entityId: override.id
        }
      })
    ).not.toBeNull();
  });
});
