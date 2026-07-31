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

describe("mail batch schema", () => {
  let memberId: string;
  let userId: string;
  let mailboxId: string;
  let batchId: string | null = null;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `mail-batch-admin-${randomUUID()}@example.test`,
        displayName: "Mail Batch Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    memberId = member.id;

    const email = `mail-batch-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `mail-batch-user-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-07-30T08:00:00.000Z"),
        currentSegment: "F"
      }
    });
    userId = user.id;

    const mailbox = await prisma.mailbox.create({
      data: {
        name: "群发测试邮箱",
        emailAddress:
          `mail-batch-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
  });

  afterAll(async () => {
    if (batchId) {
      await prisma.mailBatch.deleteMany({
        where: { id: batchId }
      });
    }
    await prisma.mailbox.deleteMany({
      where: { id: mailboxId }
    });
    await prisma.userProfile.deleteMany({
      where: { id: userId }
    });
    await prisma.member.deleteMany({
      where: { id: memberId }
    });
    await prisma.$disconnect();
  });

  it("stores one immutable recipient row per batch user", async () => {
    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "服务恢复说明",
        bodyText: "我们正在协助处理。",
        bodyHtml: "<p>我们正在协助处理。</p>",
        idempotencyKey: `schema-test-${randomUUID()}`,
        recipients: {
          create: {
            userId,
            emailNormalized:
              `mail-batch-user-${randomUUID()}@example.test`
          }
        }
      },
      include: { recipients: true }
    });
    batchId = batch.id;

    expect(batch).toMatchObject({
      audienceMode: "SEGMENT",
      status: "PENDING",
      totalRecipients: 0,
      pendingRecipients: 0,
      sentRecipients: 0,
      skippedRecipients: 0,
      failedRecipients: 0
    });
    expect(batch.recipients).toHaveLength(1);
    expect(batch.recipients[0]).toMatchObject({
      userId,
      status: "PENDING",
      attempts: 0
    });
  });
});
