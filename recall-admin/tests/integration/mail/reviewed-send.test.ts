import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { sendReviewedMail } from "@/modules/mail/send-reviewed-mail";

describe("reviewed user mail", () => {
  let memberId: string;
  let userId: string;
  let userEmail: string;
  let taskId: string;
  let mailboxId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `mail-admin-${randomUUID()}@example.test`,
        displayName: "Mail Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    memberId = member.id;
    userEmail = `mail-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `mail-user-${randomUUID()}`,
        email: userEmail,
        emailNormalized: userEmail,
        registeredAt: new Date("2026-07-20T08:00:00.000Z"),
        currentSegment: "A"
      }
    });
    userId = user.id;
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "MANUAL",
        triggerKey: `mail-test-${randomUUID()}`,
        ruleVersion: 1,
        title: "跟进未支付用户",
        reason: "邮件发送集成测试",
        priority: "NORMAL",
        status: "TODO",
        assigneeId: memberId,
        dueAt: new Date("2026-07-25T08:00:00.000Z")
      }
    });
    taskId = task.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "测试客服邮箱",
        emailAddress: `support-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorId: memberId, entityType: "MailMessage" }
    });
    await prisma.recallTask.deleteMany({ where: { userId } });
    await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.member.deleteMany({ where: { id: memberId } });
    await prisma.$disconnect();
  });

  it("sends only reviewed final content and records the provider id", async () => {
    const adapter = {
      testConnection: vi.fn(),
      listMessagesSince: vi.fn(),
      send: vi.fn().mockResolvedValue({
        providerMessageId: "<reviewed-send@example.test>"
      })
    };

    const { message: sent, taskId: resolvedTaskId } =
      await sendReviewedMail(
      {
        actorId: memberId,
        mailboxId,
        userId,
        taskId,
        recipient: userEmail,
        subject: "RightToken 首次使用提醒",
        bodyText: "你好，我们可以协助你完成首次支付。",
        minimumContactIntervalMinutes: 24 * 60,
        now: new Date("2026-07-24T08:00:00.000Z")
      },
      adapter
    );
    expect(resolvedTaskId).toBe(taskId);

    expect(adapter.send).toHaveBeenCalledWith({
      to: [expect.stringMatching(/@example\.test$/)],
      subject: "RightToken 首次使用提醒",
      text: "你好，我们可以协助你完成首次支付。",
      html: "<p>你好，我们可以协助你完成首次支付。</p>",
      attachments: []
    });
    expect(sent).toMatchObject({
      status: "SENT",
      reviewedById: memberId,
      providerMessageId: "<reviewed-send@example.test>",
      subject: "RightToken 首次使用提醒",
      bodyText: "你好，我们可以协助你完成首次支付。"
    });
    expect(
      await prisma.auditLog.findFirst({
        where: {
          actorId: memberId,
          action: "mail.reviewed_sent",
          entityId: sent.id
        }
      })
    ).not.toBeNull();
  });

  it("sends to the reviewed override and records a safe audit marker", async () => {
    const recipient = `manual-${randomUUID()}@example.test`;
    const adapter = {
      testConnection: vi.fn(),
      listMessagesSince: vi.fn(),
      send: vi.fn().mockResolvedValue({
        providerMessageId: "<manual-recipient@example.test>"
      })
    };

    const { message: sent } = await sendReviewedMail(
      {
        actorId: memberId,
        mailboxId,
        userId,
        taskId,
        recipient,
        subject: "RightToken 邮箱联调",
        bodyText: "这是一封人工确认的联调邮件。",
        minimumContactIntervalMinutes: 0,
        now: new Date("2026-07-24T09:00:00.000Z")
      },
      adapter
    );

    expect(adapter.send).toHaveBeenCalledWith({
      to: [recipient],
      subject: "RightToken 邮箱联调",
      text: "这是一封人工确认的联调邮件。",
      html: "<p>这是一封人工确认的联调邮件。</p>",
      attachments: []
    });
    expect(sent).toMatchObject({
      taskId,
      userId,
      toAddresses: [recipient]
    });
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          entityId: sent.id,
          action: "mail.reviewed_sent"
        }
      })
    ).resolves.toMatchObject({
      metadata: expect.objectContaining({
        recipientOverridden: true,
        recipientDomain: "example.test"
      })
    });
  });

  it("blocks a manually entered address on the suppression list", async () => {
    const recipient = `suppressed-${randomUUID()}@example.test`;
    await prisma.suppressionEntry.create({
      data: {
        emailNormalized: recipient,
        reason: "integration test",
        source: "test"
      }
    });
    try {
      await expect(
        sendReviewedMail(
          {
            actorId: memberId,
            mailboxId,
            userId,
            taskId,
            recipient,
            subject: "不可发送",
            bodyText: "退订名单应阻止这封邮件。",
            minimumContactIntervalMinutes: 0
          },
          { send: vi.fn() }
        )
      ).rejects.toMatchObject({
        code: "RECIPIENT_SUPPRESSED"
      });
    } finally {
      await prisma.suppressionEntry.delete({
        where: { emailNormalized: recipient }
      });
    }
  });

  it("does not create a task when a proactive recipient is skipped", async () => {
    const recipient =
      `suppressed-proactive-${randomUUID()}@example.test`;
    await prisma.suppressionEntry.create({
      data: {
        emailNormalized: recipient,
        reason: "integration test",
        source: "test"
      }
    });
    const tasksBefore = await prisma.recallTask.count({
      where: { userId }
    });
    try {
      await expect(
        sendReviewedMail(
          {
            actorId: memberId,
            mailboxId,
            userId,
            recipient,
            subject: "不可发送的主动联系",
            bodyText: "被跳过时不应创建任务。",
            minimumContactIntervalMinutes: 0
          },
          { send: vi.fn() }
        )
      ).rejects.toMatchObject({
        code: "RECIPIENT_SUPPRESSED"
      });
      await expect(
        prisma.recallTask.count({ where: { userId } })
      ).resolves.toBe(tasksBefore);
    } finally {
      await prisma.suppressionEntry.delete({
        where: { emailNormalized: recipient }
      });
    }
  });

  it("creates a tracked manual task when proactive mail has no task", async () => {
    const now = new Date("2026-07-24T10:00:00.000Z");
    const result = await sendReviewedMail(
      {
        actorId: memberId,
        mailboxId,
        userId,
        recipient: userEmail,
        subject: "主动联系用户",
        bodyText: "这是一次没有既有任务的主动联系。",
        minimumContactIntervalMinutes: 0,
        now
      },
      {
        send: vi.fn().mockResolvedValue({
          providerMessageId: "<proactive@example.test>"
        })
      }
    );

    expect(result.message).toMatchObject({
      taskId: result.taskId,
      userId,
      status: "SENT"
    });
    await expect(
      prisma.recallTask.findUniqueOrThrow({
        where: { id: result.taskId }
      })
    ).resolves.toMatchObject({
      userId,
      origin: "MANUAL",
      assigneeId: memberId,
      status: "WAITING_USER",
      startedAt: now
    });
    await expect(
      prisma.taskActivity.findFirstOrThrow({
        where: {
          taskId: result.taskId,
          action: "task.waiting_user"
        }
      })
    ).resolves.toBeTruthy();
  });
});
