import "server-only";

import type {
  MemberRole,
  SegmentCode,
  TaskPriority,
  TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  defaultSegmentConfig,
  segmentConfigSchema
} from "@/modules/segmentation/rule-config";
import {
  defaultNotificationPolicy,
  notificationPolicySchema
} from "@/modules/notifications/policy-config";

const openStatuses: TaskStatus[] = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
];
const segments: SegmentCode[] = ["A", "B", "C", "D", "E", "F", "G"];
const priorities: TaskPriority[] = ["URGENT", "IMPORTANT", "NORMAL"];

type WorkspaceViewer = {
  id: string;
  role: MemberRole;
};

function taskScope(viewer: WorkspaceViewer) {
  return viewer.role === "OPERATOR"
    ? { OR: [{ assigneeId: viewer.id }, { assigneeId: null }] }
    : {};
}

function userScope(viewer: WorkspaceViewer) {
  return viewer.role === "OPERATOR"
    ? { OR: [{ ownerId: viewer.id }, { ownerId: null }] }
    : {};
}

export async function getMailWorkspaceOverview(
  viewer: WorkspaceViewer
) {
  const tasks = taskScope(viewer);
  const users = userScope(viewer);
  const [replyTasks, openReplyTasks, unsubscribedUsers, recentTasks] =
    await Promise.all([
      prisma.recallTask.count({
        where: { ...tasks, origin: "EMAIL_REPLY" }
      }),
      prisma.recallTask.count({
        where: {
          ...tasks,
          origin: "EMAIL_REPLY",
          status: { in: openStatuses }
        }
      }),
      prisma.userProfile.count({
        where: { ...users, unsubscribedAt: { not: null } }
      }),
      prisma.recallTask.findMany({
        where: { ...tasks, origin: "EMAIL_REPLY" },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          user: {
            select: {
              displayName: true,
              externalUserId: true,
              email: true
            }
          }
        }
      })
    ]);

  return {
    replyTasks,
    openReplyTasks,
    unsubscribedUsers,
    recentTasks
  };
}

export async function getSegmentWorkspaceOverview() {
  const [activeRule, groupedUsers, recentChanges] = await Promise.all([
    prisma.automationRuleVersion.findFirst({
      where: { kind: "segmentation", active: true },
      orderBy: { version: "desc" }
    }),
    prisma.userProfile.groupBy({
      by: ["currentSegment"],
      _count: { _all: true }
    }),
    prisma.segmentHistory.findMany({
      orderBy: { changedAt: "desc" },
      take: 8,
      select: {
        id: true,
        fromSegment: true,
        toSegment: true,
        reason: true,
        changedAt: true,
        user: {
          select: {
            externalUserId: true,
            displayName: true
          }
        }
      }
    })
  ]);
  const parsed = activeRule
    ? segmentConfigSchema.safeParse(activeRule.config)
    : null;
  const counts = new Map(
    groupedUsers.map((row) => [
      row.currentSegment,
      row._count._all
    ])
  );

  return {
    version: activeRule?.version ?? 1,
    config:
      parsed?.success === true ? parsed.data : defaultSegmentConfig,
    distribution: segments.map((segment) => ({
      segment,
      count: counts.get(segment) ?? 0
    })),
    recentChanges
  };
}

export async function getAssignmentWorkspaceOverview() {
  const [rules, members, publicPoolTasks] = await Promise.all([
    prisma.assignmentRule.findMany({
      orderBy: { priority: "asc" }
    }),
    prisma.member.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        displayName: true,
        role: true,
        _count: {
          select: {
            assignedTasks: {
              where: { status: { in: openStatuses } }
            }
          }
        }
      }
    }),
    prisma.recallTask.count({
      where: {
        assigneeId: null,
        status: { in: openStatuses }
      }
    })
  ]);
  const memberNames = new Map(
    members.map((member) => [member.id, member.displayName])
  );

  return {
    publicPoolTasks,
    members,
    rules: rules.map((rule) => ({
      ...rule,
      assigneeName: rule.assigneeId
        ? memberNames.get(rule.assigneeId) ?? "已停用成员"
        : rule.poolKey ?? "公共任务池",
      fallbackName: rule.fallbackAssigneeId
        ? memberNames.get(rule.fallbackAssigneeId) ?? "已停用成员"
        : "公共任务池"
    }))
  };
}

export async function getNotificationWorkspaceOverview() {
  const [grouped, activeRule] = await Promise.all([
    prisma.recallTask.groupBy({
      by: ["priority"],
      where: { status: { in: openStatuses } },
      _count: { _all: true }
    }),
    prisma.automationRuleVersion.findFirst({
      where: { kind: "notifications", active: true },
      orderBy: { version: "desc" }
    })
  ]);
  const counts = new Map(
    grouped.map((row) => [row.priority, row._count._all])
  );
  const parsed = activeRule
    ? notificationPolicySchema.safeParse(activeRule.config)
    : null;
  return {
    version: activeRule?.version ?? 1,
    config:
      parsed?.success === true
        ? parsed.data
        : defaultNotificationPolicy,
    counts: priorities.map((priority) => ({
      priority,
      openTasks: counts.get(priority) ?? 0
    }))
  };
}

export async function getMemberWorkspaceOverview() {
  return prisma.member.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      displayName: true,
      email: true,
      role: true,
      active: true,
      twoFactorOn: true,
      createdAt: true,
      _count: {
        select: {
          sessions: true,
          assignedTasks: {
            where: { status: { in: openStatuses } }
          },
          ownedUsers: true
        }
      }
    }
  });
}

export async function getReportWorkspaceOverview(
  viewer: WorkspaceViewer
) {
  const now = new Date();
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1_000
  );
  const tasks = taskScope(viewer);
  const usersScope = userScope(viewer);
  const [
    users,
    paidUsers,
    activeUsers,
    openTasks,
    completedTasks,
    overdueTasks,
    audits
  ] = await Promise.all([
    prisma.userProfile.count({ where: usersScope }),
    prisma.userProfile.count({
      where: { ...usersScope, firstPaidAt: { not: null } }
    }),
    prisma.userProfile.count({
      where: { ...usersScope, lastCallAt: { gte: sevenDaysAgo } }
    }),
    prisma.recallTask.count({
      where: { ...tasks, status: { in: openStatuses } }
    }),
    prisma.recallTask.count({
      where: { ...tasks, status: "COMPLETED" }
    }),
    prisma.recallTask.count({
      where: {
        ...tasks,
        status: { in: openStatuses },
        dueAt: { lt: now }
      }
    }),
    prisma.auditLog.findMany({
      where:
        viewer.role === "OPERATOR"
          ? { actorId: viewer.id }
          : undefined,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        actor: { select: { displayName: true } }
      }
    })
  ]);

  return {
    users,
    paidUsers,
    activeUsers,
    openTasks,
    completedTasks,
    overdueTasks,
    audits
  };
}

export async function getSettingsWorkspaceOverview() {
  let databaseReady = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  return {
    databaseReady,
    integrations: [
      {
        name: "RightToken 数据源",
        configured: Boolean(process.env.RIGHTTOKEN_INTERNAL_SECRET)
      },
      {
        name: "Namecheap 客服邮箱",
        configured: Boolean(
          process.env.SMTP_HOST &&
            process.env.SMTP_USER &&
            process.env.SMTP_PASSWORD
        )
      },
      {
        name: "企业微信邮箱",
        configured: Boolean(process.env.WECOM_MAIL_HOST)
      },
      {
        name: "企微群机器人",
        configured: Boolean(process.env.WECOM_WEBHOOK_URL)
      }
    ]
  };
}
