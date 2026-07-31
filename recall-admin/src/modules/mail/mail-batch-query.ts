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
    select: batchSummarySelect
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
  return {
    ...presentBatch(batch),
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
