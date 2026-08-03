import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/integrations/mailboxes/[id]/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";
import {
  removeMailboxConfiguration,
  saveMailboxCredential
} from "@/modules/mail/mailbox-credentials";

describe("mailbox configuration removal", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("removes credentials while preserving mail and batch history", async () => {
    const token = randomUUID();
    const admin = await prisma.member.create({
      data: {
        email: `mailbox-delete-admin-${token}@example.test`,
        displayName: "Mailbox Delete Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `mailbox-delete-user-${token}`,
        email: `mailbox-delete-user-${token}@example.test`,
        emailNormalized: `mailbox-delete-user-${token}@example.test`,
        registeredAt: new Date(),
        currentSegment: "F"
      }
    });
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "待删除配置邮箱",
        emailAddress: `mailbox-delete-${token}@example.test`,
        encryptedConfig: "encrypted-mailbox-configuration",
        enabled: true,
        lastTestedAt: new Date(),
        lastSuccessAt: new Date(),
        lastSyncedAt: new Date()
      }
    });
    const thread = await prisma.mailThread.create({
      data: {
        mailboxId: mailbox.id,
        userId: user.id,
        subject: "保留的邮件会话"
      }
    });
    await prisma.mailMessage.create({
      data: {
        mailboxId: mailbox.id,
        threadId: thread.id,
        userId: user.id,
        direction: "OUTBOUND",
        status: "SENT",
        references: [],
        fromAddress: mailbox.emailAddress,
        toAddresses: [user.email],
        subject: "保留的邮件",
        bodyText: "历史内容"
      }
    });
    await prisma.mailBatch.create({
      data: {
        mailboxId: mailbox.id,
        createdById: admin.id,
        audienceMode: "USER",
        subject: "保留的群发",
        bodyText: "历史内容",
        bodyHtml: "<p>历史内容</p>",
        idempotencyKey: `mailbox-delete-${token}`
      }
    });

    try {
      await expect(
        removeMailboxConfiguration(
          admin.id,
          mailbox.id,
          mailbox.configurationVersion
        )
      ).resolves.toEqual({
        id: mailbox.id,
        configurationVersion: 2
      });

      const updated = await prisma.mailbox.findUniqueOrThrow({
        where: { id: mailbox.id }
      });
      expect(updated.encryptedConfig).toBeNull();
      expect(updated.enabled).toBe(false);
      expect(updated.configurationVersion).toBe(2);
      expect(updated.configurationDeletedAt).toBeInstanceOf(Date);
      expect(updated.lastTestedAt).toBeNull();
      expect(updated.lastSuccessAt).toBeNull();
      expect(updated.lastSyncedAt).toBeNull();
      expect(
        await prisma.mailThread.count({
          where: { mailboxId: mailbox.id }
        })
      ).toBe(1);
      expect(
        await prisma.mailMessage.count({
          where: { mailboxId: mailbox.id }
        })
      ).toBe(1);
      expect(
        await prisma.mailBatch.count({
          where: { mailboxId: mailbox.id }
        })
      ).toBe(1);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          actorId: admin.id,
          action: "mailbox.configuration_deleted",
          entityId: mailbox.id
        }
      });
      expect(audit.metadata).toMatchObject({
        previouslyEnabled: true,
        preservedThreads: 1,
        preservedMessages: 1,
        preservedBatches: 1
      });
      expect(JSON.stringify(audit.metadata)).not.toContain(
        "encrypted-mailbox-configuration"
      );

      const readded = await saveMailboxCredential(admin.id, {
        name: "重新添加的历史邮箱",
        enabled: true,
        provider: "CUSTOM",
        config: {
          emailAddress: mailbox.emailAddress,
          displayName: "历史客服",
          username: mailbox.emailAddress,
          password: "replacement-password",
          smtp: {
            host: "smtp.example.test",
            port: 465,
            secure: true
          },
          imap: {
            host: "imap.example.test",
            port: 993,
            secure: true
          }
        }
      });
      expect(readded).toMatchObject({
        id: mailbox.id,
        configurationVersion: 3
      });
      await expect(
        prisma.mailbox.findUniqueOrThrow({
          where: { id: mailbox.id },
          select: {
            encryptedConfig: true,
            configurationDeletedAt: true,
            configurationVersion: true
          }
        })
      ).resolves.toMatchObject({
        encryptedConfig: expect.any(String),
        configurationDeletedAt: null,
        configurationVersion: 3
      });
      await expect(
        removeMailboxConfiguration(admin.id, mailbox.id, 2)
      ).rejects.toMatchObject({
        name: "MailboxConfigurationVersionConflictError",
        message: "MAILBOX_CONFIGURATION_VERSION_CONFLICT"
      });
      expect(
        await prisma.auditLog.count({
          where: {
            action: "mailbox.configuration_deleted",
            entityId: mailbox.id
          }
        })
      ).toBe(1);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { entityId: mailbox.id }
      });
      await prisma.mailBatch.deleteMany({
        where: { mailboxId: mailbox.id }
      });
      await prisma.mailMessage.deleteMany({
        where: { mailboxId: mailbox.id }
      });
      await prisma.mailThread.deleteMany({
        where: { mailboxId: mailbox.id }
      });
      await prisma.mailbox.deleteMany({
        where: { id: mailbox.id }
      });
      await prisma.userProfile.deleteMany({
        where: { id: user.id }
      });
      await prisma.member.deleteMany({
        where: { id: admin.id }
      });
    }
  });

  it("serializes concurrent deletion requests for one displayed version", async () => {
    const token = randomUUID();
    const admin = await prisma.member.create({
      data: {
        email: `mailbox-concurrent-admin-${token}@example.test`,
        displayName: "Mailbox Concurrent Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "并发删除邮箱",
        emailAddress: `mailbox-concurrent-${token}@example.test`,
        encryptedConfig: "encrypted-concurrent-configuration",
        enabled: true
      }
    });

    try {
      const results = await Promise.allSettled([
        removeMailboxConfiguration(
          admin.id,
          mailbox.id,
          mailbox.configurationVersion
        ),
        removeMailboxConfiguration(
          admin.id,
          mailbox.id,
          mailbox.configurationVersion
        )
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled")
      ).toEqual([
        {
          status: "fulfilled",
          value: {
            id: mailbox.id,
            configurationVersion: 2
          }
        }
      ]);
      const rejected = results.find(
        (result) => result.status === "rejected"
      );
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: {
          name: "MailboxConfigurationVersionConflictError",
          message: "MAILBOX_CONFIGURATION_VERSION_CONFLICT"
        }
      });
      await expect(
        prisma.mailbox.findUniqueOrThrow({
          where: { id: mailbox.id },
          select: {
            encryptedConfig: true,
            configurationVersion: true
          }
        })
      ).resolves.toEqual({
        encryptedConfig: null,
        configurationVersion: 2
      });
      expect(
        await prisma.auditLog.count({
          where: {
            action: "mailbox.configuration_deleted",
            entityId: mailbox.id
          }
        })
      ).toBe(1);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { entityId: mailbox.id }
      });
      await prisma.mailbox.deleteMany({
        where: { id: mailbox.id }
      });
      await prisma.member.deleteMany({
        where: { id: admin.id }
      });
    }
  });

  it("deletes a configured mailbox through the administrator route", async () => {
    const admin = await prisma.member.findFirstOrThrow({
      where: { role: "PRIMARY_ADMIN", active: true },
      select: { id: true }
    });
    const session = await createSession(admin.id);
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "路由删除邮箱",
        emailAddress: `mailbox-route-delete-${randomUUID()}@example.test`,
        encryptedConfig: "encrypted-route-configuration",
        enabled: true
      }
    });
    const request = () =>
      new NextRequest(
        `http://127.0.0.1:3000/api/integrations/mailboxes/${mailbox.id}`,
        {
          method: "DELETE",
          headers: {
            origin: "http://127.0.0.1:3000",
            "content-type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${session.token}`
          },
          body: JSON.stringify({
            configurationVersion: mailbox.configurationVersion
          })
        }
      );

    try {
      const response = await DELETE(request(), {
        params: Promise.resolve({ id: mailbox.id })
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        mailbox: {
          id: mailbox.id,
          configurationVersion: 2
        }
      });

      const conflictResponse = await DELETE(request(), {
        params: Promise.resolve({ id: mailbox.id })
      });
      expect(conflictResponse.status).toBe(409);
      await expect(conflictResponse.json()).resolves.toEqual({
        code: "MAILBOX_CONFIGURATION_VERSION_CONFLICT"
      });
    } finally {
      await revokeSessionByToken(session.token);
      await prisma.auditLog.deleteMany({
        where: { entityId: mailbox.id }
      });
      await prisma.mailbox.deleteMany({
        where: { id: mailbox.id }
      });
    }
  });
});
