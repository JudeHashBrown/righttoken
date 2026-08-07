import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { syncMailbox } from "@/modules/mail/sync-mailbox";

describe("mailbox reply synchronization", () => {
  let userId: string;
  let mailboxId: string;
  let configurationVersion: number;
  let threadId: string;
  let memberId: string;
  let waitingTaskId: string;
  const storedKeys: string[] = [];

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `reply-operator-${randomUUID()}@example.test`,
        displayName: "Reply Operator",
        passwordHash: "not-used",
        role: "OPERATOR"
      }
    });
    memberId = member.id;
    const email = `reply-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `reply-user-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-07-20T08:00:00.000Z"),
        currentSegment: "B",
        ownerId: memberId
      }
    });
    userId = user.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "回复同步测试邮箱",
        emailAddress: `support-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true,
        lastSyncedAt: new Date("2026-07-24T07:00:00.000Z")
      }
    });
    mailboxId = mailbox.id;
    configurationVersion = mailbox.configurationVersion;
    const thread = await prisma.mailThread.create({
      data: {
        userId,
        mailboxId,
        subject: "RightToken 支付协助"
      }
    });
    threadId = thread.id;
    const waitingTask = await prisma.recallTask.create({
      data: {
        userId,
        origin: "MANUAL",
        triggerKey: `waiting-reply-${randomUUID()}`,
        ruleVersion: 1,
        title: "等待用户回复",
        reason: "邮件回复闭环测试",
        priority: "NORMAL",
        status: "WAITING_USER",
        assigneeId: memberId,
        dueAt: new Date("2026-07-25T08:00:00.000Z"),
        startedAt: new Date("2026-07-24T07:20:00.000Z")
      }
    });
    waitingTaskId = waitingTask.id;
    await prisma.mailMessage.create({
      data: {
        mailboxId,
        threadId,
        userId,
        taskId: waitingTaskId,
        direction: "OUTBOUND",
        status: "SENT",
        providerMessageId: "<outbound-sync@example.test>",
        references: [],
        fromAddress: mailbox.emailAddress,
        toAddresses: [email],
        subject: "RightToken 支付协助",
        bodyText: "如需帮助请直接回复。",
        sentAt: new Date("2026-07-24T07:30:00.000Z")
      }
    });
  });

  afterAll(async () => {
    await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
    await prisma.mailAsset.deleteMany({
      where: { storageKey: { in: storedKeys } }
    });
    await prisma.recallTask.deleteMany({
      where: { userId }
    });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.member.deleteMany({ where: { id: memberId } });
    await prisma.$disconnect();
  });

  it("stores a matched reply and reopens the original waiting task", async () => {
    const receivedAt = new Date("2026-07-24T08:00:00.000Z");
    const image = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: "#5a69df"
      }
    })
      .png()
      .toBuffer();
    const adapter = {
      testConnection: vi.fn(),
      send: vi.fn(),
      listMessagesSince: vi.fn().mockResolvedValue([
        {
          providerMessageId: "<inbound-sync@example.test>",
          inReplyTo: "<outbound-sync@example.test>",
          references: [],
          fromAddress: (
            await prisma.userProfile.findUniqueOrThrow({
              where: { id: userId },
              select: { email: true }
            })
          ).email,
          toAddresses: [
            (
              await prisma.mailbox.findUniqueOrThrow({
                where: { id: mailboxId },
                select: { emailAddress: true }
              })
            ).emailAddress
          ],
          subject: "Re: RightToken 支付协助",
          bodyText: "我需要帮助。",
          bodyHtml:
            '<p>我需要帮助。</p><img src="cid:proof@example.test"><img src="https://tracker.example.test/pixel.gif">',
          attachments: [
            {
              fileName: "proof.png",
              contentType: "image/png",
              content: image,
              cid: "proof@example.test",
              disposition: "INLINE"
            }
          ],
          receivedAt
        }
      ])
    };

    const result = await syncMailbox(
      mailboxId,
      adapter,
      configurationVersion,
      new Date("2026-07-24T08:01:00.000Z"),
      {
        storage: {
          put: vi.fn(async (key: string) => {
            storedKeys.push(key);
          }),
          get: vi.fn(),
          delete: vi.fn(),
          exists: vi.fn()
        }
      }
    );

    expect(result).toEqual({
      received: 1,
      matched: 1,
      unmatched: 0,
      replyTasksCreated: 0,
      replyTasksReopened: 1,
      deliveryEvents: 0,
      finalBounces: 0,
      delayedDeliveries: 0,
      unmatchedBounces: 0
    });
    const storedMessage = await prisma.mailMessage.findUnique({
      where: {
        providerMessageId: "<inbound-sync@example.test>"
      },
      include: {
        assets: {
          include: { asset: true }
        }
      }
    });
    expect(storedMessage).toMatchObject({
      threadId,
      userId,
      status: "RECEIVED",
      bodyText: "我需要帮助。",
      bodyHtml: expect.stringContaining("data-mail-asset-id"),
      externalImagesBlocked: true,
      assets: [
        {
          disposition: "INLINE",
          cid: "proof@example.test",
          asset: {
            fileName: "proof.png",
            contentType: "image/png"
          }
        }
      ]
    });
    expect(storedMessage?.bodyHtml).not.toContain(
      "tracker.example.test"
    );
    await expect(
      prisma.recallTask.findUniqueOrThrow({
        where: { id: waitingTaskId }
      })
    ).resolves.toMatchObject({
      status: "IN_PROGRESS",
      assigneeId: memberId
    });
    await expect(
      prisma.taskActivity.findFirstOrThrow({
        where: {
          taskId: waitingTaskId,
          action: "task.user_replied"
        }
      })
    ).resolves.toBeTruthy();
  });
});
