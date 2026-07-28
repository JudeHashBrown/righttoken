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
import { replyToMailThread } from "@/modules/mail/reply-to-thread";

describe("threaded user mail replies", () => {
  let operatorId: string;
  let otherOperatorId: string;
  let userId: string;
  let userEmail: string;
  let mailboxId: string;
  let threadId: string;
  let taskId: string;
  let templateId: string;
  let assetId: string;

  beforeAll(async () => {
    const [operator, otherOperator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `reply-operator-${randomUUID()}@example.test`,
          displayName: "Reply Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `other-reply-operator-${randomUUID()}@example.test`,
          displayName: "Other Reply Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    operatorId = operator.id;
    otherOperatorId = otherOperator.id;
    userEmail = `thread-reply-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `thread-reply-${randomUUID()}`,
        email: userEmail,
        emailNormalized: userEmail,
        registeredAt: new Date("2026-07-20T08:00:00.000Z"),
        currentSegment: "B",
        ownerId: operatorId
      }
    });
    userId = user.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "线程回复测试邮箱",
        emailAddress: `thread-support-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const thread = await prisma.mailThread.create({
      data: {
        userId,
        mailboxId,
        subject: "RightToken 支付协助"
      }
    });
    threadId = thread.id;
    await prisma.mailMessage.createMany({
      data: [
        {
          mailboxId,
          threadId,
          userId,
          direction: "OUTBOUND",
          status: "SENT",
          providerMessageId: "<original-outbound@example.test>",
          references: [],
          fromAddress: mailbox.emailAddress,
          toAddresses: [userEmail],
          subject: "RightToken 支付协助",
          bodyText: "如需协助请回复。",
          sentAt: new Date("2026-07-27T09:00:00.000Z")
        },
        {
          mailboxId,
          threadId,
          userId,
          direction: "INBOUND",
          status: "RECEIVED",
          providerMessageId: "<latest-inbound@example.test>",
          inReplyTo: "<original-outbound@example.test>",
          references: ["<original-outbound@example.test>"],
          fromAddress: userEmail,
          toAddresses: [mailbox.emailAddress],
          subject: "Re: RightToken 支付协助",
          bodyText: "我需要帮助。",
          receivedAt: new Date("2026-07-27T10:00:00.000Z")
        }
      ]
    });
    const task = await prisma.recallTask.create({
      data: {
        userId,
        origin: "EMAIL_REPLY",
        triggerKey: `thread-reply-${randomUUID()}`,
        ruleVersion: 1,
        title: "用户邮件回复：支付协助",
        reason: "用户回复了运营邮件，需要人工处理",
        priority: "IMPORTANT",
        status: "TODO",
        assigneeId: operatorId,
        dueAt: new Date("2026-07-27T14:00:00.000Z")
      }
    });
    taskId = task.id;
    const asset = await prisma.mailAsset.create({
      data: {
        storageKey: `mail-assets/${randomUUID()}.webp`,
        fileName: "payment-guide.webp",
        contentType: "image/webp",
        byteSize: 128,
        sha256: "d".repeat(64),
        width: 80,
        height: 60,
        createdById: operatorId
      }
    });
    assetId = asset.id;
    const template = await prisma.mailTemplate.create({
      data: {
        key: `payment-help-${randomUUID()}`,
        version: 2,
        name: "支付协助",
        subject: "Re: RightToken 支付协助",
        bodyText: "我们已经收到你的问题。",
        bodyHtml:
          `<p>我们已经收到你的问题。</p>` +
          `<img data-mail-asset-id="${assetId}" alt="支付说明">`,
        active: true,
        createdById: operatorId,
        assets: {
          create: {
            assetId,
            disposition: "INLINE",
            cid: `${assetId}@righttoken`,
            sortOrder: 0
          }
        }
      }
    });
    templateId = template.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        actorId: { in: [operatorId, otherOperatorId] },
        action: "mail.thread_replied"
      }
    });
    await prisma.mailTemplate.deleteMany({
      where: { id: templateId }
    });
    await prisma.recallTask.deleteMany({ where: { id: taskId } });
    await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
    await prisma.mailAsset.deleteMany({
      where: { id: assetId }
    });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.member.deleteMany({
      where: { id: { in: [operatorId, otherOperatorId] } }
    });
    await prisma.$disconnect();
  });

  it("sends a reply with thread headers and records the selected template version", async () => {
    const adapter = {
      send: vi.fn().mockResolvedValue({
        providerMessageId: "<thread-reply-sent@example.test>"
      })
    };

    const sent = await replyToMailThread(
      {
        actorId: operatorId,
        threadId,
        taskId,
        mailboxId,
        recipient: userEmail,
        subject: "Re: RightToken 支付协助",
        bodyText: "我们已经收到你的问题。",
        bodyHtml:
          `<p>我们已经收到你的问题。</p>` +
          `<img data-mail-asset-id="${assetId}" alt="支付说明">`,
        assets: [
          {
            id: assetId,
            disposition: "INLINE",
            sortOrder: 0
          }
        ],
        templateId,
        minimumContactIntervalMinutes: 0,
        now: new Date("2026-07-27T11:00:00.000Z")
      },
      adapter,
      {
        storage: {
          put: vi.fn(),
          get: vi.fn().mockResolvedValue(Buffer.from("image")),
          delete: vi.fn(),
          exists: vi.fn()
        }
      }
    );

    expect(adapter.send).toHaveBeenCalledWith({
      to: [userEmail],
      subject: "Re: RightToken 支付协助",
      text: "我们已经收到你的问题。",
      html: expect.stringContaining(`cid:${assetId}@righttoken`),
      attachments: [
        expect.objectContaining({
          filename: "payment-guide.webp",
          cid: `${assetId}@righttoken`,
          contentDisposition: "inline"
        })
      ],
      inReplyTo: "<latest-inbound@example.test>",
      references: [
        "<original-outbound@example.test>",
        "<latest-inbound@example.test>"
      ]
    });
    expect(sent).toMatchObject({
      threadId,
      taskId,
      templateKey: expect.stringMatching(/^payment-help-/),
      templateVersion: 2,
      status: "SENT"
    });
    await expect(
      prisma.mailMessageAsset.count({
        where: {
          messageId: sent.id,
          assetId
        }
      })
    ).resolves.toBe(1);
  });

  it("blocks an operator from replying to another operator's user", async () => {
    await expect(
      replyToMailThread(
        {
          actorId: otherOperatorId,
          threadId,
          taskId,
          mailboxId,
          recipient: userEmail,
          subject: "Re: RightToken 支付协助",
          bodyText: "不应发送。",
          templateId: null,
          minimumContactIntervalMinutes: 0
        },
        { send: vi.fn() }
      )
    ).rejects.toMatchObject({ name: "ForbiddenError" });
  });
});
