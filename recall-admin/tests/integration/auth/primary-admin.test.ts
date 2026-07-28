import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import {
  countPrimaryAdmins,
  transferPrimaryAdmin
} from "@/modules/auth/primary-admin";

describe("primary administrator invariant", () => {
  let currentPrimaryId: string;
  let targetAdminId: string;
  let otherAdminId: string;

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

  });

  afterAll(async () => {
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

  it("rejects an ADMIN caller", async () => {
    await expect(
      transferPrimaryAdmin(otherAdminId, targetAdminId)
    ).rejects.toThrow(ForbiddenError);
  });

  it("atomically transfers the role and keeps exactly one primary", async () => {
    expect(await countPrimaryAdmins()).toBe(1);

    await transferPrimaryAdmin(currentPrimaryId, targetAdminId);

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
