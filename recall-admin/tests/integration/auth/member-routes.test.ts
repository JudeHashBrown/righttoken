import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  POST as inviteMember,
  PUT as acceptMemberInvitation
} from "@/app/api/members/invitations/route";
import { POST as transferPrimary } from "@/app/api/members/primary-transfer/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  markReauthenticated,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("privileged member routes", () => {
  const invitedEmail = `route-invite-${randomUUID()}@example.test`;
  const staleInvitedEmail = `route-stale-${randomUUID()}@example.test`;
  let currentPrimaryId: string;
  let targetAdminId: string;
  let sessionToken: string;
  let staleSessionToken: string;
  let invitationToken: string;
  let acceptedMemberId: string;

  beforeAll(async () => {
    currentPrimaryId = (
      await prisma.member.findFirstOrThrow({
        where: { role: "PRIMARY_ADMIN" }
      })
    ).id;
    targetAdminId = (
      await prisma.member.create({
        data: {
          email: `route-target-${randomUUID()}@example.test`,
          displayName: "Route Target",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      })
    ).id;
    const session = await createSession(currentPrimaryId);
    sessionToken = session.token;
    await markReauthenticated(session.id);
    const staleSession = await createSession(currentPrimaryId);
    staleSessionToken = staleSession.token;
    await prisma.session.update({
      where: { id: staleSession.id },
      data: {
        reauthenticatedAt: new Date(Date.now() - 10 * 60 * 1000)
      }
    });
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
    await revokeSessionByToken(staleSessionToken);
    await prisma.invitation.deleteMany({
      where: { email: { in: [invitedEmail, staleInvitedEmail] } }
    });
    await prisma.auditLog.deleteMany({
      where: {
        action: "primary_admin.transferred",
        entityId: targetAdminId
      }
    });
    if (acceptedMemberId) {
      await prisma.member.delete({ where: { id: acceptedMemberId } });
    }
    await prisma.member.delete({ where: { id: targetAdminId } });
    await prisma.$disconnect();
  });

  it("lets the primary administrator create an administrator invitation", async () => {
    const response = await inviteMember(
      new NextRequest(
        "http://127.0.0.1:3000/api/members/invitations",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3000",
            cookie: `${SESSION_COOKIE_NAME}=${sessionToken}`
          },
          body: JSON.stringify({
            email: invitedEmail,
            role: "ADMIN"
          })
        }
      )
    );

    expect(response.status).toBe(201);
    const result = (await response.json()) as {
      token: string;
      role: string;
    };
    invitationToken = result.token;
    expect(result).toMatchObject({
      token: expect.any(String),
      role: "ADMIN"
    });
  });

  it("requires recent reauthentication for a privileged invitation", async () => {
    const response = await inviteMember(
      new NextRequest(
        "http://127.0.0.1:3000/api/members/invitations",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3000",
            cookie: `${SESSION_COOKIE_NAME}=${staleSessionToken}`
          },
          body: JSON.stringify({
            email: staleInvitedEmail,
            role: "ADMIN"
          })
        }
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REAUTH_REQUIRED",
        message: "请重新验证后继续"
      }
    });
  });

  it("accepts the invitation without exposing its stored token hash", async () => {
    const response = await acceptMemberInvitation(
      new NextRequest(
        "http://127.0.0.1:3000/api/members/invitations",
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3000"
          },
          body: JSON.stringify({
            token: invitationToken,
            displayName: "Accepted Route Admin",
            password: "a-secure-route-invitation-password"
          })
        }
      )
    );

    expect(response.status).toBe(201);
    const accepted = (await response.json()) as {
      member: { id: string; role: string };
    };
    acceptedMemberId = accepted.member.id;
    expect(accepted.member.role).toBe("ADMIN");
  });

  it("transfers the primary role through a recently verified session", async () => {
    const response = await transferPrimary(
      new NextRequest(
        "http://127.0.0.1:3000/api/members/primary-transfer",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3000",
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
