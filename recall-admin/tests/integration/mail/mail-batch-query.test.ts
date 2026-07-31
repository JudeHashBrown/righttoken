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
import {
  getMailBatchSummary,
  listMailBatches
} from "@/modules/mail/mail-batch-query";

describe("mail batch query privacy", () => {
  let memberId: string;
  let mailboxId: string;
  let userId: string;
  let batchId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email:
          `batch-query-admin-${randomUUID()}@example.test`,
        displayName: "Batch Query Admin",
        passwordHash: "not-used",
        role: "OPERATOR"
      }
    });
    memberId = member.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "批次查询邮箱",
        emailAddress:
          `batch-query-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const email =
      `batch-query-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `batch-query-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-07-30T08:00:00.000Z"),
        currentSegment: "F",
        ownerId: memberId
      }
    });
    userId = user.id;
    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "批次进度查询",
        bodyText: "正文",
        bodyHtml: "<p>正文</p>",
        idempotencyKey: `batch-query-${randomUUID()}`,
        status: "PARTIAL_FAILURE",
        totalRecipients: 1,
        failedRecipients: 1,
        recipients: {
          create: {
            userId,
            emailNormalized: email,
            status: "FAILED",
            reasonCode: "SMTP_SEND_FAILED",
            completedAt: new Date(
              "2026-07-30T10:00:00.000Z"
            )
          }
        }
      }
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await prisma.mailBatch.deleteMany({
      where: { id: batchId }
    });
    await prisma.userProfile.deleteMany({
      where: { id: userId }
    });
    await prisma.mailbox.deleteMany({
      where: { id: mailboxId }
    });
    await prisma.member.deleteMany({
      where: { id: memberId }
    });
    await prisma.$disconnect();
  });

  it("returns counts and safe reason codes without recipient emails", async () => {
    const viewer = {
      id: memberId,
      role: "OPERATOR" as const
    };
    const summary = await getMailBatchSummary(
      viewer,
      batchId
    );
    const list = await listMailBatches(viewer);

    expect(summary).toMatchObject({
      id: batchId,
      audienceLabel: "F 组全员",
      totalRecipients: 1,
      sentRecipients: 0,
      skippedRecipients: 0,
      failedRecipients: 1,
      reasons: [
        { code: "SMTP_SEND_FAILED", count: 1 }
      ]
    });
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: batchId })
      ])
    );
    expect(JSON.stringify(summary)).not.toContain("@");
    expect(JSON.stringify(list)).not.toContain("@");
  });
});
