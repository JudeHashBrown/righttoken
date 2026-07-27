import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/members/[id]/wecom/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

function request(
  memberId: string,
  token: string,
  wecomUserId: string | null
) {
  return new NextRequest(
    `http://127.0.0.1:3000/api/members/${memberId}/wecom`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
        cookie: `${SESSION_COOKIE_NAME}=${token}`
      },
      body: JSON.stringify({ wecomUserId })
    }
  );
}

describe("member WeCom mapping route", () => {
  const memberIds: string[] = [];
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    const [admin, operator, target, duplicateTarget] =
      await Promise.all([
        prisma.member.create({
          data: {
            email: `wecom-admin-${randomUUID()}@example.test`,
            displayName: "企微映射管理员",
            passwordHash: "not-used",
            role: "ADMIN"
          }
        }),
        prisma.member.create({
          data: {
            email: `wecom-operator-${randomUUID()}@example.test`,
            displayName: "企微普通运营",
            passwordHash: "not-used",
            role: "OPERATOR"
          }
        }),
        prisma.member.create({
          data: {
            email: `wecom-target-${randomUUID()}@example.test`,
            displayName: "企微目标运营",
            passwordHash: "not-used",
            role: "OPERATOR"
          }
        }),
        prisma.member.create({
          data: {
            email: `wecom-duplicate-${randomUUID()}@example.test`,
            displayName: "企微重复运营",
            passwordHash: "not-used",
            role: "OPERATOR"
          }
        })
      ]);
    memberIds.push(
      admin.id,
      operator.id,
      target.id,
      duplicateTarget.id
    );
    adminToken = (await createSession(admin.id)).token;
    operatorToken = (await createSession(operator.id)).token;
  });

  afterAll(async () => {
    await revokeSessionByToken(adminToken);
    await revokeSessionByToken(operatorToken);
    await prisma.auditLog.deleteMany({
      where: {
        entityType: "MemberWecomMapping",
        entityId: { in: memberIds }
      }
    });
    await prisma.member.deleteMany({
      where: { id: { in: memberIds } }
    });
    await prisma.$disconnect();
  });

  it("lets an administrator set and clear a mapping", async () => {
    const targetId = memberIds[2]!;
    const context = { params: Promise.resolve({ id: targetId }) };
    const saved = await PATCH(
      request(targetId, adminToken, "zhangsan"),
      context
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      member: { id: targetId, wecomUserId: "zhangsan" }
    });

    const cleared = await PATCH(
      request(targetId, adminToken, null),
      context
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({
      member: { id: targetId, wecomUserId: null }
    });
  });

  it("rejects operator changes and duplicate UserIDs", async () => {
    const targetId = memberIds[2]!;
    const duplicateTargetId = memberIds[3]!;
    const forbidden = await PATCH(
      request(targetId, operatorToken, "forbidden"),
      { params: Promise.resolve({ id: targetId }) }
    );
    expect(forbidden.status).toBe(403);

    await PATCH(request(targetId, adminToken, "same-user"), {
      params: Promise.resolve({ id: targetId })
    });
    const duplicate = await PATCH(
      request(duplicateTargetId, adminToken, "same-user"),
      { params: Promise.resolve({ id: duplicateTargetId }) }
    );
    expect(duplicate.status).toBe(409);
  });
});
