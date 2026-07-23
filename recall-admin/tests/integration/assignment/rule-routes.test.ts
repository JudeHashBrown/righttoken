import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as publishRules } from "@/app/api/automation/assignment-rules/route";
import { POST as previewRules } from "@/app/api/automation/assignment-rules/preview/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("administrator assignment-rule routes", () => {
  let adminId: string;
  let operatorId: string;
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    const [admin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `assignment-admin-${randomUUID()}@example.test`,
          displayName: "Assignment Admin",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `assignment-route-operator-${randomUUID()}@example.test`,
          displayName: "Assignment Route Operator",
          passwordHash: "not-used-in-this-test",
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
  });

  afterAll(async () => {
    await revokeSessionByToken(adminToken);
    await revokeSessionByToken(operatorToken);
    await prisma.auditLog.deleteMany({
      where: {
        actorId: adminId,
        action: "assignment_rules.published"
      }
    });
    await prisma.assignmentRule.deleteMany({
      where: {
        name: { in: ["接口美国规则", "接口公共池"] }
      }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [adminId, operatorId].filter(Boolean) } }
    });
    await prisma.$disconnect();
  });

  function request(
    url: string,
    token: string,
    body: unknown
  ): NextRequest {
    return new NextRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
        cookie: `${SESSION_COOKIE_NAME}=${token}`
      },
      body: JSON.stringify(body)
    });
  }

  const rules = () => [
    {
      name: "接口美国规则",
      enabled: true,
      priority: 10,
      conditions: {
        countryCodes: ["US"],
        ipCidrs: ["203.0.113.0/24"]
      },
      assigneeId: operatorId,
      fallbackAssigneeId: null,
      poolKey: null,
      workloadLimit: 20,
      effectiveFrom: null,
      effectiveTo: null
    },
    {
      name: "接口公共池",
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
  ];

  it("rejects rule publication by an operator", async () => {
    const response = await publishRules(
      request(
        "http://127.0.0.1:3000/api/automation/assignment-rules",
        operatorToken,
        { rules: rules() }
      )
    );

    expect(response.status).toBe(403);
  });

  it("lets an administrator publish an audited ordered ruleset", async () => {
    const response = await publishRules(
      request(
        "http://127.0.0.1:3000/api/automation/assignment-rules",
        adminToken,
        { rules: rules() }
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ published: 2 });
    expect(
      await prisma.assignmentRule.findMany({
        orderBy: { priority: "asc" },
        select: { name: true, priority: true }
      })
    ).toEqual([
      { name: "接口美国规则", priority: 10 },
      { name: "接口公共池", priority: 999 }
    ]);
    expect(
      await prisma.auditLog.findFirst({
        where: {
          actorId: adminId,
          action: "assignment_rules.published"
        }
      })
    ).not.toBeNull();
  });

  it("previews rules for an administrator without publishing", async () => {
    const beforeCount = await prisma.assignmentRule.count();
    const response = await previewRules(
      request(
        "http://127.0.0.1:3000/api/automation/assignment-rules/preview",
        adminToken,
        {
          rules: rules().map((rule, index) => ({
            ...rule,
            name: `未保存预览 ${index + 1}`
          }))
        }
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sampledUsers: expect.any(Number)
    });
    expect(await prisma.assignmentRule.count()).toBe(beforeCount);
  });
});
