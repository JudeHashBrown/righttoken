import type {
  MemberRole,
  Prisma
} from "@/generated/prisma/client";

const RECENT_USER_WINDOW_MS = 72 * 60 * 60 * 1000;

export type DashboardFocus = "recent-unpaid" | "recent-anomaly";

type DashboardMember = {
  id: string;
  role: MemberRole;
};

type AnomalyDates = {
  anomalyLastOccurredAt: Date | null;
  anomalyChangedAt: Date | null;
};

export function parseDashboardFocus(value: unknown): DashboardFocus | null {
  return value === "recent-unpaid" || value === "recent-anomaly"
    ? value
    : null;
}

export function recentUserCutoff(now: Date): Date {
  return new Date(now.getTime() - RECENT_USER_WINDOW_MS);
}

function operatorUserScope(
  member: DashboardMember
): Prisma.UserProfileWhereInput {
  return member.role === "OPERATOR"
    ? { OR: [{ ownerId: member.id }, { ownerId: null }] }
    : {};
}

export function recentUnpaidWhere(
  member: DashboardMember,
  now: Date
): Prisma.UserProfileWhereInput {
  return {
    ...operatorUserScope(member),
    sourceDeletedAt: null,
    currentSegment: "A",
    registeredAt: { gte: recentUserCutoff(now) }
  };
}

export function recentAnomalyWhere(
  member: DashboardMember,
  now: Date
): Prisma.UserProfileWhereInput {
  const recentTimestamp: Prisma.UserProfileWhereInput = {
    OR: [
      { anomalyLastOccurredAt: { gte: recentUserCutoff(now) } },
      { anomalyChangedAt: { gte: recentUserCutoff(now) } }
    ]
  };
  const scope = operatorUserScope(member);

  return {
    sourceDeletedAt: null,
    currentSegment: "F",
    anomalyActive: true,
    ...(member.role === "OPERATOR"
      ? { AND: [scope, recentTimestamp] }
      : recentTimestamp)
  };
}

export function effectiveAnomalyAt(row: AnomalyDates): Date | null {
  const timestamps = [
    row.anomalyLastOccurredAt,
    row.anomalyChangedAt
  ].filter((value): value is Date => value !== null);

  if (timestamps.length === 0) return null;
  return new Date(
    Math.max(...timestamps.map((timestamp) => timestamp.getTime()))
  );
}
