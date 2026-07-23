import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import {
  acceptInvitation,
  createInvitation
} from "@/modules/auth/invitations";
import { verifyPassword } from "@/modules/auth/password";

describe("member invitations", () => {
  const createdMemberIds: string[] = [];
  let primaryId: string;
  let adminId: string;
  let operatorId: string;

  beforeAll(async () => {
    primaryId = (
      await prisma.member.findFirstOrThrow({
        where: { role: "PRIMARY_ADMIN" }
      })
    ).id;
    const suffix = randomUUID();
    const [admin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `invite-admin-${suffix}@example.test`,
          displayName: "Invitation Admin",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `invite-operator-${suffix}@example.test`,
          displayName: "Invitation Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
    createdMemberIds.push(admin.id, operator.id);
  });

  afterAll(async () => {
    await prisma.member.deleteMany({
      where: { id: { in: createdMemberIds } }
    });
    await prisma.$disconnect();
  });

  it("stores invitation tokens as hashes and accepts them once", async () => {
    const email = `accepted-${randomUUID()}@example.test`;
    const created = await createInvitation(
      primaryId,
      email,
      "ADMIN"
    );
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: created.invitationId }
    });

    expect(stored.tokenHash).not.toBe(created.token);
    const accepted = await acceptInvitation(created.token, {
      displayName: "Accepted Admin",
      password: "a-secure-invitation-password"
    });
    createdMemberIds.push(accepted.id);
    expect(accepted.role).toBe("ADMIN");
    expect(
      await verifyPassword(
        (
          await prisma.member.findUniqueOrThrow({
            where: { id: accepted.id }
          })
        ).passwordHash,
        "a-secure-invitation-password"
      )
    ).toBe(true);
    await expect(
      acceptInvitation(created.token, {
        displayName: "Replay",
        password: "another-secure-password"
      })
    ).rejects.toThrow();
  });

  it("allows admins to invite operators but not administrators", async () => {
    await expect(
      createInvitation(
        adminId,
        `operator-${randomUUID()}@example.test`,
        "OPERATOR"
      )
    ).resolves.toMatchObject({ role: "OPERATOR" });
    await expect(
      createInvitation(
        adminId,
        `admin-${randomUUID()}@example.test`,
        "ADMIN"
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it("does not allow operators to invite members", async () => {
    await expect(
      createInvitation(
        operatorId,
        `blocked-${randomUUID()}@example.test`,
        "OPERATOR"
      )
    ).rejects.toThrow(ForbiddenError);
  });
});
