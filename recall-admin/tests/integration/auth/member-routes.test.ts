import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as grantMemberAccess } from "@/app/api/members/access/route";
import { DELETE as revokeMemberAccess } from "@/app/api/members/[id]/access/route";
import { POST as transferPrimary } from "@/app/api/members/primary-transfer/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  markReauthenticated,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("privileged member routes", () => {
  const suffix = randomUUID();
  const registeredEmail = `route-member-${suffix}@example.test`;
  let currentPrimaryId: string;
  let targetAdminId: string;
  let registeredUserId: string;
  let sessionToken: string;
  let grantedMemberId: string;
  let grantedSessionToken: string;

  beforeAll(async () => {
    currentPrimaryId = (
      await prisma.member.findFirstOrThrow({
        where: { role: "PRIMARY_ADMIN" }
      })
    ).id;
    targetAdminId = (
      await prisma.member.create({
        data: {
          email: `route-target-${suffix}@example.test`,
          displayName: "Route Target",
          passwordHash: "RIGHTTOKEN_MANAGED_IDENTITY",
          role: "ADMIN"
        }
      })
    ).id;
    registeredUserId = (
      await prisma.userProfile.create({
        data: {
          externalUserId: `righttoken-route-${suffix}`,
          email: registeredEmail,
          emailNormalized: registeredEmail,
          displayName: "Registered Route User",
          registeredAt: new Date(),
          currentSegment: "G"
        }
      })
    ).id;
    const session = await createSession(currentPrimaryId);
    sessionToken = session.token;
    await markReauthenticated(session.id);
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.member.update({
        where: { id: currentPrimaryId },
        data: { role: "PRIMARY_ADMIN" }
      }),
      prisma.member.update({
        where: { id: targetAdminId },
        data: { role: "ADMIN" }
      })
    ]);
    await revokeSessionByToken(sessionToken);
    if (grantedSessionToken) {
      await revokeSessionByToken(grantedSessionToken);
    }
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: targetAdminId },
          ...(grantedMemberId ? [{ entityId: grantedMemberId }] : [])
        ]
      }
    });
    if (grantedMemberId) {
      await prisma.member.deleteMany({
        where: { id: grantedMemberId }
      });
    }
    await prisma.userProfile.deleteMany({
      where: { id: registeredUserId }
    });
    await prisma.member.delete({ where: { id: targetAdminId } });
    await prisma.$disconnect();
  });

  it("grants access only to a synchronized RightToken user", async () => {
    const response = await grantMemberAccess(
      new NextRequest("http://127.0.0.1:3101/api/members/access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3101",
          cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
        },
        body: JSON.stringify({
          email: registeredEmail,
          role: "OPERATOR"
        })
      })
    );

    expect(response.status).toBe(201);
    const result = (await response.json()) as {
      member: {
        id: string;
        rightTokenUserId: string;
        role: string;
      };
    };
    grantedMemberId = result.member.id;
    expect(result.member).toMatchObject({
      rightTokenUserId: `righttoken-route-${suffix}`,
      role: "OPERATOR"
    });

    const missing = await grantMemberAccess(
      new NextRequest("http://127.0.0.1:3101/api/members/access", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3101",
          cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
        },
        body: JSON.stringify({
          email: `not-registered-${suffix}@example.test`,
          role: "OPERATOR"
        })
      })
    );
    expect(missing.status).toBe(404);
  });

  it("revokes sessions and releases assigned work", async () => {
    const grantedSession = await createSession(grantedMemberId);
    grantedSessionToken = grantedSession.token;
    await prisma.userProfile.update({
      where: { id: registeredUserId },
      data: { ownerId: grantedMemberId }
    });
    const task = await prisma.recallTask.create({
      data: {
        userId: registeredUserId,
        origin: "MANUAL",
        triggerKey: `member-revoke-${suffix}`,
        ruleVersion: 1,
        title: "Release on member revoke",
        reason: "Integration verification",
        priority: "NORMAL",
        status: "IN_PROGRESS",
        assigneeId: grantedMemberId,
        dueAt: new Date(Date.now() + 60_000)
      }
    });

    const response = await revokeMemberAccess(
      new NextRequest(
        `http://127.0.0.1:3101/api/members/${grantedMemberId}/access`,
        {
          method: "DELETE",
          headers: {
            origin: "http://127.0.0.1:3101",
            cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
          }
        }
      ),
      { params: Promise.resolve({ id: grantedMemberId }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revokedSessions: 1,
      releasedUsers: 1,
      releasedTasks: 1
    });
    await expect(
      prisma.member.findUniqueOrThrow({
        where: { id: grantedMemberId },
        select: { active: true }
      })
    ).resolves.toEqual({ active: false });
    await expect(
      prisma.recallTask.findUniqueOrThrow({
        where: { id: task.id },
        select: { assigneeId: true, status: true }
      })
    ).resolves.toEqual({
      assigneeId: null,
      status: "UNASSIGNED"
    });
  });

  it("transfers the primary role through a recently verified session", async () => {
    const response = await transferPrimary(
      new NextRequest(
        "http://127.0.0.1:3101/api/members/primary-transfer",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3101",
            cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
          },
          body: JSON.stringify({ targetAdminId })
        }
      )
    );

    expect(response.status).toBe(200);
    expect(
      await prisma.member.count({
        where: { role: "PRIMARY_ADMIN" }
      })
    ).toBe(1);
  });
});
