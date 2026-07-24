import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as transitionTask } from "@/app/api/tasks/[id]/transition/route";
import { POST as transferTask } from "@/app/api/tasks/[id]/transfer/route";
import { POST as addUserNote } from "@/app/api/users/[id]/notes/route";
import {
  DELETE as revokeOverride,
  POST as createOverride
} from "@/app/api/users/[id]/segment-override/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("user and task workspace mutation routes", () => {
  const memberIds: string[] = [];
  const sessionTokens: string[] = [];
  let adminId: string;
  let firstOperatorId: string;
  let secondOperatorId: string;
  let adminToken: string;
  let firstOperatorToken: string;
  let secondOperatorToken: string;
  let ownedUserId: string;
  let otherUserId: string;
  let publicTaskId: string;
  let transferTaskId: string;

  beforeAll(async () => {
    const [admin, firstOperator, secondOperator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `${randomUUID()}@example.test`,
          displayName: "Route Admin",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `${randomUUID()}@example.test`,
          displayName: "Route Operator One",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `${randomUUID()}@example.test`,
          displayName: "Route Operator Two",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    firstOperatorId = firstOperator.id;
    secondOperatorId = secondOperator.id;
    memberIds.push(adminId, firstOperatorId, secondOperatorId);

    const sessions = await Promise.all([
      createSession(adminId),
      createSession(firstOperatorId),
      createSession(secondOperatorId)
    ]);
    [adminToken, firstOperatorToken, secondOperatorToken] =
      sessions.map((session) => session.token);
    sessionTokens.push(
      adminToken,
      firstOperatorToken,
      secondOperatorToken
    );

    const [ownedUser, otherUser] = await Promise.all([
      prisma.userProfile.create({
        data: {
          externalUserId: `route-owned-${randomUUID()}`,
          email: `route-owned-${randomUUID()}@example.test`,
          emailNormalized: `route-owned-${randomUUID()}@example.test`,
          registeredAt: new Date(),
          currentSegment: "A",
          ownerId: firstOperatorId
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `route-other-${randomUUID()}`,
          email: `route-other-${randomUUID()}@example.test`,
          emailNormalized: `route-other-${randomUUID()}@example.test`,
          registeredAt: new Date(),
          currentSegment: "A",
          ownerId: secondOperatorId
        }
      })
    ]);
    ownedUserId = ownedUser.id;
    otherUserId = otherUser.id;

    const [publicTask, assignedTask] = await Promise.all([
      prisma.recallTask.create({
        data: {
          userId: ownedUserId,
          origin: "MANUAL",
          triggerKey: `route-public-${randomUUID()}`,
          ruleVersion: 1,
          title: "Route public task",
          reason: "Claim route test",
          priority: "IMPORTANT",
          dueAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      }),
      prisma.recallTask.create({
        data: {
          userId: ownedUserId,
          origin: "MANUAL",
          triggerKey: `route-transfer-${randomUUID()}`,
          ruleVersion: 1,
          title: "Route transfer task",
          reason: "Transfer route test",
          priority: "NORMAL",
          status: "TODO",
          assigneeId: firstOperatorId,
          dueAt: new Date(Date.now() + 60 * 60 * 1000)
        }
      })
    ]);
    publicTaskId = publicTask.id;
    transferTaskId = assignedTask.id;
  });

  afterAll(async () => {
    await prisma.segmentOverride.deleteMany({
      where: { userId: { in: [ownedUserId, otherUserId] } }
    });
    await prisma.userProfile.deleteMany({
      where: { id: { in: [ownedUserId, otherUserId] } }
    });
    await Promise.all(sessionTokens.map(revokeSessionByToken));
    await prisma.member.deleteMany({
      where: { id: { in: memberIds } }
    });
    await prisma.$disconnect();
  });

  function request(
    path: string,
    token: string,
    body: unknown
  ): NextRequest {
    return new NextRequest(`http://127.0.0.1:3000${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
        cookie: `${SESSION_COOKIE_NAME}=${token}`
      },
      body: JSON.stringify(body)
    });
  }

  it("lets an operator claim a public task", async () => {
    const response = await transitionTask(
      request(
        `/api/tasks/${publicTaskId}/transition`,
        firstOperatorToken,
        { action: "claim" }
      ),
      { params: Promise.resolve({ id: publicTaskId }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      task: {
        status: "TODO",
        assigneeId: firstOperatorId
      }
    });
  });

  it("rejects another operator changing an assigned task", async () => {
    const response = await transitionTask(
      request(
        `/api/tasks/${transferTaskId}/transition`,
        secondOperatorToken,
        { action: "start" }
      ),
      { params: Promise.resolve({ id: transferTaskId }) }
    );

    expect(response.status).toBe(403);
  });

  it("transfers a task with an audit activity reason", async () => {
    const response = await transferTask(
      request(
        `/api/tasks/${transferTaskId}/transfer`,
        firstOperatorToken,
        {
          assigneeId: secondOperatorId,
          reason: "切换到夜班运营"
        }
      ),
      { params: Promise.resolve({ id: transferTaskId }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      task: { assigneeId: secondOperatorId }
    });
    expect(
      await prisma.taskActivity.findFirst({
        where: {
          taskId: transferTaskId,
          action: "task.transferred"
        }
      })
    ).toMatchObject({
      detail: expect.objectContaining({
        reason: "切换到夜班运营"
      })
    });
  });

  it("lets an operator note an authorized user only", async () => {
    const accepted = await addUserNote(
      request(
        `/api/users/${ownedUserId}/notes`,
        firstOperatorToken,
        { body: "已通过企业微信联系用户" }
      ),
      { params: Promise.resolve({ id: ownedUserId }) }
    );
    const rejected = await addUserNote(
      request(
        `/api/users/${otherUserId}/notes`,
        firstOperatorToken,
        { body: "不应写入" }
      ),
      { params: Promise.resolve({ id: otherUserId }) }
    );

    expect(accepted.status).toBe(201);
    expect(rejected.status).toBe(403);
    expect(
      await prisma.userNote.findFirst({
        where: {
          userId: ownedUserId,
          authorId: firstOperatorId
        }
      })
    ).toMatchObject({ body: "已通过企业微信联系用户" });
  });

  it("lets an administrator create a temporary segment override", async () => {
    const response = await createOverride(
      request(
        `/api/users/${ownedUserId}/segment-override`,
        adminToken,
        {
          segment: "D",
          reason: "人工确认用户暂停调用",
          expiresAt: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString()
        }
      ),
      { params: Promise.resolve({ id: ownedUserId }) }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      override: {
        userId: ownedUserId,
        segment: "D"
      }
    });
    expect(
      await prisma.userProfile.findUniqueOrThrow({
        where: { id: ownedUserId }
      })
    ).toMatchObject({ currentSegment: "D" });

    const revokeResponse = await revokeOverride(
      request(
        `/api/users/${ownedUserId}/segment-override`,
        adminToken,
        { overrideId: body.override.id }
      ),
      { params: Promise.resolve({ id: ownedUserId }) }
    );

    expect(revokeResponse.status).toBe(200);
    expect(
      await prisma.segmentOverride.findUniqueOrThrow({
        where: { id: body.override.id }
      })
    ).toMatchObject({ revokedAt: expect.any(Date) });
  });

  it("does not allow an active F anomaly to be overridden", async () => {
    await prisma.userProfile.update({
      where: { id: otherUserId },
      data: {
        currentSegment: "F",
        anomalyActive: true,
        anomalyChangedAt: new Date()
      }
    });

    const response = await createOverride(
      request(
        `/api/users/${otherUserId}/segment-override`,
        adminToken,
        {
          segment: "D",
          reason: "不应覆盖服务异常",
          expiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString()
        }
      ),
      { params: Promise.resolve({ id: otherUserId }) }
    );

    expect(response.status).toBe(400);
    expect(
      await prisma.segmentOverride.count({
        where: { userId: otherUserId }
      })
    ).toBe(0);
  });
});
