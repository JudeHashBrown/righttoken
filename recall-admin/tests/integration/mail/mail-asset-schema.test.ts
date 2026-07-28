import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("mail asset persistence", () => {
  let memberId: string;
  let userId: string;
  let mailboxId: string;
  let templateId: string;
  let messageId: string;
  let assetId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const member = await prisma.member.create({
      data: {
        email: `mail-asset-${suffix}@example.test`,
        displayName: "Mail Asset Operator",
        passwordHash: "not-used-in-this-test",
        role: "OPERATOR"
      }
    });
    memberId = member.id;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `mail-asset-user-${suffix}`,
        email: `mail-asset-user-${suffix}@example.test`,
        emailNormalized: `mail-asset-user-${suffix}@example.test`,
        registeredAt: new Date("2026-07-28T02:00:00.000Z"),
        currentSegment: "B",
        ownerId: memberId
      }
    });
    userId = user.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "Mail Asset Test",
        emailAddress: `mail-asset-${suffix}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const template = await prisma.mailTemplate.create({
      data: {
        key: `mail-asset-template-${suffix}`,
        version: 1,
        name: "图片模板",
        subject: "图片测试",
        bodyText: "查看图片",
        bodyHtml:
          '<p>查看图片</p><img data-mail-asset-id="asset-placeholder" alt="说明图">',
        active: true,
        createdById: memberId
      }
    });
    templateId = template.id;
    const thread = await prisma.mailThread.create({
      data: {
        userId,
        mailboxId,
        subject: "图片测试"
      }
    });
    const message = await prisma.mailMessage.create({
      data: {
        mailboxId,
        threadId: thread.id,
        userId,
        direction: "OUTBOUND",
        status: "DRAFT",
        references: [],
        fromAddress: mailbox.emailAddress,
        toAddresses: [user.email],
        subject: "图片测试",
        bodyText: "查看图片",
        bodyHtml:
          '<p>查看图片</p><img data-mail-asset-id="asset-placeholder" alt="说明图">'
      }
    });
    messageId = message.id;
  });

  afterAll(async () => {
    if (messageId) {
      await prisma.mailMessage.deleteMany({
        where: { id: messageId }
      });
    }
    if (templateId) {
      await prisma.mailTemplate.deleteMany({
        where: { id: templateId }
      });
    }
    if (assetId) {
      await prisma.mailAsset.deleteMany({
        where: { id: assetId }
      });
    }
    if (mailboxId) {
      await prisma.mailbox.deleteMany({
        where: { id: mailboxId }
      });
    }
    if (userId) {
      await prisma.userProfile.deleteMany({
        where: { id: userId }
      });
    }
    if (memberId) {
      await prisma.member.deleteMany({
        where: { id: memberId }
      });
    }
    await prisma.$disconnect();
  });

  it("links one stored asset to an immutable template and message", async () => {
    const asset = await prisma.mailAsset.create({
      data: {
        storageKey: `mail-assets/${randomUUID()}.webp`,
        fileName: "guide.webp",
        contentType: "image/webp",
        byteSize: 1024,
        sha256: "a".repeat(64),
        width: 800,
        height: 600,
        createdById: memberId
      }
    });
    assetId = asset.id;

    const [templateUsage, messageUsage] = await Promise.all([
      prisma.mailTemplateAsset.create({
        data: {
          templateId,
          assetId,
          disposition: "INLINE",
          cid: `${assetId}@righttoken`,
          sortOrder: 0
        }
      }),
      prisma.mailMessageAsset.create({
        data: {
          messageId,
          assetId,
          disposition: "ATTACHMENT",
          sortOrder: 0
        }
      })
    ]);

    expect(templateUsage.assetId).toBe(assetId);
    expect(messageUsage).toMatchObject({
      assetId,
      disposition: "ATTACHMENT"
    });
  });
});
