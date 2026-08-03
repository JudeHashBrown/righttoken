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
  reserveBulkMailRecipient
} from "@/modules/mail/bulk-mail-throttle";

describe("mail domain throttle reservation", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const sharedSenderDomain =
    `shared-${randomUUID()}.example.test`;
  const otherSenderDomain =
    `other-${randomUUID()}.example.test`;
  const concurrentSenderDomain =
    `concurrent-${randomUUID()}.example.test`;
  const senderDomains = [
    sharedSenderDomain,
    otherSenderDomain,
    concurrentSenderDomain
  ];
  const mailboxIds: string[] = [];
  const userIds: string[] = [];
  const batchIds: string[] = [];
  let memberId: string;
  let firstBatchId: string;
  let secondBatchId: string;
  let otherDomainBatchId: string;
  let firstConcurrentBatchId: string;
  let secondConcurrentBatchId: string;

  async function createPendingBatch(
    senderDomain: string
  ): Promise<string> {
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "Domain throttle fixture",
        emailAddress:
          `sender-${randomUUID()}@${senderDomain}`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxIds.push(mailbox.id);

    const recipientEmail =
      `recipient-${randomUUID()}@example.test`;
    const user = await prisma.userProfile.create({
      data: {
        externalUserId: `domain-throttle-${randomUUID()}`,
        email: recipientEmail,
        emailNormalized: recipientEmail,
        registeredAt: new Date("2026-08-03T08:00:00.000Z"),
        currentSegment: "F"
      }
    });
    userIds.push(user.id);

    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId: mailbox.id,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "Domain throttle reservation",
        bodyText: "Reservation fixture",
        bodyHtml: "<p>Reservation fixture</p>",
        idempotencyKey:
          `domain-throttle-${randomUUID()}`,
        totalRecipients: 1,
        pendingRecipients: 1,
        recipients: {
          create: {
            userId: user.id,
            emailNormalized: recipientEmail
          }
        }
      }
    });
    batchIds.push(batch.id);
    return batch.id;
  }

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email:
          `domain-throttle-admin-${randomUUID()}@example.test`,
        displayName: "Domain Throttle Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    memberId = member.id;

    firstBatchId = await createPendingBatch(
      sharedSenderDomain
    );
    secondBatchId = await createPendingBatch(
      sharedSenderDomain
    );
    otherDomainBatchId = await createPendingBatch(
      otherSenderDomain
    );
    firstConcurrentBatchId = await createPendingBatch(
      concurrentSenderDomain
    );
    secondConcurrentBatchId = await createPendingBatch(
      concurrentSenderDomain
    );
  });

  afterAll(async () => {
    await prisma.mailDomainThrottle.deleteMany({
      where: { senderDomain: { in: senderDomains } }
    });
    await prisma.mailBatch.deleteMany({
      where: { id: { in: batchIds } }
    });
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.mailbox.deleteMany({
      where: { id: { in: mailboxIds } }
    });
    if (memberId) {
      await prisma.member.deleteMany({
        where: { id: memberId }
      });
    }
    await prisma.$disconnect();
  });

  it("applies inclusive delay boundaries per sender domain", async () => {
    const first = await prisma.$transaction((tx) =>
      reserveBulkMailRecipient(tx, {
        batchId: firstBatchId,
        senderDomain: sharedSenderDomain,
        now,
        random: () => 0
      })
    );
    expect(first).toMatchObject({
      status: "CLAIMED",
      recipientId: expect.any(String),
      runAt: new Date(now.getTime() + 120_000)
    });

    const sameDomain = await prisma.$transaction((tx) =>
      reserveBulkMailRecipient(tx, {
        batchId: secondBatchId,
        senderDomain: sharedSenderDomain,
        now,
        random: () => 0.999_999
      })
    );
    expect(sameDomain).toEqual({
      status: "WAIT",
      runAt: new Date(now.getTime() + 120_000)
    });

    const otherDomain = await prisma.$transaction((tx) =>
      reserveBulkMailRecipient(tx, {
        batchId: otherDomainBatchId,
        senderDomain: otherSenderDomain,
        now,
        random: () => 0.999_999
      })
    );
    expect(otherDomain).toMatchObject({
      status: "CLAIMED",
      recipientId: expect.any(String),
      runAt: new Date(now.getTime() + 240_000)
    });
  });

  it("serializes concurrent reservations for the same sender domain", async () => {
    const results = await Promise.all(
      [firstConcurrentBatchId, secondConcurrentBatchId].map(
        (batchId) =>
          prisma.$transaction((tx) =>
            reserveBulkMailRecipient(tx, {
              batchId,
              senderDomain: concurrentSenderDomain,
              now,
              random: () => 0
            })
          )
      )
    );

    expect(
      results.map((result) => result.status).sort()
    ).toEqual(["CLAIMED", "WAIT"]);
    const claimed = results.find(
      (result) => result.status === "CLAIMED"
    );
    const waiting = results.find(
      (result) => result.status === "WAIT"
    );
    expect(claimed).toMatchObject({
      status: "CLAIMED",
      recipientId: expect.any(String),
      runAt: new Date(now.getTime() + 120_000)
    });
    expect(waiting).toEqual({
      status: "WAIT",
      runAt: new Date(now.getTime() + 120_000)
    });

    const recipients =
      await prisma.mailBatchRecipient.findMany({
        where: {
          batchId: {
            in: [
              firstConcurrentBatchId,
              secondConcurrentBatchId
            ]
          }
        },
        orderBy: { id: "asc" },
        select: {
          status: true,
          attempts: true,
          claimedAt: true,
          lastAttemptAt: true
        }
      });
    expect(recipients).toEqual(
      expect.arrayContaining([
        {
          status: "SENDING",
          attempts: 1,
          claimedAt: now,
          lastAttemptAt: now
        },
        {
          status: "PENDING",
          attempts: 0,
          claimedAt: null,
          lastAttemptAt: null
        }
      ])
    );
  });
});
