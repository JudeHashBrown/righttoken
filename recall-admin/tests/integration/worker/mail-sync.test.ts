import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { handleMailSync } from "@/worker/handlers/mail-sync";

describe("mail sync worker", () => {
  const mailboxIds: string[] = [];

  afterAll(async () => {
    if (mailboxIds.length) {
      await prisma.mailbox.deleteMany({
        where: { id: { in: mailboxIds } }
      });
    }
    await prisma.$disconnect();
  });

  it("syncs only the selected enabled mailbox without exposing credentials", async () => {
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "Worker 测试邮箱",
        emailAddress: `worker-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxIds.push(mailbox.id);
    const adapter = {
      testConnection: vi.fn(),
      send: vi.fn(),
      listMessagesSince: vi.fn().mockResolvedValue([])
    };

    await expect(
      handleMailSync(
        new Date("2026-07-24T09:00:00.000Z"),
        async () => adapter,
        { mailboxIds: [mailbox.id] }
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
        where: { id: mailbox.id },
        select: { lastSyncedAt: true }
      })
    ).toMatchObject({
      lastSyncedAt: new Date("2026-07-24T09:00:00.000Z")
    });
  });

  it("stores a classified failure without exposing the provider message", async () => {
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "失败测试邮箱",
        emailAddress: `failed-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxIds.push(mailbox.id);
    const secret = "provider-secret-that-must-not-be-stored";
    const adapter = {
      testConnection: vi.fn(),
      send: vi.fn(),
      listMessagesSince: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error(secret), {
            code: "ETIMEDOUT"
          })
        )
    };

    await expect(
      handleMailSync(
        new Date("2026-07-28T09:00:00.000Z"),
        async () => adapter,
        { mailboxIds: [mailbox.id] }
      )
    ).resolves.toMatchObject({ failed: 1 });

    const stored = await prisma.mailbox.findUniqueOrThrow({
      where: { id: mailbox.id },
      select: { lastErrorCode: true }
    });
    expect(stored.lastErrorCode).toBe(
      "IMAP_CONNECTION_TIMEOUT"
    );
    expect(JSON.stringify(stored)).not.toContain(secret);
  });
});
