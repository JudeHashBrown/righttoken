import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/integrations/mailboxes/[id]/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";
import {
  getMailboxRuntimeConfig,
  removeMailboxConfiguration,
  saveMailboxCredential
} from "@/modules/mail/mailbox-credentials";

function useProductionAuth(): void {
  vi.stubEnv("AUTH_MODE", "production");
  vi.stubEnv("DEPLOYMENT_ENV", "production");
  vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
}

function deleteRequest(input: {
  mailboxId: string;
  configurationVersion?: number;
  sessionToken?: string;
  origin?: string;
}): NextRequest {
  return new NextRequest(
    `http://127.0.0.1:3000/api/integrations/mailboxes/${input.mailboxId}`,
    {
      method: "DELETE",
      headers: {
        origin: input.origin ?? "http://127.0.0.1:3000",
        "content-type": "application/json",
        ...(input.sessionToken
          ? {
              cookie:
                `${SESSION_COOKIE_NAME}=${input.sessionToken}`
            }
          : {})
      },
      body: JSON.stringify({
        configurationVersion: input.configurationVersion ?? 1
      })
    }
  );
}

describe("mailbox configuration removal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
      await expect(
        getMailboxRuntimeConfig(mailbox.id)
      ).rejects.toThrow();
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

  it("rolls back credential removal when its audit insert fails", async () => {
    const token = randomUUID();
    const indexName =
      `mailbox_delete_rollback_${token.replaceAll("-", "")}`;
    const admin = await prisma.member.create({
      data: {
        email: `mailbox-rollback-admin-${token}@example.test`,
        displayName: "Mailbox Rollback Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "回滚删除邮箱",
        emailAddress: `mailbox-rollback-${token}@example.test`,
        encryptedConfig: "encrypted-rollback-configuration",
        enabled: true
      }
    });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "mailbox.configuration_deleted",
        entityType: "Mailbox",
        entityId: mailbox.id,
        metadata: { fixture: true }
      }
    });
    if (!/^[a-z0-9_]+$/.test(indexName)) {
      throw new Error("unsafe rollback fixture index name");
    }
    if (!/^[a-z0-9]+$/.test(mailbox.id)) {
      throw new Error("unsafe rollback fixture mailbox id");
    }
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX "${indexName}"
      ON "recall"."AuditLog" ("entityId")
      WHERE "action" = 'mailbox.configuration_deleted'
        AND "entityId" = '${mailbox.id}'
    `);

    try {
      await expect(
        removeMailboxConfiguration(
          admin.id,
          mailbox.id,
          mailbox.configurationVersion
        )
      ).rejects.toThrow();
      await expect(
        prisma.mailbox.findUniqueOrThrow({
          where: { id: mailbox.id },
          select: {
            encryptedConfig: true,
            configurationDeletedAt: true,
            configurationVersion: true,
            enabled: true
          }
        })
      ).resolves.toEqual({
        encryptedConfig: "encrypted-rollback-configuration",
        configurationDeletedAt: null,
        configurationVersion: 1,
        enabled: true
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
      await prisma.$executeRawUnsafe(
        `DROP INDEX IF EXISTS "recall"."${indexName}"`
      );
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

  it("rejects an unauthenticated deletion request", async () => {
    useProductionAuth();
    const mailboxId = `missing-${randomUUID()}`;

    const response = await DELETE(
      deleteRequest({ mailboxId }),
      { params: Promise.resolve({ id: mailboxId }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "UNAUTHORIZED"
    });
  });

  it("rejects a deletion request from an operator", async () => {
    useProductionAuth();
    const token = randomUUID();
    const operator = await prisma.member.create({
      data: {
        email: `mailbox-delete-operator-${token}@example.test`,
        displayName: "Mailbox Delete Operator",
        passwordHash: "not-used",
        role: "OPERATOR"
      }
    });
    const session = await createSession(operator.id);
    const mailboxId = `missing-${randomUUID()}`;

    try {
      const response = await DELETE(
        deleteRequest({
          mailboxId,
          sessionToken: session.token
        }),
        { params: Promise.resolve({ id: mailboxId }) }
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        code: "FORBIDDEN"
      });
    } finally {
      await revokeSessionByToken(session.token);
      await prisma.member.deleteMany({
        where: { id: operator.id }
      });
    }
  });

  it("rejects a cross-site deletion request", async () => {
    useProductionAuth();
    const admin = await prisma.member.findFirstOrThrow({
      where: { role: "PRIMARY_ADMIN", active: true },
      select: { id: true }
    });
    const session = await createSession(admin.id);
    const mailboxId = `missing-${randomUUID()}`;

    try {
      const response = await DELETE(
        deleteRequest({
          mailboxId,
          sessionToken: session.token,
          origin: "https://attacker.example"
        }),
        { params: Promise.resolve({ id: mailboxId }) }
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        code: "MAILBOX_CONFIGURATION_DELETE_FAILED"
      });
    } finally {
      await revokeSessionByToken(session.token);
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
