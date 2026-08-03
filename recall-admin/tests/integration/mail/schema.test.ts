import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("mail domain schema", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("exposes mailbox, thread, message, template and suppression storage", async () => {
    const [mailboxes, threads, messages, templates, suppressions] =
      await Promise.all([
        prisma.mailbox.count(),
        prisma.mailThread.count(),
        prisma.mailMessage.count(),
        prisma.mailTemplate.count(),
        prisma.suppressionEntry.count()
      ]);

    expect({
      mailboxes,
      threads,
      messages,
      templates,
      suppressions
    }).toEqual({
      mailboxes: expect.any(Number),
      threads: expect.any(Number),
      messages: expect.any(Number),
      templates: expect.any(Number),
      suppressions: expect.any(Number)
    });
  });

  it("stores template update and soft-archive metadata", async () => {
    const template = await prisma.mailTemplate.create({
      data: {
        key: `schema-${randomUUID()}`,
        version: 1,
        name: "Schema template",
        subject: "Schema subject",
        bodyText: "Schema body",
        createdById: `member-${randomUUID()}`
      }
    });

    try {
      expect(template).toMatchObject({
        archivedAt: null,
        archivedById: null
      });
      expect(
        (template as typeof template & { updatedAt?: Date }).updatedAt
      ).toBeInstanceOf(Date);
    } finally {
      await prisma.mailTemplate.delete({
        where: { id: template.id }
      });
    }
  });

  it("keeps a mailbox identity after its configuration is removed", async () => {
    const deletedAt = new Date();
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "历史客服邮箱",
        emailAddress: `history-${randomUUID()}@example.test`,
        encryptedConfig: null,
        enabled: false,
        configurationDeletedAt: deletedAt
      }
    });

    try {
      expect(mailbox.encryptedConfig).toBeNull();
      expect(mailbox.configurationDeletedAt).toEqual(deletedAt);
    } finally {
      await prisma.mailbox.delete({ where: { id: mailbox.id } });
    }
  });
});
