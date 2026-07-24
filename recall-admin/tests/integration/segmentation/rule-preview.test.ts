import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as previewRules } from "@/app/api/automation/segment-rules/preview/route";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("segment rule preview", () => {
  const userIds: string[] = [];
  let adminId: string;
  let operatorId: string;
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    const [admin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `segment-preview-admin-${randomUUID()}@example.test`,
          displayName: "Preview Admin",
          passwordHash: "not-used",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `segment-preview-operator-${randomUUID()}@example.test`,
          displayName: "Preview Operator",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
    const [adminSession, operatorSession] = await Promise.all([
      createSession(adminId),
      createSession(operatorId)
    ]);
    adminToken = adminSession.token;
    operatorToken = operatorSession.token;

    const users = await Promise.all([
      prisma.userProfile.create({
        data: {
          externalUserId: `preview-a-${randomUUID()}`,
          email: `preview-a-${randomUUID()}@example.test`,
          emailNormalized: `preview-a-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-24T10:00:00.000Z"),
          currentSegment: "A"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `preview-e-${randomUUID()}`,
          email: `preview-e-${randomUUID()}@example.test`,
          emailNormalized: `preview-e-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-01T00:00:00.000Z"),
          firstPaidAt: new Date("2026-07-01T01:00:00.000Z"),
          successfulCallCount: 2,
          firstCallAt: new Date("2026-07-01T02:00:00.000Z"),
          lastCallAt: new Date("2026-07-01T02:00:00.000Z"),
          balanceMinor: 44,
          balanceCurrency: "EUR",
          balanceUsdMinor: 49,
          balanceChangedAt: new Date("2026-07-20T00:00:00.000Z"),
          currentSegment: "D"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `preview-f-${randomUUID()}`,
          email: `preview-f-${randomUUID()}@example.test`,
          emailNormalized: `preview-f-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-20T00:00:00.000Z"),
          anomalyActive: true,
          anomalyChangedAt: new Date("2026-07-24T11:00:00.000Z"),
          currentSegment: "F"
        }
      })
    ]);
    userIds.push(...users.map((user) => user.id));
  });

  afterAll(async () => {
    await revokeSessionByToken(adminToken);
    await revokeSessionByToken(operatorToken);
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [adminId, operatorId] } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [adminId, operatorId] } }
    });
    await prisma.$disconnect();
  });

  function request(token: string): NextRequest {
    return new NextRequest(
      "http://127.0.0.1:3000/api/automation/segment-rules/preview",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3000",
          cookie: `${SESSION_COOKIE_NAME}=${token}`
        },
        body: JSON.stringify({ draft: defaultSegmentRuleSet })
      }
    );
  }

  it("previews every user without modifying profiles or tasks", async () => {
    const before = {
      histories: await prisma.segmentHistory.count(),
      tasks: await prisma.recallTask.count()
    };
    const response = await previewRules(request(adminToken));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      totalUsers: expect.any(Number),
      migrations: expect.any(Number),
      overlapUsers: expect.any(Number),
      fallbackUsers: expect.any(Number),
      token: expect.any(String),
      draftHash: expect.any(String)
    });
    expect(result.samples ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: expect.anything(),
          registrationIp: expect.anything()
        })
      ])
    );
    expect(await prisma.segmentHistory.count()).toBe(before.histories);
    expect(await prisma.recallTask.count()).toBe(before.tasks);
  });

  it("rejects preview by an operator", async () => {
    const response = await previewRules(request(operatorToken));
    expect(response.status).toBe(403);
  });
});
