import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
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
  let recoveryBatchId: string;
  let firstUserId: string;
  let secondUserId: string;
  let skippedUserId: string;
  let recoveryUserId: string;
  let firstEmail: string;
  let secondEmail: string;
  let senderDomain: string;
  const scheduled: Array<{
    batchId: string;
    runAt?: Date;
  }> = [];

  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck() {},
    async scheduleMailBatch(input) {
      scheduled.push(input);
    }
  };

  beforeEach(() => {
    scheduled.length = 0;
  });

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
    senderDomain =
      `batch-delivery-${randomUUID()}.righttoken.test`;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "批次投递邮箱",
        emailAddress: `support@${senderDomain}`,
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

    const recoveryEmail =
      `batch-recovery-${randomUUID()}@example.test`;
    const recoveryUser = await prisma.userProfile.create({
      data: {
        externalUserId:
          `batch-recovery-${randomUUID()}`,
        email: recoveryEmail,
        emailNormalized: recoveryEmail,
        registeredAt: new Date(
          "2026-07-30T08:00:00.000Z"
        ),
        currentSegment: "F"
      }
    });
    recoveryUserId = recoveryUser.id;

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

    const recoveryBatch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "崩溃恢复测试",
        bodyText: "正文",
        bodyHtml: "<p>正文</p>",
        idempotencyKey:
          `batch-recovery-${randomUUID()}`,
        status: "RUNNING",
        totalRecipients: 1,
        pendingRecipients: 1,
        startedAt: new Date(
          "2026-07-30T11:00:00.000Z"
        ),
        recipients: {
          create: {
            userId: recoveryUserId,
            emailNormalized: recoveryEmail,
            status: "SENDING",
            attempts: 1,
            claimedAt: new Date(
              "2026-07-30T11:00:00.000Z"
            ),
            lastAttemptAt: new Date(
              "2026-07-30T11:00:00.000Z"
            )
          }
        }
      }
    });
    recoveryBatchId = recoveryBatch.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorId: memberId }
    });
    await prisma.mailBatch.deleteMany({
      where: { id: { in: [batchId, recoveryBatchId] } }
    });
    await prisma.mailMessage.deleteMany({
      where: {
        userId: {
          in: [
            firstUserId,
            secondUserId,
            skippedUserId,
            recoveryUserId
          ]
        }
      }
    });
    await prisma.mailThread.deleteMany({
      where: {
        userId: {
          in: [
            firstUserId,
            secondUserId,
            skippedUserId,
            recoveryUserId
          ]
        }
      }
    });
    await prisma.recallTask.deleteMany({
      where: {
        userId: {
          in: [
            firstUserId,
            secondUserId,
            skippedUserId,
            recoveryUserId
          ]
        }
      }
    });
    await prisma.userProfile.deleteMany({
      where: {
        id: {
          in: [
            firstUserId,
            secondUserId,
            skippedUserId,
            recoveryUserId
          ]
        }
      }
    });
    await prisma.mailDomainThrottle.deleteMany({
      where: { senderDomain }
    });
    await prisma.mailbox.deleteMany({
      where: { id: mailboxId }
    });
    await prisma.member.deleteMany({
      where: { id: memberId }
    });
    await prisma.$disconnect();
  });

  it("sends one private message per reserved domain slot and isolates failures", async () => {
    const adapter = {
      send: vi.fn().mockResolvedValue({
        providerMessageId:
          "<batch-first@example.test>"
      })
    };
    const rejectingAdapter = {
      send: vi.fn().mockRejectedValue(
        new Error("provider unavailable")
      )
    };

    const firstResult = await handleMailBatch(
      { batchId },
      new Date("2026-07-30T10:00:00.000Z"),
      scheduler,
      {
        adapter,
        random: () => 0,
        reservationNow: new Date(
          "2026-07-30T10:00:00.000Z"
        )
      }
    );

    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(adapter.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: [firstEmail] })
    );
    expect(firstResult).toEqual({
      completed: false,
      sent: 1,
      skipped: 1,
      failed: 0
    });
    expect(scheduled.at(-1)).toEqual({
      batchId,
      runAt: new Date("2026-07-30T10:02:00.000Z")
    });

    await handleMailBatch(
      { batchId },
      new Date("2026-07-30T10:01:00.000Z"),
      scheduler,
      {
        adapter,
        random: () => 0,
        reservationNow: new Date(
          "2026-07-30T10:01:00.000Z"
        )
      }
    );
    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(scheduled.at(-1)).toEqual({
      batchId,
      runAt: new Date("2026-07-30T10:02:00.000Z")
    });

    const result = await handleMailBatch(
      { batchId },
      new Date("2026-07-30T10:02:00.000Z"),
      scheduler,
      {
        adapter: rejectingAdapter,
        random: () => 0,
        reservationNow: new Date(
          "2026-07-30T10:02:00.000Z"
        )
      }
    );
    expect(rejectingAdapter.send).toHaveBeenCalledTimes(1);
    expect(rejectingAdapter.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: [secondEmail] })
    );
    for (const [message] of [
      ...adapter.send.mock.calls,
      ...rejectingAdapter.send.mock.calls
    ]) {
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
    await expect(
      prisma.mailDomainThrottle.findUniqueOrThrow({
        where: { senderDomain }
      })
    ).resolves.toMatchObject({
      nextAvailableAt: new Date(
        "2026-07-30T10:04:00.000Z"
      )
    });
  });

  it("uses the post-lock database claim time for delivery timestamps", async () => {
    const databaseClockDomain =
      `database-clock-${randomUUID()}.righttoken.test`;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "数据库时钟投递邮箱",
        emailAddress: `support@${databaseClockDomain}`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    const email =
      `database-clock-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `database-clock-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-08-04T00:00:00.000Z"),
        currentSegment: "F"
      }
    });
    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId: mailbox.id,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "数据库时钟投递",
        bodyText: "正文",
        bodyHtml: "<p>正文</p>",
        idempotencyKey: `database-clock-${randomUUID()}`,
        totalRecipients: 1,
        pendingRecipients: 1,
        recipients: {
          create: {
            userId: user.id,
            emailNormalized: email
          }
        }
      }
    });
    const adapter = {
      send: vi.fn().mockResolvedValue({
        providerMessageId: "<database-clock@example.test>"
      })
    };
    const beforeReservation = new Date();

    try {
      await expect(
        handleMailBatch(
          { batchId: batch.id },
          new Date("2000-01-01T00:00:00.000Z"),
          scheduler,
          { adapter, random: () => 0 }
        )
      ).resolves.toMatchObject({ completed: true, sent: 1 });

      const recipient =
        await prisma.mailBatchRecipient.findFirstOrThrow({
          where: { batchId: batch.id },
          select: {
            claimedAt: true,
            lastAttemptAt: true,
            completedAt: true,
            messageId: true
          }
        });
      expect(recipient.claimedAt).toBeInstanceOf(Date);
      expect(recipient.claimedAt?.getTime()).toBeGreaterThanOrEqual(
        beforeReservation.getTime()
      );
      expect(recipient.lastAttemptAt).toEqual(
        recipient.claimedAt
      );
      expect(recipient.completedAt).toEqual(recipient.claimedAt);
      const message = await prisma.mailMessage.findUniqueOrThrow({
        where: { id: recipient.messageId ?? "" },
        select: { sentAt: true }
      });
      expect(message.sentAt).toEqual(recipient.claimedAt);
      await expect(
        prisma.mailBatch.findUniqueOrThrow({
          where: { id: batch.id },
          select: { completedAt: true }
        })
      ).resolves.toEqual({ completedAt: recipient.claimedAt });
      const throttle =
        await prisma.mailDomainThrottle.findUniqueOrThrow({
          where: { senderDomain: databaseClockDomain },
          select: { nextAvailableAt: true }
        });
      expect(
        throttle.nextAvailableAt.getTime() -
          (recipient.claimedAt?.getTime() ?? 0)
      ).toBe(120_000);
    } finally {
      await prisma.mailBatch.deleteMany({
        where: { id: batch.id }
      });
      await prisma.mailMessage.deleteMany({
        where: { mailboxId: mailbox.id }
      });
      await prisma.mailThread.deleteMany({
        where: { mailboxId: mailbox.id }
      });
      await prisma.recallTask.deleteMany({
        where: { userId: user.id }
      });
      await prisma.mailDomainThrottle.deleteMany({
        where: { senderDomain: databaseClockDomain }
      });
      await prisma.mailbox.deleteMany({
        where: { id: mailbox.id }
      });
      await prisma.userProfile.deleteMany({
        where: { id: user.id }
      });
    }
  });

  it("preserves final bounces when recalculating a completed batch", async () => {
    const email = `recount-bounce-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `recount-bounce-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-08-04T00:00:00.000Z"),
        currentSegment: "F"
      }
    });
    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "USER",
        subject: "最终退信重算",
        bodyText: "正文",
        bodyHtml: "<p>正文</p>",
        idempotencyKey: `recount-bounce-${randomUUID()}`,
        status: "FAILED",
        totalRecipients: 1,
        failedRecipients: 1,
        recipients: {
          create: {
            userId: user.id,
            emailNormalized: email,
            status: "BOUNCED",
            reasonCode: "FINAL_BOUNCE"
          }
        }
      }
    });

    try {
      const result = await handleMailBatch(
        { batchId: batch.id },
        new Date("2026-08-04T12:00:00.000Z"),
        scheduler,
        { adapter: { send: vi.fn() }, random: () => 0 }
      );
      expect(result).toMatchObject({
        completed: true,
        failed: 1
      });
      await expect(
        prisma.mailBatch.findUniqueOrThrow({
          where: { id: batch.id }
        })
      ).resolves.toMatchObject({
        status: "FAILED",
        failedRecipients: 1
      });
    } finally {
      await prisma.mailBatch.delete({ where: { id: batch.id } });
      await prisma.userProfile.delete({ where: { id: user.id } });
    }
  });

  it("schedules crash recovery at claim expiry without a hot loop", async () => {
    const adapter = { send: vi.fn() };

    const waiting = await handleMailBatch(
      { batchId: recoveryBatchId },
      new Date("2026-07-30T11:15:00.000Z"),
      scheduler,
      {
        adapter,
        random: () => 0,
        reservationNow: new Date(
          "2026-07-30T11:15:00.000Z"
        )
      }
    );

    expect(adapter.send).not.toHaveBeenCalled();
    expect(waiting.completed).toBe(false);
    expect(scheduled).toEqual([
      {
        batchId: recoveryBatchId,
        runAt: new Date("2026-07-30T11:30:00.000Z")
      }
    ]);

    const recovered = await handleMailBatch(
      { batchId: recoveryBatchId },
      new Date("2026-07-30T11:30:00.000Z"),
      scheduler,
      {
        adapter,
        random: () => 0,
        reservationNow: new Date(
          "2026-07-30T11:30:00.000Z"
        )
      }
    );

    expect(recovered).toEqual({
      completed: true,
      sent: 0,
      skipped: 0,
      failed: 1
    });
    expect(scheduled).toHaveLength(1);
    await expect(
      prisma.mailBatchRecipient.findFirstOrThrow({
        where: { batchId: recoveryBatchId }
      })
    ).resolves.toMatchObject({
      status: "FAILED",
      reasonCode: "SMTP_SEND_FAILED",
      completedAt: new Date(
        "2026-07-30T11:30:00.000Z"
      )
    });
  });
});
