import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as grantMemberAccess } from "@/app/api/members/access/route";
import { DELETE as revokeMemberAccess } from "@/app/api/members/[id]/access/route";
import { POST as transferPrimary } from "@/app/api/members/primary-transfer/route";
import { Prisma } from "@/generated/prisma/client";
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
  let registeredUserProfileId: string;
  let registeredRightTokenUserId: string;
  let sessionToken: string;
  let grantedMemberId: string;
  let grantedSessionToken: string;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.users (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL DEFAULT '',
        deleted_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const [registeredUser] = await prisma.$queryRaw<
      Array<{ externalUserId: string }>
    >(
      Prisma.sql`
        INSERT INTO public.users (email, username)
        VALUES (${registeredEmail}, 'Registered Route User')
        RETURNING id::text AS "externalUserId"
      `
    );
    registeredRightTokenUserId = registeredUser.externalUserId;
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
    registeredUserProfileId = (
      await prisma.userProfile.create({
        data: {
          externalUserId: registeredRightTokenUserId,
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
      where: { id: registeredUserProfileId }
    });
    await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM public.users
        WHERE id::text = ${registeredRightTokenUserId}
      `
    );
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
      rightTokenUserId: registeredRightTokenUserId,
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
      where: { id: registeredUserProfileId },
      data: { ownerId: grantedMemberId }
    });
    const task = await prisma.recallTask.create({
      data: {
        userId: registeredUserProfileId,
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
      reassignedUsers: 1,
      transferredTasks: 1,
      failedUsers: 0
    });
    await expect(
      prisma.member.findUniqueOrThrow({
        where: { id: grantedMemberId },
        select: { active: true }
      })
    ).resolves.toEqual({ active: false });
    const [reassignedUser, transferredTask] = await Promise.all([
      prisma.userProfile.findUniqueOrThrow({
        where: { id: registeredUserProfileId },
        select: { ownerId: true }
      }),
      prisma.recallTask.findUniqueOrThrow({
        where: { id: task.id },
        select: { assigneeId: true, status: true }
      })
    ]);
    expect(reassignedUser.ownerId).not.toBeNull();
    expect(reassignedUser.ownerId).not.toBe(grantedMemberId);
    expect(transferredTask).toEqual({
      assigneeId: reassignedUser.ownerId,
      status: "IN_PROGRESS"
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
