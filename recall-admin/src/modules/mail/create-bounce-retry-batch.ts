import type { MailBatch, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import {
  findActionableBounceLeaves,
  MailBatchNotFoundError
} from "@/modules/mail/mail-batch-query";
import { isConfiguredMailbox } from "@/modules/mail/mailbox-availability";
import type { TaskScheduler } from "@/modules/tasks/scheduler";

export type CreateBounceRetryBatchInput = {
  actorId: string;
  batchId: string;
  idempotencyKey: string;
  scheduler: TaskScheduler;
  now?: Date;
};

export class BounceRetryBatchError extends Error {
  constructor(
    readonly code:
      | "INVALID_IDEMPOTENCY_KEY"
      | "IDEMPOTENCY_KEY_CONFLICT"
      | "NO_ACTIONABLE_BOUNCES"
      | "MAILBOX_DISABLED"
  ) {
    super(code);
    this.name = "BounceRetryBatchError";
  }
}

export async function createBounceRetryBatch(
  input: CreateBounceRetryBatchInput
): Promise<MailBatch> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw new BounceRetryBatchError("INVALID_IDEMPOTENCY_KEY");
  }
  const now = input.now ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const [actor, requested] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      tx.mailBatch.findUnique({
        where: { id: input.batchId },
        select: {
          id: true,
          createdById: true,
          retryRootBatchId: true
        }
      })
    ]);
    if (!actor.active) {
      throw new ForbiddenError("mail:send-reviewed");
    }
    assertMemberPermission(actor, "mail:send-reviewed");
    if (!requested) {
      throw new MailBatchNotFoundError();
    }
    if (
      actor.role === "OPERATOR" &&
      requested.createdById !== actor.id
    ) {
      throw new ForbiddenError("mail:send-reviewed");
    }
    const rootBatchId =
      requested.retryRootBatchId ?? requested.id;
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`righttoken:bounce-retry:${rootBatchId}`}, 0)
      )::text AS "locked"
    `;

    const existing = await tx.mailBatch.findUnique({
      where: { idempotencyKey }
    });
    if (existing) {
      if (
        existing.createdById !== actor.id ||
        existing.retryRootBatchId !== rootBatchId
      ) {
        throw new BounceRetryBatchError(
          "IDEMPOTENCY_KEY_CONFLICT"
        );
      }
      return { batch: existing, shouldSchedule: false };
    }

    const root = await tx.mailBatch.findUnique({
      where: { id: rootBatchId },
      select: {
        id: true,
        mailboxId: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        mailbox: {
          select: {
            enabled: true,
            encryptedConfig: true,
            configurationDeletedAt: true
          }
        },
        assets: {
          orderBy: { sortOrder: "asc" },
          select: {
            assetId: true,
            disposition: true,
            sortOrder: true
          }
        }
      }
    });
    if (!root) {
      throw new MailBatchNotFoundError();
    }
    if (!root.mailbox.enabled || !isConfiguredMailbox(root.mailbox)) {
      throw new BounceRetryBatchError("MAILBOX_DISABLED");
    }
    const { leaves } = await findActionableBounceLeaves(
      tx,
      root.id
    );
    if (leaves.length === 0) {
      throw new BounceRetryBatchError(
        "NO_ACTIONABLE_BOUNCES"
      );
    }

    const batch = await tx.mailBatch.create({
      data: {
        mailboxId: root.mailboxId,
        createdById: actor.id,
        audienceMode: "USER",
        segment: null,
        subject: root.subject,
        bodyText: root.bodyText,
        bodyHtml: root.bodyHtml,
        idempotencyKey,
        retryRootBatchId: root.id,
        status: "PENDING",
        totalRecipients: leaves.length,
        pendingRecipients: leaves.length,
        recipients: {
          create: leaves.map((leaf) => ({
            userId: leaf.userId,
            emailNormalized: leaf.emailNormalized,
            taskId: leaf.taskId,
            retryOfRecipientId: leaf.recipientId,
            status: "PENDING"
          }))
        },
        assets: {
          create: root.assets.map((asset) => ({
            assetId: asset.assetId,
            disposition: asset.disposition,
            sortOrder: asset.sortOrder
          }))
        }
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "MAIL_BOUNCE_RETRY_BATCH_CREATED",
        entityType: "MailBatch",
        entityId: batch.id,
        metadata: {
          rootBatchId: root.id,
          requestedBatchId: requested.id,
          recipientCount: leaves.length,
          requestedAt: now.toISOString()
        } satisfies Prisma.InputJsonValue
      }
    });
    return { batch, shouldSchedule: true };
  });

  if (result.shouldSchedule) {
    await input.scheduler.scheduleMailBatch?.({
      batchId: result.batch.id
    });
  }
  return result.batch;
}
