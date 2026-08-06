import type {
  MemberRole,
  Prisma
} from "@/generated/prisma/client";

const RECENT_USER_WINDOW_MS = 72 * 60 * 60 * 1000;
export const DASHBOARD_FOCUS_PAGE_SIZE = 100;

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

export function dashboardFocusOrDefault(value: unknown): DashboardFocus {
  return parseDashboardFocus(value) ?? "recent-anomaly";
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

type FocusSortable = {
  id: string;
  registeredAt: Date;
  anomalyAt: Date | null;
};

export function limitDashboardFocusUsers<T extends FocusSortable>(
  rows: T[],
  focus: DashboardFocus
): T[] {
  return [...rows]
    .sort((left, right) => {
      const leftTime =
        focus === "recent-unpaid"
          ? left.registeredAt.getTime()
          : (left.anomalyAt?.getTime() ?? 0);
      const rightTime =
        focus === "recent-unpaid"
          ? right.registeredAt.getTime()
          : (right.anomalyAt?.getTime() ?? 0);
      return rightTime - leftTime || right.id.localeCompare(left.id);
    })
    .slice(0, DASHBOARD_FOCUS_PAGE_SIZE);
}
