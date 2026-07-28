import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("core database invariants", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("contains exactly one primary administrator after seeding", async () => {
    await expect(
      prisma.member.count({
        where: { role: "PRIMARY_ADMIN" }
      })
    ).resolves.toBe(1);
  });

  it("rejects duplicate external event IDs", async () => {
    const suffix = randomUUID();
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `schema-test-${suffix}`,
        email: `schema-test-${suffix}@example.test`,
        emailNormalized: `schema-test-${suffix}@example.test`,
        registeredAt: new Date(),
        currentSegment: "A"
      }
    });

    try {
      await prisma.userEvent.create({
        data: {
          eventId: `duplicate-event-${suffix}`,
          eventType: "user.registered",
          occurredAt: new Date(),
          payload: {},
          userId: user.id
        }
      });

      await expect(
        prisma.userEvent.create({
          data: {
            eventId: `duplicate-event-${suffix}`,
            eventType: "user.registered",
            occurredAt: new Date(),
            payload: {},
            userId: user.id
          }
        })
      ).rejects.toThrow();
    } finally {
      await prisma.userProfile.delete({ where: { id: user.id } });
    }
  });
});
