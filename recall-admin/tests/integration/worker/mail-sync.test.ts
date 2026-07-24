import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { handleMailSync } from "@/worker/handlers/mail-sync";

describe("mail sync worker", () => {
  let mailboxId: string;

  afterAll(async () => {
    if (mailboxId) {
      await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
    }
    await prisma.$disconnect();
  });

  it("syncs every enabled mailbox without exposing credentials", async () => {
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "Worker 测试邮箱",
        emailAddress: `worker-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const adapter = {
      testConnection: vi.fn(),
      send: vi.fn(),
      listMessagesSince: vi.fn().mockResolvedValue([])
    };

    await expect(
      handleMailSync(
        new Date("2026-07-24T09:00:00.000Z"),
        async () => adapter
      )
    ).resolves.toEqual({
      mailboxes: 1,
      failed: 0,
      received: 0,
      matched: 0,
      unmatched: 0,
      replyTasksCreated: 0
    });
    expect(
      await prisma.mailbox.findUniqueOrThrow({
        where: { id: mailboxId },
        select: { lastSyncedAt: true }
      })
    ).toMatchObject({
      lastSyncedAt: new Date("2026-07-24T09:00:00.000Z")
    });
  });
});
