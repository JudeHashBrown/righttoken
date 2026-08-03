import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  handleMailBatch
} from "@/worker/handlers/mail-batch";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

describe("mail batch delivery", () => {
  let memberId: string;
  let mailboxId: string;
  let batchId: string;
  let firstUserId: string;
  let secondUserId: string;
  let skippedUserId: string;
  let firstEmail: string;
  let secondEmail: string;

  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck() {},
    async scheduleMailBatch(_input) {}
  };

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email:
          `batch-delivery-admin-${randomUUID()}@example.test`,
        displayName: "Batch Delivery Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    memberId = member.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "批次投递邮箱",
        emailAddress:
          `batch-delivery-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;

    firstEmail =
      `batch-first-${randomUUID()}@example.test`;
    secondEmail =
      `batch-second-${randomUUID()}@example.test`;
    const skippedEmail =
      `batch-skipped-${randomUUID()}@example.test`;
    const [firstUser, secondUser, skippedUser] =
      await Promise.all(
        [
          firstEmail,
          secondEmail,
          skippedEmail
        ].map((email) =>
          prisma.userProfile.create({
            data: {
              externalUserId:
                `batch-delivery-${randomUUID()}`,
              email,
              emailNormalized: email,
              registeredAt: new Date(
                "2026-07-30T08:00:00.000Z"
              ),
              currentSegment: "F"
            }
          })
        )
      );
    firstUserId = firstUser.id;
    secondUserId = secondUser.id;
    skippedUserId = skippedUser.id;

    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "服务异常协助",
        bodyText: "我们正在协助处理本次服务异常。",
        bodyHtml: "<p>我们正在协助处理本次服务异常。</p>",
        idempotencyKey:
          `batch-delivery-${randomUUID()}`,
        totalRecipients: 3,
        pendingRecipients: 2,
        skippedRecipients: 1,
        recipients: {
          create: [
            {
              userId: firstUserId,
              emailNormalized: firstEmail
            },
            {
              userId: secondUserId,
              emailNormalized: secondEmail
            },
            {
              userId: skippedUserId,
              emailNormalized: skippedEmail,
              status: "SKIPPED",
              reasonCode: "RECIPIENT_PAUSED",
              completedAt: new Date(
                "2026-07-30T09:00:00.000Z"
              )
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
    await prisma.mailMessage.deleteMany({
      where: {
        userId: {
          in: [firstUserId, secondUserId, skippedUserId]
        }
      }
    });
    await prisma.mailThread.deleteMany({
      where: {
        userId: {
          in: [firstUserId, secondUserId, skippedUserId]
        }
      }
    });
    await prisma.recallTask.deleteMany({
      where: {
        userId: {
          in: [firstUserId, secondUserId, skippedUserId]
        }
      }
    });
    await prisma.userProfile.deleteMany({
      where: {
        id: {
          in: [firstUserId, secondUserId, skippedUserId]
        }
      }
    });
    await prisma.mailbox.deleteMany({
      where: { id: mailboxId }
    });
    await prisma.member.deleteMany({
      where: { id: memberId }
    });
    await prisma.$disconnect();
  });

  it("sends one private message per recipient and isolates failures", async () => {
    const adapter = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          providerMessageId:
            "<batch-first@example.test>"
        })
        .mockRejectedValueOnce(
          new Error("provider unavailable")
        )
    };

    const result = await handleMailBatch(
      { batchId },
      new Date("2026-07-30T10:00:00.000Z"),
      scheduler,
      { adapter },
      25
    );

    expect(adapter.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: [firstEmail] })
    );
    expect(adapter.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: [secondEmail] })
    );
    for (const [message] of adapter.send.mock.calls) {
      expect(message.to).toHaveLength(1);
      expect(message).not.toHaveProperty("cc");
      expect(message).not.toHaveProperty("bcc");
    }
    const recipients =
      await prisma.mailBatchRecipient.findMany({
        where: { batchId },
        orderBy: { createdAt: "asc" }
      });
    const statusByUser = new Map(
      recipients.map((recipient) => [
        recipient.userId,
        recipient.status
      ])
    );
    expect(statusByUser.get(firstUserId)).toBe("SENT");
    expect(statusByUser.get(secondUserId)).toBe("FAILED");
    expect(statusByUser.get(skippedUserId)).toBe("SKIPPED");
    expect(
      recipients.find(
        (recipient) => recipient.userId === firstUserId
      )
    ).toMatchObject({
      messageId: expect.any(String),
      taskId: expect.any(String)
    });
    expect(result).toEqual({
      completed: true,
      sent: 1,
      skipped: 1,
      failed: 1
    });
    await expect(
      prisma.mailBatch.findUniqueOrThrow({
        where: { id: batchId }
      })
    ).resolves.toMatchObject({
      status: "PARTIAL_FAILURE",
      pendingRecipients: 0,
      sentRecipients: 1,
      skippedRecipients: 1,
      failedRecipients: 1
    });
  });
});
