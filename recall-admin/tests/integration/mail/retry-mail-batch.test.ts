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
  retryMailBatch
} from "@/modules/mail/retry-mail-batch";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

describe("mail batch retry", () => {
  let memberId: string;
  let mailboxId: string;
  let batchId: string;
  const userIds: string[] = [];
  const scheduled: string[] = [];
  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck() {},
    async scheduleMailBatch({ batchId: scheduledBatchId }) {
      scheduled.push(scheduledBatchId);
    }
  };

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email:
          `batch-retry-admin-${randomUUID()}@example.test`,
        displayName: "Batch Retry Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    memberId = member.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "批次重试邮箱",
        emailAddress:
          `batch-retry-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const users = await Promise.all(
      ["sent", "skipped", "failed"].map(async (label) => {
        const email =
          `batch-${label}-${randomUUID()}@example.test`;
        const user = await prisma.userProfile.create({
          data: {
            externalUserId:
              `batch-retry-${label}-${randomUUID()}`,
            email,
            emailNormalized: email,
            registeredAt: new Date(
              "2026-07-30T08:00:00.000Z"
            ),
            currentSegment: "F"
          }
        });
        userIds.push(user.id);
        return user;
      })
    );
    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "ALL",
        subject: "重试测试",
        bodyText: "正文",
        bodyHtml: "<p>正文</p>",
        idempotencyKey: `batch-retry-${randomUUID()}`,
        status: "PARTIAL_FAILURE",
        totalRecipients: 3,
        sentRecipients: 1,
        skippedRecipients: 1,
        failedRecipients: 1,
        recipients: {
          create: [
            {
              userId: users[0].id,
              emailNormalized: users[0].emailNormalized,
              status: "SENT"
            },
            {
              userId: users[1].id,
              emailNormalized: users[1].emailNormalized,
              status: "SKIPPED",
              reasonCode: "RECIPIENT_PAUSED"
            },
            {
              userId: users[2].id,
              emailNormalized: users[2].emailNormalized,
              status: "FAILED",
              reasonCode: "SMTP_SEND_FAILED"
            }
          ]
        }
      }
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorId: memberId }
    });
    await prisma.mailBatch.deleteMany({
      where: { id: batchId }
    });
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.mailbox.deleteMany({
      where: { id: mailboxId }
    });
    await prisma.member.deleteMany({
      where: { id: memberId }
    });
    await prisma.$disconnect();
  });

  it("requeues only failed recipients", async () => {
    const result = await retryMailBatch({
      actorId: memberId,
      batchId,
      scheduler,
      now: new Date("2026-07-30T11:00:00.000Z")
    });
    const rows = await prisma.mailBatchRecipient.findMany({
      where: { batchId },
      orderBy: { createdAt: "asc" }
    });
    const statuses = rows.map((row) => row.status).sort();

    expect(statuses).toEqual(
      ["SENT", "SKIPPED", "PENDING"].sort()
    );
    expect(result).toMatchObject({
      status: "PENDING",
      pendingRecipients: 1,
      sentRecipients: 1,
      skippedRecipients: 1,
      failedRecipients: 0
    });
    expect(scheduled).toEqual([batchId]);
  });
});
