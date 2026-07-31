import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  findMailAudienceUsers,
  previewMailAudience
} from "@/modules/mail/mail-audience";

describe("mail audience resolution", () => {
  let operatorId: string;
  let otherOperatorId: string;
  const userIds: string[] = [];
  const expectedIncludedIds: string[] = [];
  const expectedExcludedIds: string[] = [];

  beforeAll(async () => {
    const [operator, otherOperator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `audience-operator-${randomUUID()}@example.test`,
          displayName: "Audience Operator",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email:
            `audience-other-${randomUUID()}@example.test`,
          displayName: "Other Operator",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      })
    ]);
    operatorId = operator.id;
    otherOperatorId = otherOperator.id;

    const createUser = async (input: {
      segment: "F" | "A";
      ownerId?: string | null;
      email?: string;
      unsubscribedAt?: Date;
      pausedAt?: Date;
      sourceDeletedAt?: Date;
    }) => {
      const email =
        input.email ??
        `audience-user-${randomUUID()}@example.test`;
      const user = await prisma.userProfile.create({
        data: {
          externalUserId: `audience-${randomUUID()}`,
          email,
          emailNormalized: email.toLowerCase(),
          registeredAt: new Date("2026-07-30T08:00:00.000Z"),
          currentSegment: input.segment,
          ownerId: input.ownerId,
          unsubscribedAt: input.unsubscribedAt,
          pausedAt: input.pausedAt,
          sourceDeletedAt: input.sourceDeletedAt
        }
      });
      userIds.push(user.id);
      return user;
    };

    expectedIncludedIds.push(
      (
        await createUser({
          segment: "F",
          ownerId: operatorId
        })
      ).id
    );
    expectedIncludedIds.push(
      (
        await createUser({ segment: "F", ownerId: null })
      ).id
    );
    expectedIncludedIds.push((
      await createUser({
      segment: "F",
      ownerId: operatorId,
      pausedAt: new Date("2026-07-30T09:00:00.000Z")
      })
    ).id);
    expectedExcludedIds.push(
      (
        await createUser({
          segment: "F",
          ownerId: otherOperatorId
        })
      ).id
    );
    expectedExcludedIds.push(
      (
        await createUser({
          segment: "A",
          ownerId: operatorId
        })
      ).id
    );
    expectedExcludedIds.push((
      await createUser({
      segment: "F",
      ownerId: operatorId,
      sourceDeletedAt: new Date("2026-07-30T10:00:00.000Z")
      })
    ).id);
  });

  afterAll(async () => {
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [operatorId, otherOperatorId] } }
    });
    await prisma.$disconnect();
  });

  it("limits an operator segment audience to owned and unowned users", async () => {
    const viewer = {
      id: operatorId,
      role: "OPERATOR" as const
    };
    const audience = {
      mode: "SEGMENT" as const,
      segment: "F" as const
    };
    const rows = await findMailAudienceUsers(
      prisma,
      viewer,
      audience
    );
    const preview = await previewMailAudience(
      viewer,
      audience
    );

    const resolvedIds = rows.map((row) => row.id);
    expect(resolvedIds).toEqual(
      expect.arrayContaining(expectedIncludedIds)
    );
    for (const excludedId of expectedExcludedIds) {
      expect(resolvedIds).not.toContain(excludedId);
    }
    expect(preview).toMatchObject({
      label: "F 组全员",
      total: rows.length
    });
    expect(preview.estimatedSkipped).toBeGreaterThanOrEqual(1);
    expect(Object.keys(preview)).not.toContain("emails");
    expect(JSON.stringify(preview)).not.toContain("@");
  });

  it("lets an admin preview every active user", async () => {
    const preview = await previewMailAudience(
      { id: operatorId, role: "ADMIN" },
      { mode: "ALL" }
    );

    expect(preview.label).toBe("全部用户");
    expect(preview.total).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(preview)).not.toContain("@");
  });
});
