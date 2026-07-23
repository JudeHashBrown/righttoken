import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import {
  ReauthenticationRequiredError,
  countPrimaryAdmins,
  transferPrimaryAdmin
} from "@/modules/auth/primary-admin";

describe("primary administrator invariant", () => {
  let currentPrimaryId: string;
  let targetAdminId: string;
  let otherAdminId: string;
  let verifiedSessionId: string;
  let staleSessionId: string;
  let otherAdminSessionId: string;

  beforeAll(async () => {
    const currentPrimary = await prisma.member.findFirstOrThrow({
      where: { role: "PRIMARY_ADMIN" }
    });
    currentPrimaryId = currentPrimary.id;

    const target = await prisma.member.create({
      data: {
        email: `target-admin-${randomUUID()}@example.test`,
        displayName: "Target Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    targetAdminId = target.id;

    const otherAdmin = await prisma.member.create({
      data: {
        email: `other-admin-${randomUUID()}@example.test`,
        displayName: "Other Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    otherAdminId = otherAdmin.id;

    const sessions = await Promise.all([
      prisma.session.create({
        data: {
          memberId: currentPrimaryId,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          reauthenticatedAt: new Date()
        }
      }),
      prisma.session.create({
        data: {
          memberId: currentPrimaryId,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          reauthenticatedAt: new Date(Date.now() - 10 * 60 * 1000)
        }
      }),
      prisma.session.create({
        data: {
          memberId: otherAdminId,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          reauthenticatedAt: new Date()
        }
      })
    ]);
    verifiedSessionId = sessions[0].id;
    staleSessionId = sessions[1].id;
    otherAdminSessionId = sessions[2].id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: {
        id: {
          in: [
            verifiedSessionId,
            staleSessionId,
            otherAdminSessionId
          ].filter(Boolean)
        }
      }
    });
    await prisma.auditLog.deleteMany({
      where: {
        action: "primary_admin.transferred",
        entityId: targetAdminId
      }
    });
    if (currentPrimaryId && targetAdminId) {
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
    }
    if (otherAdminId) {
      await prisma.member.delete({ where: { id: otherAdminId } });
    }
    if (targetAdminId) {
      await prisma.member.delete({ where: { id: targetAdminId } });
    }
    await prisma.$disconnect();
  });

  it("rejects a transfer without recent reauthentication", async () => {
    await expect(
      transferPrimaryAdmin(
        currentPrimaryId,
        targetAdminId,
        staleSessionId
      )
    ).rejects.toThrow(ReauthenticationRequiredError);
  });

  it("rejects an ADMIN caller even with a verified session", async () => {
    await expect(
      transferPrimaryAdmin(
        otherAdminId,
        targetAdminId,
        otherAdminSessionId
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it("atomically transfers the role and keeps exactly one primary", async () => {
    expect(await countPrimaryAdmins()).toBe(1);

    await transferPrimaryAdmin(
      currentPrimaryId,
      targetAdminId,
      verifiedSessionId
    );

    expect(await countPrimaryAdmins()).toBe(1);
    expect(
      (
        await prisma.member.findUniqueOrThrow({
          where: { id: currentPrimaryId }
        })
      ).role
    ).toBe("ADMIN");
    expect(
      (
        await prisma.member.findUniqueOrThrow({
          where: { id: targetAdminId }
        })
      ).role
    ).toBe("PRIMARY_ADMIN");
  });
});
