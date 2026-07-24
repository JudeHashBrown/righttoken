import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { syncMailbox } from "@/modules/mail/sync-mailbox";

describe("mailbox reply synchronization", () => {
  let userId: string;
  let mailboxId: string;
  let threadId: string;

  beforeAll(async () => {
    const email = `reply-user-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `reply-user-${randomUUID()}`,
        email,
        emailNormalized: email,
        registeredAt: new Date("2026-07-20T08:00:00.000Z"),
        currentSegment: "B"
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
    const thread = await prisma.mailThread.create({
      data: {
        userId,
        mailboxId,
        subject: "RightToken 支付协助"
      }
    });
    threadId = thread.id;
    await prisma.mailMessage.create({
      data: {
        mailboxId,
        threadId,
        userId,
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
    await prisma.recallTask.deleteMany({
      where: { userId, origin: "EMAIL_REPLY" }
    });
    await prisma.userProfile.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("stores a matched reply and creates one important four-hour task", async () => {
    const receivedAt = new Date("2026-07-24T08:00:00.000Z");
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
          receivedAt
        }
      ])
    };

    const result = await syncMailbox(
      mailboxId,
      adapter,
      new Date("2026-07-24T08:01:00.000Z")
    );

    expect(result).toEqual({
      received: 1,
      matched: 1,
      unmatched: 0,
      replyTasksCreated: 1
    });
    expect(
      await prisma.mailMessage.findUnique({
        where: {
          providerMessageId: "<inbound-sync@example.test>"
        }
      })
    ).toMatchObject({
      threadId,
      userId,
      status: "RECEIVED",
      bodyText: "我需要帮助。"
    });
    expect(
      await prisma.recallTask.findFirst({
        where: { userId, origin: "EMAIL_REPLY" }
      })
    ).toMatchObject({
      priority: "IMPORTANT",
      status: "UNASSIGNED",
      dueAt: new Date("2026-07-24T12:00:00.000Z")
    });
  });
});
