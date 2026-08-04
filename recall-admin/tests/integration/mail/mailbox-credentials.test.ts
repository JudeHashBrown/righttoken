import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/integrations/mailboxes/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";
import {
  getMailboxRuntimeConfig,
  saveMailboxCredential
} from "@/modules/mail/mailbox-credentials";

describe("encrypted mailbox credentials", () => {
  let adminId: string;
  const mailboxIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.member.create({
      data: {
        email: `mailbox-admin-${randomUUID()}@example.test`,
        displayName: "Mailbox Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorId: adminId, entityType: "Mailbox" }
    });
    if (mailboxIds.length) {
      await prisma.mailbox.deleteMany({
        where: { id: { in: mailboxIds } }
      });
    }
    await prisma.member.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("stores the password encrypted and only returns safe metadata", async () => {
    const saved = await saveMailboxCredential(adminId, {
      name: "企业微信邮箱",
      enabled: true,
      provider: "WECOM_MAIL",
      config: {
        emailAddress: `support-${randomUUID()}@righttoken.test`,
        displayName: "RightToken 客服",
        username: "support@righttoken.test",
        password: "mailbox-secret-password",
        smtp: {
          host: "smtp.exmail.qq.com",
          port: 465,
          secure: true
        },
        imap: {
          host: "imap.exmail.qq.com",
          port: 993,
          secure: true
        }
      }
    });
    mailboxIds.push(saved.id);

    expect(saved).not.toHaveProperty("encryptedConfig");
    expect(saved).not.toHaveProperty("password");
    const stored = await prisma.mailbox.findUniqueOrThrow({
      where: { id: saved.id }
    });
    expect(stored.encryptedConfig).not.toContain(
      "mailbox-secret-password"
    );
    await expect(
      getMailboxRuntimeConfig(saved.id)
    ).resolves.toMatchObject({
      password: "mailbox-secret-password",
      smtp: { port: 465 },
      imap: { port: 993 }
    });
  });

  it("increments the configuration version on every credential save", async () => {
    const emailAddress = `versioned-${randomUUID()}@righttoken.test`;
    const input = {
      name: "版本化邮箱",
      enabled: true,
      provider: "CUSTOM" as const,
      config: {
        emailAddress,
        displayName: "版本化客服",
        username: emailAddress,
        password: "first-password",
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
    };

    const first = await saveMailboxCredential(adminId, input);
    mailboxIds.push(first.id);
    const second = await saveMailboxCredential(adminId, {
      ...input,
      config: {
        ...input.config,
        password: "second-password"
      }
    });

    expect(first.configurationVersion).toBe(1);
    expect(second).toMatchObject({
      id: first.id,
      configurationVersion: 2
    });
    await expect(
      prisma.mailbox.findUniqueOrThrow({
        where: { id: first.id },
        select: { configurationVersion: true }
      })
    ).resolves.toEqual({ configurationVersion: 2 });
  });

  it("rejects the retired NAMECHEAP provider at the mailbox API", async () => {
    const session = await createSession(adminId);
    const appUrl =
      process.env.APP_URL ?? "http://127.0.0.1:3000";
    const emailAddress =
      `retired-provider-${randomUUID()}@righttoken.test`;
    const request = new NextRequest(
      `${appUrl}/api/integrations/mailboxes`,
      {
        method: "POST",
        headers: {
          origin: appUrl,
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${session.token}`
        },
        body: JSON.stringify({
          name: "旧服务商邮箱",
          enabled: true,
          provider: "NAMECHEAP",
          config: {
            emailAddress,
            displayName: "旧服务商邮箱",
            username: emailAddress,
            password: "must-not-be-saved",
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
        })
      }
    );

    try {
      const response = await POST(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        code: "INVALID_MAILBOX_CONFIGURATION"
      });
      await expect(
        prisma.mailbox.findUnique({
          where: { emailAddress }
        })
      ).resolves.toBeNull();
    } finally {
      await revokeSessionByToken(session.token);
    }
  });
});
