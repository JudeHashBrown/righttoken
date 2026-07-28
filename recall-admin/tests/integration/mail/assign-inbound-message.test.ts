import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  assignInboundMessage
} from "@/modules/mail/assign-inbound-message";

describe("assigning unmatched inbound mail", () => {
  let operatorId: string;
  let otherOperatorId: string;
  let userId: string;
  let otherUserId: string;
  let mailboxId: string;
  let messageId: string;
  const providerMessageId = `<unmatched-${randomUUID()}@example.test>`;

  beforeAll(async () => {
    const [operator, otherOperator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `assign-operator-${randomUUID()}@example.test`,
          displayName: "Assign Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `assign-other-${randomUUID()}@example.test`,
          displayName: "Other Assign Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    operatorId = operator.id;
    otherOperatorId = otherOperator.id;
    const [user, otherUser] = await Promise.all([
      prisma.userProfile.create({
        data: {
          externalUserId: `assign-user-${randomUUID()}`,
          email: `assign-user-${randomUUID()}@example.test`,
          emailNormalized: `assign-normalized-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-20T08:00:00.000Z"),
          currentSegment: "B",
          ownerId: operatorId
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `other-user-${randomUUID()}`,
          email: `other-user-${randomUUID()}@example.test`,
          emailNormalized: `other-normalized-${randomUUID()}@example.test`,
          registeredAt: new Date("2026-07-20T08:00:00.000Z"),
          currentSegment: "C",
          ownerId: otherOperatorId
        }
      })
    ]);
    userId = user.id;
    otherUserId = otherUser.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "人工归档测试邮箱",
        emailAddress: `assign-support-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const message = await prisma.mailMessage.create({
      data: {
        mailboxId,
        direction: "INBOUND",
        status: "UNMATCHED",
        providerMessageId,
        references: [],
        fromAddress: "unknown@example.test",
        toAddresses: [mailbox.emailAddress],
        subject: "需要人工帮助",
        bodyText: "请帮我查看账户。",
        receivedAt: new Date("2026-07-27T09:00:00.000Z"),
        lastErrorCode: "NO_MATCH"
      }
    });
    messageId = message.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        actorId: operatorId,
        action: "mail.inbound_assigned"
      }
    });
    await prisma.recallTask.deleteMany({
      where: {
        userId,
        origin: "EMAIL_REPLY"
      }
    });
    await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
    await prisma.userProfile.deleteMany({
      where: { id: { in: [userId, otherUserId] } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [operatorId, otherOperatorId] } }
    });
    await prisma.$disconnect();
  });

  it("associates the message and creates exactly one reply task", async () => {
    const first = await assignInboundMessage({
      actorId: operatorId,
      messageId,
      userId,
      now: new Date("2026-07-27T10:00:00.000Z")
    });
    const second = await assignInboundMessage({
      actorId: operatorId,
      messageId,
      userId,
      now: new Date("2026-07-27T10:01:00.000Z")
    });

    expect(first.message).toMatchObject({
      id: messageId,
      userId,
      status: "RECEIVED"
    });
    expect(first.thread.userId).toBe(userId);
    expect(second.task.id).toBe(first.task.id);
    expect(
      await prisma.recallTask.count({
        where: { userId, origin: "EMAIL_REPLY" }
      })
    ).toBe(1);
  });

  it("blocks an operator from assigning another operator's user", async () => {
    await expect(
      assignInboundMessage({
        actorId: operatorId,
        messageId,
        userId: otherUserId
      })
    ).rejects.toMatchObject({ name: "ForbiddenError" });
  });
});
