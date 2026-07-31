import type {
  MemberRole,
  SegmentCode,
  TaskPriority,
  TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

const OPEN_TASK_STATUSES: TaskStatus[] = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
];

const SEGMENTS: SegmentCode[] = ["A", "B", "C", "D", "E", "F", "G"];

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  URGENT: 0,
  IMPORTANT: 1,
  NORMAL: 2
};

export type DashboardTask = {
  id: string;
  userId: string;
  externalUserId: string;
  userLabel: string;
  segment: SegmentCode;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: Date;
  assigneeName: string | null;
  region: string | null;
};

export type DashboardSnapshot = {
  metrics: {
    dueToday: number;
    overdue: number;
    urgent: number;
    awaitingReply: number;
    unassignedUsers: number;
    sevenDayRecallRate: number | null;
  };
  priorityTasks: DashboardTask[];
  segmentDistribution: Array<{
    segment: SegmentCode;
    count: number;
  }>;
  channelHealth: Array<{
    channel: string;
    state: "healthy" | "warning" | "down";
    detail: string;
  }>;
  teamWorkload: Array<{
    memberId: string | null;
    name: string;
    openTasks: number;
    capacityPercent: number;
  }>;
};

type DashboardMember = {
  id: string;
  role: MemberRole;
};

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

export async function getDashboardSnapshot(
  member: DashboardMember,
  now = new Date()
): Promise<DashboardSnapshot> {
  const { start, end } = shanghaiDayRange(now);
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  );
  const scopedTasks = taskScope(member);
  const openWhere = {
    ...scopedTasks,
    status: { in: OPEN_TASK_STATUSES }
  };

  const [
    dueToday,
    overdue,
    urgent,
    awaitingReply,
    sevenDayTasks,
    sevenDayCompleted,
    taskRows,
    segmentRows,
    workloadRows,
    unassignedUsers
  ] = await Promise.all([
    prisma.recallTask.count({
      where: {
        ...openWhere,
        dueAt: { gte: start, lt: end }
      }
    }),
    prisma.recallTask.count({
      where: {
        ...openWhere,
        dueAt: { lt: now }
      }
    }),
    prisma.recallTask.count({
      where: {
        ...openWhere,
        priority: "URGENT"
      }
    }),
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
    prisma.recallTask.findMany({
      where: openWhere,
      include: {
        user: {
          select: {
            externalUserId: true,
            displayName: true,
            currentSegment: true,
            region: true,
            countryCode: true
          }
        },
        assignee: {
          select: { displayName: true }
        }
      },
      orderBy: { dueAt: "asc" },
      take: 40
    }),
    prisma.userProfile.groupBy({
      by: ["currentSegment"],
      where: {
        ...userScope(member),
        sourceDeletedAt: null
      },
      _count: { _all: true }
    }),
    prisma.recallTask.groupBy({
      by: ["assigneeId"],
      where: openWhere,
      _count: { _all: true }
    }),
    member.role === "OPERATOR"
      ? Promise.resolve(0)
      : prisma.userProfile.count({
          where: {
            sourceDeletedAt: null,
            ownerId: null
          }
        })
  ]);

  const liveFacts = await getProductionRightTokenUserFactsByIds(
    taskRows.map((task) => task.user.externalUserId)
  );
  const priorityTasks = taskRows
    .sort((left, right) => {
      const priorityDelta =
        PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      return priorityDelta || left.dueAt.getTime() - right.dueAt.getTime();
    })
    .slice(0, 8)
    .map((task) => {
      const facts = liveFacts.get(task.user.externalUserId);
      return {
        id: task.id,
        userId: task.userId,
        externalUserId: task.user.externalUserId,
        userLabel:
          facts?.displayName ??
          task.user.displayName ??
          `用户 ${task.user.externalUserId.slice(-6)}`,
        segment: task.user.currentSegment,
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueAt: task.dueAt,
        assigneeName: task.assignee?.displayName ?? null,
        region:
          task.user.region ?? task.user.countryCode ?? null
      };
    });

  const segmentCounts = new Map(
    segmentRows.map((row) => [
      row.currentSegment,
      row._count._all
    ])
  );

  const assigneeIds = workloadRows
    .map((row) => row.assigneeId)
    .filter((id): id is string => Boolean(id));
  const assignees = assigneeIds.length
    ? await prisma.member.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, displayName: true }
      })
    : [];
  const assigneeNames = new Map(
    assignees.map((assignee) => [
      assignee.id,
      assignee.displayName
    ])
  );
  const workloadTotal = Math.max(
    1,
    workloadRows.reduce((total, row) => total + row._count._all, 0)
  );

  return {
    metrics: {
      dueToday,
      overdue,
      urgent,
      awaitingReply,
      unassignedUsers,
      sevenDayRecallRate:
        sevenDayTasks === 0
          ? null
          : Number(
              ((sevenDayCompleted / sevenDayTasks) * 100).toFixed(1)
            )
    },
    priorityTasks,
    segmentDistribution: SEGMENTS.map((segment) => ({
      segment,
      count: segmentCounts.get(segment) ?? 0
    })),
    channelHealth: [
      {
        channel: "Namecheap 客服邮箱",
        state: "warning",
        detail: "等待配置"
      },
      {
        channel: "企业微信邮箱",
        state: "warning",
        detail: "等待配置"
      },
      {
        channel: "企微群机器人",
        state: "warning",
        detail: "等待配置"
      }
    ],
    teamWorkload: workloadRows
      .map((row) => ({
        memberId: row.assigneeId,
        name: row.assigneeId
          ? (assigneeNames.get(row.assigneeId) ?? "已停用成员")
          : "公共任务池",
        openTasks: row._count._all,
        capacityPercent: Math.round(
          (row._count._all / workloadTotal) * 100
        )
      }))
      .sort((left, right) => right.openTasks - left.openTasks)
  };
}
