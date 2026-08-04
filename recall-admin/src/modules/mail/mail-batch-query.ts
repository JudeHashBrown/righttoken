import type {
  MemberRole,
  Prisma
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type MailBatchViewer = {
  id: string;
  role: MemberRole;
};

export class MailBatchNotFoundError extends Error {
  constructor() {
    super("MAIL_BATCH_NOT_FOUND");
    this.name = "MailBatchNotFoundError";
  }
}

type MailBatchQueryClient = Pick<
  Prisma.TransactionClient,
  "mailBatch" | "mailBatchRecipient"
>;

export type ActionableBounceLeaf = {
  recipientId: string;
  userId: string;
  emailNormalized: string;
  taskId: string | null;
};

export async function findActionableBounceLeaves(
  client: MailBatchQueryClient,
  batchId: string
): Promise<{
  rootBatchId: string;
  leaves: ActionableBounceLeaf[];
}> {
  const requested = await client.mailBatch.findUnique({
    where: { id: batchId },
    select: { id: true, retryRootBatchId: true }
  });
  if (!requested) {
    throw new MailBatchNotFoundError();
  }
  const rootBatchId = requested.retryRootBatchId ?? requested.id;
  const batches = await client.mailBatch.findMany({
    where: {
      OR: [
        { id: rootBatchId },
        { retryRootBatchId: rootBatchId }
      ]
    },
    select: { id: true }
  });
  const recipients = await client.mailBatchRecipient.findMany({
    where: { batchId: { in: batches.map((batch) => batch.id) } },
    select: {
      id: true,
      batchId: true,
      userId: true,
      emailNormalized: true,
      taskId: true,
      status: true,
      retryOfRecipientId: true
    }
  });
  const retriedByParent = new Map(
    recipients
      .filter(
        (recipient) => recipient.retryOfRecipientId !== null
      )
      .map((recipient) => [
        recipient.retryOfRecipientId as string,
        recipient
      ])
  );
  const rootRecipients = recipients.filter(
    (recipient) => recipient.batchId === rootBatchId
  );
  const leaves = rootRecipients
    .map((recipient) => {
      let leaf = recipient;
      const visited = new Set<string>();
      while (
        !visited.has(leaf.id) &&
        retriedByParent.has(leaf.id)
      ) {
        visited.add(leaf.id);
        leaf = retriedByParent.get(leaf.id)!;
      }
      return leaf;
    })
    .filter((recipient) => recipient.status === "BOUNCED")
    .map((recipient) => ({
      recipientId: recipient.id,
      userId: recipient.userId,
      emailNormalized: recipient.emailNormalized,
      taskId: recipient.taskId
    }))
    .sort((left, right) =>
      left.emailNormalized.localeCompare(right.emailNormalized)
    );
  return { rootBatchId, leaves };
}

function batchWhere(
  viewer: MailBatchViewer
): Prisma.MailBatchWhereInput {
  return viewer.role === "OPERATOR"
    ? { createdById: viewer.id }
    : {};
}

function audienceLabel(input: {
  audienceMode: "USER" | "SEGMENT" | "ALL";
  segment: string | null;
}): string {
  if (input.audienceMode === "SEGMENT" && input.segment) {
    return `${input.segment} 组全员`;
  }
  if (input.audienceMode === "ALL") {
    return "全部用户";
  }
  return "指定用户";
}

const batchSummarySelect = {
  id: true,
  audienceMode: true,
  segment: true,
  subject: true,
  status: true,
  totalRecipients: true,
  pendingRecipients: true,
  sentRecipients: true,
  skippedRecipients: true,
  failedRecipients: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.MailBatchSelect;

function presentBatch<
  T extends {
    audienceMode: "USER" | "SEGMENT" | "ALL";
    segment: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }
>(batch: T) {
  return {
    ...batch,
    audienceLabel: audienceLabel(batch),
    startedAt: batch.startedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString()
  };
}

export async function listMailBatches(
  viewer: MailBatchViewer
) {
  const batches = await prisma.mailBatch.findMany({
    where: batchWhere(viewer),
    orderBy: { createdAt: "desc" },
    take: 30,
    select: batchSummarySelect
  });
  return batches.map(presentBatch);
}

export async function getMailBatchSummary(
  viewer: MailBatchViewer,
  batchId: string
) {
  const batch = await prisma.mailBatch.findFirst({
    where: {
      id: batchId,
      ...batchWhere(viewer)
    },
    select: {
      ...batchSummarySelect,
      mailbox: { select: { emailAddress: true } }
    }
  });
  if (!batch) {
    throw new MailBatchNotFoundError();
  }
  const grouped = await prisma.mailBatchRecipient.groupBy({
    by: ["reasonCode"],
    where: {
      batchId,
      reasonCode: { not: null }
    },
    _count: { _all: true },
    orderBy: { reasonCode: "asc" }
  });
  const { leaves } = await findActionableBounceLeaves(
    prisma,
    batchId
  );
  const actionableBounceEmails = leaves.map(
    (leaf) => leaf.emailNormalized
  );
  const { mailbox, ...safeBatch } = batch;
  return {
    ...presentBatch(safeBatch),
    senderMailbox: mailbox.emailAddress,
    actionableBounceCount: actionableBounceEmails.length,
    actionableBounceEmails,
    actionableBounceList: actionableBounceEmails.join(";"),
    reasons: grouped
      .filter(
        (row): row is typeof row & { reasonCode: string } =>
          Boolean(row.reasonCode)
      )
      .map((row) => ({
        code: row.reasonCode,
        count: row._count._all
      }))
  };
}
