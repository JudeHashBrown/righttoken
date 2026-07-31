import type {
  MemberRole,
  Prisma,
  SegmentCode
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type MailAudienceViewer = {
  id: string;
  role: MemberRole;
};

export type MailBatchAudience =
  | { mode: "SEGMENT"; segment: SegmentCode }
  | { mode: "ALL" };

type MailAudienceDatabase = Pick<
  Prisma.TransactionClient,
  "userProfile" | "suppressionEntry"
>;

export type MailAudienceUser = {
  id: string;
  email: string;
  emailNormalized: string;
  unsubscribedAt: Date | null;
  pausedAt: Date | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function mailAudienceUserWhere(
  viewer: MailAudienceViewer,
  audience: MailBatchAudience
): Prisma.UserProfileWhereInput {
  return {
    sourceDeletedAt: null,
    ...(audience.mode === "SEGMENT"
      ? { currentSegment: audience.segment }
      : {}),
    ...(viewer.role === "OPERATOR"
      ? {
          OR: [
            { ownerId: viewer.id },
            { ownerId: null }
          ]
        }
      : {})
  };
}

export async function findMailAudienceUsers(
  database: MailAudienceDatabase,
  viewer: MailAudienceViewer,
  audience: MailBatchAudience
): Promise<MailAudienceUser[]> {
  return database.userProfile.findMany({
    where: mailAudienceUserWhere(viewer, audience),
    orderBy: { id: "asc" },
    select: {
      id: true,
      email: true,
      emailNormalized: true,
      unsubscribedAt: true,
      pausedAt: true
    }
  });
}

export async function previewMailAudience(
  viewer: MailAudienceViewer,
  audience: MailBatchAudience
): Promise<{
  label: string;
  total: number;
  estimatedSkipped: number;
}> {
  const users = await findMailAudienceUsers(
    prisma,
    viewer,
    audience
  );
  const normalized = users
    .map((user) => user.emailNormalized.trim().toLowerCase())
    .filter(Boolean);
  const suppressed = normalized.length
    ? await prisma.suppressionEntry.findMany({
        where: {
          emailNormalized: { in: [...new Set(normalized)] }
        },
        select: { emailNormalized: true }
      })
    : [];
  const suppressedEmails = new Set(
    suppressed.map((entry) => entry.emailNormalized)
  );
  const seen = new Set<string>();
  let estimatedSkipped = 0;

  for (const user of users) {
    const email = user.emailNormalized.trim().toLowerCase();
    const duplicate = seen.has(email);
    if (email) {
      seen.add(email);
    }
    if (
      !emailPattern.test(email) ||
      user.unsubscribedAt ||
      user.pausedAt ||
      suppressedEmails.has(email) ||
      duplicate
    ) {
      estimatedSkipped += 1;
    }
  }

  return {
    label:
      audience.mode === "SEGMENT"
        ? `${audience.segment} 组全员`
        : "全部用户",
    total: users.length,
    estimatedSkipped
  };
}
