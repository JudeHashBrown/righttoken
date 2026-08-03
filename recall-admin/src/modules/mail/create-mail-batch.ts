import type {
  MailBatch,
  MailBatchRecipientStatus,
  Prisma
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import {
  findMailAudienceUsers,
  type MailBatchAudience
} from "@/modules/mail/mail-audience";
import {
  resolveOutboundMailAssets,
  type OutboundAssetReference
} from "@/modules/mail/outbound-assets";
import {
  plainTextToMailHtml
} from "@/modules/mail/rich-content";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

export type CreateMailBatchInput = {
  actorId: string;
  mailboxId: string;
  audience: MailBatchAudience;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  assets: OutboundAssetReference[];
  idempotencyKey: string;
  scheduler: TaskScheduler;
  now?: Date;
};

export class MailBatchCreationError extends Error {
  constructor(
    readonly code:
      | "MAILBOX_DISABLED"
      | "EMPTY_MAIL_AUDIENCE"
      | "INVALID_IDEMPOTENCY_KEY"
  ) {
    super(code);
    this.name = "MailBatchCreationError";
  }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recipientStatus(input: {
  emailNormalized: string;
  unsubscribedAt: Date | null;
  pausedAt: Date | null;
  suppressed: boolean;
  duplicate: boolean;
}): {
  status: MailBatchRecipientStatus;
  reasonCode: string | null;
} {
  if (!emailPattern.test(input.emailNormalized)) {
    return {
      status: "SKIPPED",
      reasonCode: "INVALID_RECIPIENT"
    };
  }
  if (input.unsubscribedAt || input.suppressed) {
    return {
      status: "SKIPPED",
      reasonCode: "RECIPIENT_SUPPRESSED"
    };
  }
  if (input.pausedAt) {
    return {
      status: "SKIPPED",
      reasonCode: "RECIPIENT_PAUSED"
    };
  }
  if (input.duplicate) {
    return {
      status: "SKIPPED",
      reasonCode: "DUPLICATE_RECIPIENT"
    };
  }
  return { status: "PENDING", reasonCode: null };
}

export async function createMailBatch(
  input: CreateMailBatchInput
): Promise<MailBatch> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw new MailBatchCreationError(
      "INVALID_IDEMPOTENCY_KEY"
    );
  }
  const existing = await prisma.mailBatch.findUnique({
    where: { idempotencyKey }
  });
  if (existing) {
    if (existing.createdById !== input.actorId) {
      throw new ForbiddenError("mail:send-reviewed");
    }
    return existing;
  }

  const richContent = await resolveOutboundMailAssets({
    bodyHtml:
      input.bodyHtml.trim() ||
      plainTextToMailHtml(input.bodyText),
    assets: input.assets
  });
  const now = input.now ?? new Date();

  const batch = await prisma.$transaction(async (tx) => {
    const [actor, mailbox] = await Promise.all([
      tx.member.findUniqueOrThrow({
        where: { id: input.actorId },
        select: { id: true, role: true, active: true }
      }),
      tx.mailbox.findFirstOrThrow({
        where: {
          id: input.mailboxId,
          ...configuredMailboxWhere
        },
        select: { id: true, enabled: true }
      })
    ]);
    if (!actor.active) {
      throw new ForbiddenError("mail:send-reviewed");
    }
    assertMemberPermission(actor, "mail:send-reviewed");
    if (!mailbox.enabled) {
      throw new MailBatchCreationError("MAILBOX_DISABLED");
    }

    const users = await findMailAudienceUsers(
      tx,
      actor,
      input.audience
    );
    if (users.length === 0) {
      throw new MailBatchCreationError(
        "EMPTY_MAIL_AUDIENCE"
      );
    }
    const normalizedEmails = users
      .map((user) =>
        (
          user.emailNormalized.trim() ||
          user.email.trim()
        ).toLowerCase()
      )
      .filter(Boolean);
    const suppressions = normalizedEmails.length
      ? await tx.suppressionEntry.findMany({
          where: {
            emailNormalized: {
              in: [...new Set(normalizedEmails)]
            }
          },
          select: { emailNormalized: true }
        })
      : [];
    const suppressed = new Set(
      suppressions.map((entry) => entry.emailNormalized)
    );
    const seen = new Set<string>();
    const recipients = users.map((user) => {
      const emailNormalized = (
        user.emailNormalized.trim() || user.email.trim()
      ).toLowerCase();
      const duplicate = seen.has(emailNormalized);
      if (emailNormalized) {
        seen.add(emailNormalized);
      }
      const outcome = recipientStatus({
        emailNormalized,
        unsubscribedAt: user.unsubscribedAt,
        pausedAt: user.pausedAt,
        suppressed: suppressed.has(emailNormalized),
        duplicate
      });
      return {
        userId: user.id,
        emailNormalized,
        status: outcome.status,
        reasonCode: outcome.reasonCode,
        ...(outcome.status === "SKIPPED"
          ? { completedAt: now }
          : {})
      };
    });
    const pendingRecipients = recipients.filter(
      (recipient) => recipient.status === "PENDING"
    ).length;
    const skippedRecipients =
      recipients.length - pendingRecipients;

    const created = await tx.mailBatch.create({
      data: {
        mailboxId: mailbox.id,
        createdById: actor.id,
        audienceMode: input.audience.mode,
        segment:
          input.audience.mode === "SEGMENT"
            ? input.audience.segment
            : null,
        subject: input.subject.trim(),
        bodyText: richContent.bodyText,
        bodyHtml: richContent.bodyHtml,
        idempotencyKey,
        totalRecipients: recipients.length,
        pendingRecipients,
        skippedRecipients,
        recipients: { create: recipients },
        assets: {
          create: richContent.messageAssets.map(
            ({ assetId, disposition, sortOrder }) => ({
              assetId,
              disposition,
              sortOrder
            })
          )
        }
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "mail.batch_created",
        entityType: "MailBatch",
        entityId: created.id,
        metadata: {
          audienceMode: input.audience.mode,
          ...(input.audience.mode === "SEGMENT"
            ? { segment: input.audience.segment }
            : {}),
          mailboxId: mailbox.id,
          totalRecipients: recipients.length,
          pendingRecipients,
          skippedRecipients
        } satisfies Prisma.InputJsonValue
      }
    });
    return created;
  });

  await input.scheduler.scheduleMailBatch?.({
    batchId: batch.id
  });
  return batch;
}
