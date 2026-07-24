import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { sendReviewedMail } from "@/modules/mail/send-reviewed-mail";

describe("reviewed user mail", () => {
  let memberId: string;
  let userId: string;
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
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `mail-user-${randomUUID()}`,
        email: `mail-user-${randomUUID()}@example.test`,
        emailNormalized: `mail-user-${randomUUID()}@example.test`,
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
    await prisma.recallTask.deleteMany({ where: { id: taskId } });
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

    const sent = await sendReviewedMail(
      {
        actorId: memberId,
        mailboxId,
        taskId,
        subject: "RightToken 首次使用提醒",
        bodyText: "你好，我们可以协助你完成首次支付。",
        minimumContactIntervalMinutes: 24 * 60,
        now: new Date("2026-07-24T08:00:00.000Z")
      },
      adapter
    );

    expect(adapter.send).toHaveBeenCalledWith({
      to: [expect.stringMatching(/@example\.test$/)],
      subject: "RightToken 首次使用提醒",
      text: "你好，我们可以协助你完成首次支付。"
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
});
