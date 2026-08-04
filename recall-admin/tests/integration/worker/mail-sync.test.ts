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
      replyTasksCreated: 0,
      replyTasksReopened: 0,
      deliveryEvents: 0,
      finalBounces: 0,
      delayedDeliveries: 0,
      unmatchedBounces: 0
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

  it("does not restore success status after the configuration is deleted in flight", async () => {
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "同步中删除配置邮箱",
        emailAddress: `deleted-in-flight-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxIds.push(mailbox.id);
    const adapter = {
      testConnection: vi.fn(),
      send: vi.fn(),
      listMessagesSince: vi.fn().mockImplementation(async () => {
        await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: {
            encryptedConfig: null,
            configurationDeletedAt: new Date(
              "2026-08-04T02:00:00.000Z"
            ),
            configurationVersion: { increment: 1 },
            enabled: false,
            lastSyncedAt: null,
            lastSuccessAt: null,
            lastErrorCode: null
          }
        });
        return [];
      })
    };

    await expect(
      handleMailSync(
        new Date("2026-08-04T02:01:00.000Z"),
        async () => adapter,
        { mailboxIds: [mailbox.id] }
      )
    ).resolves.toMatchObject({ failed: 0 });

    await expect(
      prisma.mailbox.findUniqueOrThrow({
        where: { id: mailbox.id },
        select: {
          configurationVersion: true,
          lastSyncedAt: true,
          lastSuccessAt: true,
          lastErrorCode: true
        }
      })
    ).resolves.toEqual({
      configurationVersion: 2,
      lastSyncedAt: null,
      lastSuccessAt: null,
      lastErrorCode: null
    });
  });

  it("does not write an old adapter failure onto a re-saved configuration", async () => {
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "同步中重配邮箱",
        emailAddress: `reconfigured-in-flight-${randomUUID()}@righttoken.test`,
        encryptedConfig: "old-encrypted-test-value",
        enabled: true
      }
    });
    mailboxIds.push(mailbox.id);
    const adapter = {
      testConnection: vi.fn(),
      send: vi.fn(),
      listMessagesSince: vi.fn().mockImplementation(async () => {
        await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: {
            encryptedConfig: "new-encrypted-test-value",
            configurationDeletedAt: null,
            configurationVersion: { increment: 1 },
            enabled: true,
            lastErrorCode: "NEW_CONFIGURATION_STATUS"
          }
        });
        throw Object.assign(new Error("old adapter timed out"), {
          code: "ETIMEDOUT"
        });
      })
    };

    await expect(
      handleMailSync(
        new Date("2026-08-04T03:01:00.000Z"),
        async () => adapter,
        { mailboxIds: [mailbox.id] }
      )
    ).resolves.toMatchObject({ failed: 1 });

    await expect(
      prisma.mailbox.findUniqueOrThrow({
        where: { id: mailbox.id },
        select: {
          configurationVersion: true,
          lastErrorCode: true
        }
      })
    ).resolves.toEqual({
      configurationVersion: 2,
      lastErrorCode: "NEW_CONFIGURATION_STATUS"
    });
  });
});
