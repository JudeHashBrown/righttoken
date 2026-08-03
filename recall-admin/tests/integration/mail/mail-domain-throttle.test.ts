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
  reserveBulkMailRecipient,
  type BulkMailReservation
} from "@/modules/mail/bulk-mail-throttle";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

async function waitForAdvisoryLock(pid: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const [activity] = await prisma.$queryRaw<
      Array<{
        waitEvent: string | null;
        waitEventType: string | null;
      }>
    >`
      SELECT
        "wait_event" AS "waitEvent",
        "wait_event_type" AS "waitEventType"
      FROM "pg_stat_activity"
      WHERE "pid" = ${pid}
    `;
    if (
      activity?.waitEventType === "Lock" &&
      activity.waitEvent === "advisory"
    ) {
      return activity;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `backend ${pid} did not wait on an advisory lock`
  );
}

async function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(message)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

describe("mail domain throttle reservation", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const sharedSenderDomain =
    `shared-${randomUUID()}.example.test`;
  const otherSenderDomain =
    `other-${randomUUID()}.example.test`;
  const concurrentSenderDomain =
    `concurrent-${randomUUID()}.example.test`;
  const contentionSenderDomain =
    `contention-${randomUUID()}.example.test`;
  const independentSenderDomain =
    `independent-${randomUUID()}.example.test`;
  const postLockSenderDomain =
    `post-lock-${randomUUID()}.example.test`;
  const senderDomains = [
    sharedSenderDomain,
    otherSenderDomain,
    concurrentSenderDomain,
    contentionSenderDomain,
    independentSenderDomain,
    postLockSenderDomain
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
  let contentionBatchId: string;
  let independentBatchId: string;
  let postLockBatchId: string;

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
    contentionBatchId = await createPendingBatch(
      contentionSenderDomain
    );
    independentBatchId = await createPendingBatch(
      independentSenderDomain
    );
    postLockBatchId = await createPendingBatch(
      postLockSenderDomain
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
      claimedAt: now,
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
      claimedAt: now,
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
      claimedAt: now,
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

  it("waits for the same domain lock without blocking another domain", async () => {
    const heldDomainRunAt = new Date(
      now.getTime() + 180_000
    );
    const lockAcquired = deferred<number>();
    const releaseLock = deferred<void>();
    const contenderStarted = deferred<number>();
    let sameDomainSettled = false;
    let sameDomainReservation:
      | Promise<BulkMailReservation>
      | undefined;
    let independentReservation:
      | Promise<BulkMailReservation>
      | undefined;

    const lockHolder = prisma
      .$transaction(async (tx) => {
        const [connection] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`
          SELECT
            pg_backend_pid()::int AS "pid",
            pg_advisory_xact_lock(
              hashtextextended(${contentionSenderDomain}, 0)
            )::text AS "locked"
        `;
        lockAcquired.resolve(connection.pid);
        await releaseLock.promise;
        await tx.mailDomainThrottle.upsert({
          where: { senderDomain: contentionSenderDomain },
          create: {
            senderDomain: contentionSenderDomain,
            nextAvailableAt: heldDomainRunAt
          },
          update: { nextAvailableAt: heldDomainRunAt }
        });
      })
      .catch((error) => {
        lockAcquired.reject(error);
        throw error;
      });

    try {
      const lockHolderPid = await lockAcquired.promise;
      sameDomainReservation = prisma
        .$transaction(async (tx) => {
          const [connection] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`
            SELECT pg_backend_pid()::int AS "pid"
          `;
          contenderStarted.resolve(connection.pid);
          return reserveBulkMailRecipient(tx, {
            batchId: contentionBatchId,
            senderDomain: contentionSenderDomain,
            now,
            random: () => 0
          });
        })
        .then((result) => {
          sameDomainSettled = true;
          return result;
        })
        .catch((error) => {
          contenderStarted.reject(error);
          throw error;
        });

      const contenderPid = await contenderStarted.promise;
      expect(contenderPid).not.toBe(lockHolderPid);
      await expect(
        waitForAdvisoryLock(contenderPid)
      ).resolves.toEqual({
        waitEvent: "advisory",
        waitEventType: "Lock"
      });
      expect(sameDomainSettled).toBe(false);

      independentReservation = prisma.$transaction((tx) =>
        reserveBulkMailRecipient(tx, {
          batchId: independentBatchId,
          senderDomain: independentSenderDomain,
          now,
          random: () => 0
        })
      );
      await expect(
        within(
          independentReservation,
          1_000,
          "different-domain reservation did not complete while the lock was held"
        )
      ).resolves.toMatchObject({
        status: "CLAIMED",
        recipientId: expect.any(String),
        runAt: new Date(now.getTime() + 120_000)
      });
    } finally {
      releaseLock.resolve(undefined);
      await lockHolder;
      await Promise.allSettled(
        [sameDomainReservation, independentReservation].filter(
          (
            reservation
          ): reservation is Promise<BulkMailReservation> =>
            reservation !== undefined
        )
      );
    }

    await expect(sameDomainReservation).resolves.toEqual({
      status: "WAIT",
      runAt: heldDomainRunAt
    });
    await expect(
      prisma.mailBatchRecipient.findFirstOrThrow({
        where: { batchId: contentionBatchId },
        select: {
          status: true,
          attempts: true,
          claimedAt: true,
          lastAttemptAt: true
        }
      })
    ).resolves.toEqual({
      status: "PENDING",
      attempts: 0,
      claimedAt: null,
      lastAttemptAt: null
    });
  });

  it("measures a production reservation from database time after lock acquisition", async () => {
    const lockAcquired = deferred<number>();
    const releaseLock = deferred<void>();
    const contenderStarted = deferred<number>();
    let reservation:
      | Promise<BulkMailReservation>
      | undefined;
    let releasedAt: Date | undefined;

    const lockHolder = prisma
      .$transaction(async (tx) => {
        const [connection] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`
          SELECT
            pg_backend_pid()::int AS "pid",
            pg_advisory_xact_lock(
              hashtextextended(${postLockSenderDomain}, 0)
            )::text AS "locked"
        `;
        lockAcquired.resolve(connection.pid);
        await releaseLock.promise;
      })
      .catch((error) => {
        lockAcquired.reject(error);
        throw error;
      });

    try {
      const lockHolderPid = await lockAcquired.promise;
      reservation = prisma
        .$transaction(async (tx) => {
          const [connection] = await tx.$queryRaw<
            Array<{ pid: number }>
          >`
            SELECT pg_backend_pid()::int AS "pid"
          `;
          contenderStarted.resolve(connection.pid);
          return reserveBulkMailRecipient(tx, {
            batchId: postLockBatchId,
            senderDomain: postLockSenderDomain,
            random: () => 0
          });
        })
        .catch((error) => {
          contenderStarted.reject(error);
          throw error;
        });

      const contenderPid = await contenderStarted.promise;
      expect(contenderPid).not.toBe(lockHolderPid);
      await expect(
        waitForAdvisoryLock(contenderPid)
      ).resolves.toEqual({
        waitEvent: "advisory",
        waitEventType: "Lock"
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const [clock] = await prisma.$queryRaw<
        Array<{ now: Date }>
      >`
        SELECT clock_timestamp() AS "now"
      `;
      releasedAt = clock.now;
    } finally {
      releaseLock.resolve(undefined);
      await lockHolder;
      if (reservation) {
        await Promise.allSettled([reservation]);
      }
    }

    const result = await reservation;
    expect(result).toMatchObject({
      status: "CLAIMED",
      recipientId: expect.any(String),
      claimedAt: expect.any(Date),
      runAt: expect.any(Date)
    });
    if (result?.status !== "CLAIMED" || !releasedAt) {
      throw new Error("expected a post-lock claim");
    }
    expect(result.claimedAt.getTime()).toBeGreaterThanOrEqual(
      releasedAt.getTime()
    );
    expect(
      result.runAt.getTime() - result.claimedAt.getTime()
    ).toBe(120_000);
    await expect(
      prisma.mailBatchRecipient.findFirstOrThrow({
        where: { batchId: postLockBatchId },
        select: { claimedAt: true, lastAttemptAt: true }
      })
    ).resolves.toEqual({
      claimedAt: result.claimedAt,
      lastAttemptAt: result.claimedAt
    });
    await expect(
      prisma.mailDomainThrottle.findUniqueOrThrow({
        where: { senderDomain: postLockSenderDomain },
        select: { nextAvailableAt: true }
      })
    ).resolves.toEqual({ nextAvailableAt: result.runAt });
  });
});
