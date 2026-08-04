import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { syncMailbox } from "@/modules/mail/sync-mailbox";
import type { MailboxMessage } from "@/modules/mail/types";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture(withBatch = false) {
  const suffix = randomUUID();
  const member = await prisma.member.create({
    data: {
      email: `bounce-operator-${suffix}@example.test`,
      displayName: "Bounce Operator",
      passwordHash: "not-used",
      role: "OPERATOR"
    }
  });
  const email = `bounce-user-${suffix}@example.test`;
  const user = await prisma.userProfile.create({
    data: {
      externalUserId: `bounce-user-${suffix}`,
      email,
      emailNormalized: email,
      registeredAt: new Date("2026-08-01T08:00:00.000Z"),
      currentSegment: "F",
      ownerId: member.id
    }
  });
  const mailbox = await prisma.mailbox.create({
    data: {
      name: "退信同步测试邮箱",
      emailAddress: `bounce-${suffix}@righttoken.test`,
      encryptedConfig: "encrypted-test-value",
      enabled: true,
      lastSyncedAt: new Date("2026-08-04T07:00:00.000Z")
    }
  });
  const thread = await prisma.mailThread.create({
    data: {
      userId: user.id,
      mailboxId: mailbox.id,
      subject: "Payment help"
    }
  });
  const task = await prisma.recallTask.create({
    data: {
      userId: user.id,
      origin: "MANUAL",
      triggerKey: `bounce-task-${suffix}`,
      ruleVersion: 1,
      title: "等待邮件结果",
      reason: "退信测试",
      priority: "NORMAL",
      status: "WAITING_USER",
      assigneeId: member.id,
      dueAt: new Date("2026-08-05T08:00:00.000Z"),
      startedAt: new Date("2026-08-04T07:10:00.000Z")
    }
  });
  const message = await prisma.mailMessage.create({
    data: {
      mailboxId: mailbox.id,
      threadId: thread.id,
      userId: user.id,
      taskId: task.id,
      direction: "OUTBOUND",
      status: "SENT",
      providerMessageId: `<outbound-${suffix}@example.test>`,
      references: [],
      fromAddress: mailbox.emailAddress,
      toAddresses: [email],
      subject: "Payment help",
      bodyText: "Please reply if you need help.",
      sentAt: new Date("2026-08-04T07:30:00.000Z")
    }
  });
  const batch = withBatch
    ? await prisma.mailBatch.create({
        data: {
          mailboxId: mailbox.id,
          createdById: member.id,
          audienceMode: "SEGMENT",
          segment: "F",
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: `<p>${message.bodyText}</p>`,
          idempotencyKey: `bounce-batch-${suffix}`,
          status: "COMPLETED",
          totalRecipients: 1,
          sentRecipients: 1,
          completedAt: new Date("2026-08-04T07:31:00.000Z"),
          recipients: {
            create: {
              userId: user.id,
              emailNormalized: email,
              status: "SENT",
              messageId: message.id,
              taskId: task.id,
              completedAt: new Date("2026-08-04T07:30:00.000Z")
            }
          }
        }
      })
    : null;
  return { member, user, mailbox, thread, task, message, batch };
}

function dsnMessage(input: {
  id: string;
  recipient: string;
  action: "failed" | "delayed";
  originalMessageId: string;
}): MailboxMessage {
  return {
    providerMessageId: input.id,
    inReplyTo: null,
    references: [],
    fromAddress: "mailer-daemon@example.test",
    toAddresses: ["support@righttoken.test"],
    subject: "Delivery Status Notification",
    bodyText: "Delivery status notification.",
    bodyHtml: null,
    attachments: [
      {
        fileName: "delivery-status.txt",
        contentType: "message/delivery-status",
        content: Buffer.from(
          [
            `Original-Message-ID: ${input.originalMessageId}`,
            "",
            `Final-Recipient: rfc822; ${input.recipient}`,
            `Action: ${input.action}`,
            `Status: ${input.action === "failed" ? "5.1.1" : "4.2.0"}`,
            `Diagnostic-Code: smtp; ${input.action === "failed" ? "550 rejected" : "451 queued"}`
          ].join("\r\n")
        ),
        cid: null,
        disposition: "ATTACHMENT"
      }
    ],
    receivedAt: new Date("2026-08-04T08:00:00.000Z")
  };
}

async function cleanup(fixture: Fixture) {
  if (fixture.batch) {
    await prisma.mailBatch.delete({ where: { id: fixture.batch.id } });
  }
  await prisma.mailbox.delete({ where: { id: fixture.mailbox.id } });
  await prisma.recallTask.deleteMany({ where: { userId: fixture.user.id } });
  await prisma.userProfile.delete({ where: { id: fixture.user.id } });
  await prisma.member.delete({ where: { id: fixture.member.id } });
}

describe("mail bounce synchronization", () => {
  afterAll(async () => prisma.$disconnect());

  it("applies a matched final failure once and reopens the latest waiting task", async () => {
    const fixture = await createFixture(true);
    const dsn = dsnMessage({
      id: `<dsn-failed-${randomUUID()}@example.test>`,
      recipient: fixture.user.emailNormalized,
      action: "failed",
      originalMessageId: fixture.message.providerMessageId!
    });
    const adapter = {
      listMessagesSince: vi.fn().mockResolvedValue([dsn])
    };
    try {
      const first = await syncMailbox(
        fixture.mailbox.id,
        adapter,
        fixture.mailbox.configurationVersion,
        new Date("2026-08-04T08:01:00.000Z")
      );
      const second = await syncMailbox(
        fixture.mailbox.id,
        adapter,
        fixture.mailbox.configurationVersion,
        new Date("2026-08-04T08:02:00.000Z")
      );

      expect(first).toMatchObject({
        received: 1,
        deliveryEvents: 1,
        finalBounces: 1,
        delayedDeliveries: 0,
        unmatchedBounces: 0
      });
      expect(second).toMatchObject({
        received: 0,
        deliveryEvents: 0,
        finalBounces: 0
      });
      await expect(
        prisma.mailMessage.findUniqueOrThrow({
          where: { id: fixture.message.id }
        })
      ).resolves.toMatchObject({
        status: "BOUNCED",
        bounceStatusCode: "5.1.1",
        bounceDiagnostic: "smtp; 550 rejected"
      });
      await expect(
        prisma.mailBatchRecipient.findFirstOrThrow({
          where: { batchId: fixture.batch!.id }
        })
      ).resolves.toMatchObject({
        status: "BOUNCED",
        reasonCode: "FINAL_BOUNCE"
      });
      await expect(
        prisma.mailBatch.findUniqueOrThrow({
          where: { id: fixture.batch!.id }
        })
      ).resolves.toMatchObject({
        status: "FAILED",
        sentRecipients: 0,
        failedRecipients: 1
      });
      await expect(
        prisma.recallTask.findUniqueOrThrow({
          where: { id: fixture.task.id }
        })
      ).resolves.toMatchObject({ status: "IN_PROGRESS" });
      await expect(
        prisma.auditLog.count({
          where: {
            action: "MAIL_FINAL_BOUNCE_MATCHED",
            entityId: fixture.message.id
          }
        })
      ).resolves.toBe(1);
    } finally {
      await cleanup(fixture);
    }
  });

  it("records delayed delivery without changing sent or waiting state", async () => {
    const fixture = await createFixture();
    const dsn = dsnMessage({
      id: `<dsn-delayed-${randomUUID()}@example.test>`,
      recipient: fixture.user.emailNormalized,
      action: "delayed",
      originalMessageId: fixture.message.providerMessageId!
    });
    try {
      const result = await syncMailbox(
        fixture.mailbox.id,
        { listMessagesSince: vi.fn().mockResolvedValue([dsn]) },
        fixture.mailbox.configurationVersion,
        new Date("2026-08-04T08:01:00.000Z")
      );
      expect(result).toMatchObject({
        deliveryEvents: 1,
        finalBounces: 0,
        delayedDeliveries: 1
      });
      await expect(
        prisma.mailMessage.findUniqueOrThrow({
          where: { id: fixture.message.id }
        })
      ).resolves.toMatchObject({ status: "SENT", bouncedAt: null });
      await expect(
        prisma.recallTask.findUniqueOrThrow({
          where: { id: fixture.task.id }
        })
      ).resolves.toMatchObject({ status: "WAITING_USER" });
    } finally {
      await cleanup(fixture);
    }
  });

  it("stores an unmatched final DSN without unlocking the outbound message", async () => {
    const fixture = await createFixture();
    const dsn = dsnMessage({
      id: `<dsn-unmatched-${randomUUID()}@example.test>`,
      recipient: fixture.user.emailNormalized,
      action: "failed",
      originalMessageId: "<missing@example.test>"
    });
    try {
      const result = await syncMailbox(
        fixture.mailbox.id,
        { listMessagesSince: vi.fn().mockResolvedValue([dsn]) },
        fixture.mailbox.configurationVersion,
        new Date("2026-08-04T08:01:00.000Z")
      );
      expect(result).toMatchObject({
        unmatched: 1,
        unmatchedBounces: 1,
        finalBounces: 0
      });
      await expect(
        prisma.mailMessage.findUniqueOrThrow({
          where: { id: fixture.message.id }
        })
      ).resolves.toMatchObject({ status: "SENT" });
      await expect(
        prisma.mailMessage.findUniqueOrThrow({
          where: { providerMessageId: dsn.providerMessageId }
        })
      ).resolves.toMatchObject({
        direction: "INBOUND",
        status: "UNMATCHED",
        lastErrorCode: "DELIVERY_STATUS_MESSAGE_NOT_FOUND"
      });
      await expect(
        prisma.auditLog.count({
          where: {
            action: "MAIL_BOUNCE_UNMATCHED",
            entityType: "MailMessage"
          }
        })
      ).resolves.toBeGreaterThan(0);
    } finally {
      await cleanup(fixture);
    }
  });
});
