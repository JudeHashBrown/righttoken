import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  getMailboxRuntimeConfig,
  saveMailboxCredential
} from "@/modules/mail/mailbox-credentials";

describe("encrypted mailbox credentials", () => {
  let adminId: string;
  let mailboxId: string;

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
    if (mailboxId) {
      await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
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
    mailboxId = saved.id;

    expect(saved).not.toHaveProperty("encryptedConfig");
    expect(saved).not.toHaveProperty("password");
    const stored = await prisma.mailbox.findUniqueOrThrow({
      where: { id: mailboxId }
    });
    expect(stored.encryptedConfig).not.toContain(
      "mailbox-secret-password"
    );
    await expect(
      getMailboxRuntimeConfig(mailboxId)
    ).resolves.toMatchObject({
      password: "mailbox-secret-password",
      smtp: { port: 465 },
      imap: { port: 993 }
    });
  });
});
