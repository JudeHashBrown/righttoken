import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createBounceRetryBatch
} from "@/modules/mail/create-bounce-retry-batch";
import {
  getMailBatchSummary
} from "@/modules/mail/mail-batch-query";
import type { TaskScheduler } from "@/modules/tasks/scheduler";

describe("final bounce retry batches", () => {
  let memberId: string;
  let mailboxId: string;
  let rootBatchId: string;
  let assetId: string;
  const userIds: string[] = [];
  const scheduled: string[] = [];
  const scheduler: TaskScheduler = {
    async scheduleSegmentCheck() {},
    async scheduleMailBatch({ batchId }) {
      scheduled.push(batchId);
    }
  };

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `bounce-retry-admin-${randomUUID()}@example.test`,
        displayName: "Bounce Retry Admin",
        passwordHash: "not-used",
        role: "ADMIN"
      }
    });
    memberId = member.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "退信重发测试邮箱",
        emailAddress: `bounce-retry-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const users = await Promise.all(
      ["z", "a", "smtp-failed"].map(async (label) => {
        const email = `${label}-${randomUUID()}@example.test`;
        const user = await prisma.userProfile.create({
          data: {
            externalUserId: `bounce-retry-${label}-${randomUUID()}`,
            email,
            emailNormalized: email,
            registeredAt: new Date("2026-08-01T08:00:00.000Z"),
            currentSegment: "F"
          }
        });
        userIds.push(user.id);
        return user;
      })
    );
    const asset = await prisma.mailAsset.create({
      data: {
        storageKey: `mail-assets/${randomUUID()}.png`,
        fileName: "retry.png",
        contentType: "image/png",
        byteSize: 100,
        sha256: "a".repeat(64),
        width: 10,
        height: 10,
        createdById: memberId
      }
    });
    assetId = asset.id;
    const batch = await prisma.mailBatch.create({
      data: {
        mailboxId,
        createdById: memberId,
        audienceMode: "SEGMENT",
        segment: "F",
        subject: "原始群发主题",
        bodyText: "原始群发正文",
        bodyHtml:
          `<p>原始群发正文</p><img data-mail-asset-id="${assetId}">`,
        idempotencyKey: `root-${randomUUID()}`,
        status: "FAILED",
        totalRecipients: 3,
        failedRecipients: 3,
        recipients: {
          create: [
            {
              userId: users[0].id,
              emailNormalized: users[0].emailNormalized,
              status: "BOUNCED",
              reasonCode: "FINAL_BOUNCE",
              bouncedAt: new Date("2026-08-04T08:00:00.000Z")
            },
            {
              userId: users[1].id,
              emailNormalized: users[1].emailNormalized,
              status: "BOUNCED",
              reasonCode: "FINAL_BOUNCE",
              bouncedAt: new Date("2026-08-04T08:01:00.000Z")
            },
            {
              userId: users[2].id,
              emailNormalized: users[2].emailNormalized,
              status: "FAILED",
              reasonCode: "SMTP_SEND_FAILED"
            }
          ]
        },
        assets: {
          create: {
            assetId,
            disposition: "INLINE",
            sortOrder: 0
          }
        }
      }
    });
    rootBatchId = batch.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actorId: memberId } });
    await prisma.mailBatch.deleteMany({
      where: { retryRootBatchId: rootBatchId }
    });
    await prisma.mailBatch.deleteMany({
      where: { id: rootBatchId }
    });
    await prisma.mailAsset.delete({ where: { id: assetId } });
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.mailbox.delete({ where: { id: mailboxId } });
    await prisma.member.delete({ where: { id: memberId } });
    await prisma.$disconnect();
  });

  it("returns only stable actionable final-bounce leaves", async () => {
    const summary = await getMailBatchSummary(
      { id: memberId, role: "ADMIN" },
      rootBatchId
    );

    const expected = [...summary.actionableBounceEmails].sort();
    expect(summary.actionableBounceCount).toBe(2);
    expect(summary.actionableBounceEmails).toEqual(expected);
    expect(summary.actionableBounceList).toBe(expected.join(";"));
    expect(summary.actionableBounceList).not.toContain("smtp-failed");
  });

  it("creates an idempotent child batch with inherited content and lineage", async () => {
    const batch = await createBounceRetryBatch({
      actorId: memberId,
      batchId: rootBatchId,
      idempotencyKey: "bounce-retry-key-1",
      scheduler,
      now: new Date("2026-08-04T09:00:00.000Z")
    });
    const replay = await createBounceRetryBatch({
      actorId: memberId,
      batchId: rootBatchId,
      idempotencyKey: "bounce-retry-key-1",
      scheduler,
      now: new Date("2026-08-04T09:00:01.000Z")
    });

    expect(replay.id).toBe(batch.id);
    expect(batch).toMatchObject({
      retryRootBatchId: rootBatchId,
      mailboxId,
      subject: "原始群发主题",
      bodyText: "原始群发正文",
      totalRecipients: 2,
      pendingRecipients: 2
    });
    const recipients = await prisma.mailBatchRecipient.findMany({
      where: { batchId: batch.id },
      orderBy: { emailNormalized: "asc" }
    });
    expect(recipients).toHaveLength(2);
    expect(recipients.every((row) => row.retryOfRecipientId)).toBe(true);
    expect(
      recipients.some((row) =>
        row.emailNormalized.includes("smtp-failed")
      )
    ).toBe(false);
    await expect(
      prisma.mailBatchAsset.count({
        where: { batchId: batch.id, assetId }
      })
    ).resolves.toBe(1);
    expect(scheduled).toEqual([batch.id]);

    const rootSummary = await getMailBatchSummary(
      { id: memberId, role: "ADMIN" },
      rootBatchId
    );
    expect(rootSummary.actionableBounceCount).toBe(0);

    await prisma.mailBatchRecipient.update({
      where: { id: recipients[0]!.id },
      data: { status: "BOUNCED", reasonCode: "FINAL_BOUNCE" }
    });
    const bouncedAgain = await getMailBatchSummary(
      { id: memberId, role: "ADMIN" },
      rootBatchId
    );
    expect(bouncedAgain.actionableBounceEmails).toEqual([
      recipients[0]!.emailNormalized
    ]);
  });
});
