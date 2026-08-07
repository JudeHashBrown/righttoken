import type {
  MemberRole,
  Prisma,
  SegmentCode,
  TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  dashboardTaskWindows
} from "@/modules/reports/dashboard-task-windows";
import {
  DASHBOARD_FOCUS_PAGE_SIZE,
  effectiveAnomalyAt,
  limitDashboardFocusUsers,
  recentAnomalyOrderBy,
  recentAnomalyWhere,
  recentLowBalanceWhere,
  recentUnpaidWhere,
  type DashboardFocus
} from "@/modules/reports/dashboard-recent-users";

const OPEN_TASK_STATUSES: TaskStatus[] = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
];

const SEGMENTS: SegmentCode[] = ["A", "B", "C", "D", "E", "F", "G"];

export type DashboardFocusUser = {
  id: string;
  externalUserId: string;
  displayName: string | null;
  email: string;
  region: string | null;
  ownerName: string | null;
  registeredAt: Date;
  anomalyReason: string | null;
  anomalyAt: Date | null;
  balanceUsdMinor: number;
  lastCallAt: Date | null;
};

export type DashboardSnapshot = {
  metrics: {
    recentUnpaid: number;
    recentAnomalies: number;
    recentLowBalance: number;
    awaitingReply: number;
    unassignedUsers: number;
    sevenDayRecallRate: number | null;
  };
  focus: DashboardFocus;
  focusUsers: DashboardFocusUser[];
  segmentDistribution: Array<{
    segment: SegmentCode;
    count: number;
  }>;
};

type DashboardMember = {
  id: string;
  role: MemberRole;
};

export type DashboardNavigationMetrics = {
  dueToday: number;
  urgent: number;
  awaitingReply: number;
};

const focusUserSelect = {
  id: true,
  externalUserId: true,
  displayName: true,
  email: true,
  region: true,
  countryCode: true,
  registeredAt: true,
  balanceUsdMinor: true,
  lastCallAt: true,
  anomalyErrorMessage: true,
  anomalyErrorType: true,
  anomalyChangedAt: true,
  anomalyLastOccurredAt: true,
  owner: { select: { displayName: true } }
} satisfies Prisma.UserProfileSelect;

function shanghaiDayRange(now: Date): { start: Date; end: Date } {
  const offset = 8 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const start = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate()
    ) - offset
  );
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000)
  };
}

function taskScope(member: DashboardMember) {
  return member.role === "OPERATOR"
    ? {
        OR: [{ assigneeId: member.id }, { assigneeId: null }]
      }
    : {};
}

function userScope(member: DashboardMember) {
  return member.role === "OPERATOR"
    ? {
        OR: [{ ownerId: member.id }, { ownerId: null }]
      }
    : {};
}

export async function getDashboardNavigationMetrics(
  member: DashboardMember,
  now = new Date()
): Promise<DashboardNavigationMetrics> {
  const { start, end } = shanghaiDayRange(now);
  const { dueTodayCreatedAfter, urgentCreatedAfter } =
    dashboardTaskWindows(now);
  const openWhere = {
    ...taskScope(member),
    status: { in: OPEN_TASK_STATUSES }
  };

  const [dueToday, urgent, awaitingReply] = await Promise.all([
    prisma.recallTask.count({
      where: {
        ...openWhere,
        createdAt: { gte: dueTodayCreatedAfter },
        dueAt: { gte: start, lt: end }
      }
    }),
    prisma.recallTask.count({
      where: {
        ...openWhere,
        createdAt: { gte: urgentCreatedAfter },
        priority: "URGENT"
      }
    }),
    prisma.recallTask.count({
      where: {
        ...openWhere,
        origin: "EMAIL_REPLY"
      }
    })
  ]);

  return { dueToday, urgent, awaitingReply };
}

export async function getDashboardSnapshot(
  member: DashboardMember,
  now = new Date(),
  focus: DashboardFocus = "recent-anomaly"
): Promise<DashboardSnapshot> {
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  );
  const scopedTasks = taskScope(member);
  const openWhere = {
    ...scopedTasks,
    status: { in: OPEN_TASK_STATUSES }
  };

  const [
    awaitingReply,
    sevenDayTasks,
    sevenDayCompleted,
    segmentRows,
    unassignedUsers,
    recentUnpaid,
    recentAnomalies,
    recentLowBalance
  ] = await Promise.all([
    prisma.recallTask.count({
      where: {
        ...openWhere,
        origin: "EMAIL_REPLY"
      }
    }),
    prisma.recallTask.count({
      where: {
        ...scopedTasks,
        origin: "AUTOMATION",
        createdAt: { gte: sevenDaysAgo }
      }
    }),
    prisma.recallTask.count({
      where: {
        ...scopedTasks,
        origin: "AUTOMATION",
        status: "COMPLETED",
        completedAt: { gte: sevenDaysAgo }
      }
    }),
    prisma.userProfile.groupBy({
      by: ["currentSegment"],
      where: {
        ...userScope(member),
        sourceDeletedAt: null
      },
      _count: { _all: true }
    }),
    member.role === "OPERATOR"
      ? Promise.resolve(0)
      : prisma.userProfile.count({
          where: {
            sourceDeletedAt: null,
            ownerId: null
          }
        }),
    prisma.userProfile.count({
      where: recentUnpaidWhere(member, now)
    }),
    prisma.userProfile.count({
      where: recentAnomalyWhere(member, now)
    }),
    prisma.userProfile.count({
      where: recentLowBalanceWhere(member, now)
    })
  ]);

  const focusWhere =
    focus === "recent-unpaid"
      ? recentUnpaidWhere(member, now)
      : focus === "recent-low-balance"
        ? recentLowBalanceWhere(member, now)
        : recentAnomalyWhere(member, now);
  const focusRows =
    focus === "recent-unpaid"
      ? await prisma.userProfile.findMany({
          where: focusWhere,
          select: focusUserSelect,
          orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
          take: DASHBOARD_FOCUS_PAGE_SIZE
        })
      : focus === "recent-low-balance"
        ? await prisma.userProfile.findMany({
            where: focusWhere,
            select: focusUserSelect,
            orderBy: [{ lastCallAt: "desc" }, { id: "desc" }],
            take: DASHBOARD_FOCUS_PAGE_SIZE
          })
      : Array.from(
          new Map(
            (
              await Promise.all([
                prisma.userProfile.findMany({
                  where: focusWhere,
                  select: focusUserSelect,
                  orderBy: recentAnomalyOrderBy(
                    "anomalyLastOccurredAt"
                  ),
                  take: DASHBOARD_FOCUS_PAGE_SIZE
                }),
                prisma.userProfile.findMany({
                  where: focusWhere,
                  select: focusUserSelect,
                  orderBy: recentAnomalyOrderBy("anomalyChangedAt"),
                  take: DASHBOARD_FOCUS_PAGE_SIZE
                })
              ])
            )
              .flat()
              .map((row) => [row.id, row])
          ).values()
        );

  const focusUsers = limitDashboardFocusUsers(
    focusRows.map((row) => ({
      id: row.id,
      externalUserId: row.externalUserId,
      displayName: row.displayName,
      email: row.email,
      region: row.region ?? row.countryCode,
      ownerName: row.owner?.displayName ?? null,
      registeredAt: row.registeredAt,
      anomalyReason:
        row.anomalyErrorMessage ?? row.anomalyErrorType ?? null,
      anomalyAt: effectiveAnomalyAt(row),
      balanceUsdMinor: row.balanceUsdMinor,
      lastCallAt: row.lastCallAt
    })),
    focus
  );

  const segmentCounts = new Map(
    segmentRows.map((row) => [
      row.currentSegment,
      row._count._all
    ])
  );

  return {
    metrics: {
      recentUnpaid,
      recentAnomalies,
      recentLowBalance,
      awaitingReply,
      unassignedUsers,
      sevenDayRecallRate:
        sevenDayTasks === 0
          ? null
          : Number(
              ((sevenDayCompleted / sevenDayTasks) * 100).toFixed(1)
            )
    },
    focus,
    focusUsers,
    segmentDistribution: SEGMENTS.map((segment) => ({
      segment,
      count: segmentCounts.get(segment) ?? 0
    }))
  };
}
