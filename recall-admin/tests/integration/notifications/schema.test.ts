import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

describe("notification domain schema", () => {
  const memberIds: string[] = [];
  const intentIds: string[] = [];

  afterAll(async () => {
    if (intentIds.length > 0) {
      await prisma.notificationIntent.deleteMany({
        where: { id: { in: intentIds } }
      });
    }
    if (memberIds.length > 0) {
      await prisma.member.deleteMany({
        where: { id: { in: memberIds } }
      });
    }
    await prisma.$disconnect();
  });

  it("stores notification intents and encrypted integration credentials", async () => {
    const [intents, credentials] = await Promise.all([
      prisma.notificationIntent.count(),
      prisma.integrationCredential.count()
    ]);
    expect(intents).toEqual(expect.any(Number));
    expect(credentials).toEqual(expect.any(Number));
  });

  it("stores a unique WeCom UserID and distinct app and robot intents", async () => {
    const memberId = `wecom-member-${randomUUID()}`;
    const wecomUserId = `wecom-${randomUUID()}`;
    memberIds.push(memberId);
    await prisma.member.create({
      data: {
        id: memberId,
        email: `${memberId}@example.test`,
        displayName: "企微测试运营",
        passwordHash: "not-used",
        role: "OPERATOR"
      }
    });
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE recall."Member"
        SET "wecomUserId" = ${wecomUserId}
        WHERE "id" = ${memberId}
      `
    );

    const rows = await prisma.$queryRaw<
      Array<{ wecomUserId: string | null }>
    >(
      Prisma.sql`
        SELECT "wecomUserId"
        FROM recall."Member"
        WHERE "id" = ${memberId}
      `
    );
    expect(rows).toEqual([{ wecomUserId }]);

    for (const channel of ["WECOM_APP", "WECOM_ROBOT"]) {
      const intentId = `wecom-intent-${randomUUID()}`;
      intentIds.push(intentId);
      await prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO recall."NotificationIntent" (
            "id",
            "channel",
            "recipient",
            "payload",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${intentId},
            ${channel}::recall."NotificationChannel",
            ${wecomUserId},
            '{"title":"test","summary":"test","taskUrl":"http://127.0.0.1:3000/tasks/test"}'::jsonb,
            NOW(),
            NOW()
          )
        `
      );
    }
    await expect(
      prisma.notificationIntent.count({
        where: { id: { in: intentIds } }
      })
    ).resolves.toBe(2);
  });
});
