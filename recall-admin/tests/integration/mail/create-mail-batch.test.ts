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
  createMailBatch
} from "@/modules/mail/create-mail-batch";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

describe("mail batch creation", () => {
  let memberId: string;
  let mailboxId: string;
  let pendingUserId: string;
  let pausedUserId: string;
  const userIds: string[] = [];
  const batchIds: string[] = [];
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
        email:
          `batch-create-admin-${randomUUID()}@example.test`,
        displayName: "Batch Create Admin",
        passwordHash: "not-used",
        role: "OPERATOR"
      }
    });
    memberId = member.id;

    const mailbox = await prisma.mailbox.create({
      data: {
        name: "批次创建邮箱",
        emailAddress:
          `batch-create-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;

    const createUser = async (input: {
      pausedAt?: Date;
      email?: string;
    }) => {
      const email =
        input.email ??
        `batch-create-user-${randomUUID()}@example.test`;
      const user = await prisma.userProfile.create({
        data: {
          externalUserId: `batch-create-${randomUUID()}`,
          email,
          emailNormalized: email.toLowerCase(),
          registeredAt: new Date("2026-07-30T08:00:00.000Z"),
          currentSegment: "E",
          ownerId: memberId,
          pausedAt: input.pausedAt
        }
      });
      userIds.push(user.id);
      return user;
    };

    pendingUserId = (
      await createUser({})
    ).id;
    pausedUserId = (
      await createUser({
        pausedAt: new Date("2026-07-30T09:00:00.000Z")
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        actorId: memberId,
        action: "mail.batch_created"
      }
    });
    await prisma.mailBatch.deleteMany({
      where: { id: { in: batchIds } }
    });
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.mailbox.deleteMany({
      where: { id: mailboxId }
    });
    await prisma.member.deleteMany({
      where: { id: memberId }
    });
    await prisma.$disconnect();
  });

  it("creates one fixed snapshot and schedules it once", async () => {
    const idempotencyKey = `batch-create-${randomUUID()}`;
    const input = {
      actorId: memberId,
      audience: {
        mode: "SEGMENT" as const,
        segment: "E" as const
      },
      mailboxId,
      subject: "服务提醒",
      bodyText: "请查看说明。",
      bodyHtml: "<p>请查看说明。</p>",
      assets: [],
      idempotencyKey,
      scheduler,
      now: new Date("2026-07-30T10:00:00.000Z")
    };

    const first = await createMailBatch(input);
    batchIds.push(first.id);
    const second = await createMailBatch(input);
    const recipients =
      await prisma.mailBatchRecipient.findMany({
        where: {
          batchId: first.id,
          userId: {
            in: [pendingUserId, pausedUserId]
          }
        },
        orderBy: { userId: "asc" }
      });

    expect(second.id).toBe(first.id);
    expect(scheduled).toEqual([first.id]);
    expect(first.totalRecipients).toBeGreaterThanOrEqual(2);
    expect(first.pendingRecipients).toBeGreaterThanOrEqual(1);
    expect(first.skippedRecipients).toBeGreaterThanOrEqual(1);
    expect(recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: pendingUserId,
          status: "PENDING",
          reasonCode: null
        }),
        expect.objectContaining({
          userId: pausedUserId,
          status: "SKIPPED",
          reasonCode: "RECIPIENT_PAUSED"
        })
      ])
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          actorId: memberId,
          action: "mail.batch_created",
          entityId: first.id
        }
      });
    expect(JSON.stringify(audit.metadata)).not.toContain("@");
  });
});
