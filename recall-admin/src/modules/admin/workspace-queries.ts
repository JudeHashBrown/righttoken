import "server-only";

import type {
  MemberRole,
  SegmentCode,
  TaskPriority,
  TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";
import {
  defaultSegmentRuleSet
} from "@/modules/segmentation/default-rule-set";
import {
  parseSegmentRuleConfig
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
  const messageScope =
    viewer.role === "OPERATOR"
      ? {
          OR: [
            { user: { ownerId: viewer.id } },
            { task: { assigneeId: viewer.id } }
          ]
        }
      : {};
  const [
    replyTasks,
    openReplyTasks,
    unsubscribedUsers,
    recentTasks,
    mailboxes,
    unmatchedMessages,
    draftMessages,
    failedMessages,
    recentMessages,
    eligibleTasks
  ] =
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
        where: {
          ...users,
          sourceDeletedAt: null,
          unsubscribedAt: { not: null }
        }
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
      }),
      prisma.mailbox.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          emailAddress: true,
          enabled: true,
          lastSyncedAt: true,
          lastSuccessAt: true,
          lastErrorCode: true
        }
      }),
      prisma.mailMessage.count({
        where: {
          ...messageScope,
          direction: "INBOUND",
          status: "UNMATCHED"
        }
      }),
      prisma.mailMessage.count({
        where: {
          ...messageScope,
          direction: "OUTBOUND",
          status: "DRAFT"
        }
      }),
      prisma.mailMessage.count({
        where: {
          ...messageScope,
          direction: "OUTBOUND",
          status: "FAILED"
        }
      }),
      prisma.mailMessage.findMany({
        where: messageScope,
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          direction: true,
          status: true,
          subject: true,
          fromAddress: true,
          toAddresses: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true,
          user: {
            select: {
              displayName: true,
              externalUserId: true
            }
          }
        }
      }),
      prisma.recallTask.findMany({
        where: {
          ...tasks,
          status: { in: openStatuses },
          user: { pausedAt: null }
        },
        orderBy: [{ priority: "asc" }, { dueAt: "asc" }],
        take: 100,
        select: {
          id: true,
          title: true,
          user: {
            select: {
              displayName: true,
              externalUserId: true,
              email: true,
              unsubscribedAt: true
            }
          }
        }
      })
    ]);

  return {
    replyTasks,
    openReplyTasks,
    unsubscribedUsers,
    recentTasks,
    mailboxes,
    unmatchedMessages,
    draftMessages,
    failedMessages,
    recentMessages,
    eligibleTasks
  };
}

export async function getSegmentWorkspaceOverview() {
  const [activeRule, groupedUsers, recentChanges, latestRun] =
    await Promise.all([
    prisma.automationRuleVersion.findFirst({
      where: { kind: "segmentation", active: true },
      orderBy: { version: "desc" }
    }),
    prisma.userProfile.groupBy({
      by: ["currentSegment"],
      where: { sourceDeletedAt: null },
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
    }),
    prisma.segmentRecalculationRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalUsers: true,
        processedUsers: true,
        succeededUsers: true,
        failedUsers: true,
        createdAt: true,
        completedAt: true
      }
    })
  ]);
  const publisher = activeRule
    ? await prisma.member.findUnique({
        where: { id: activeRule.createdById },
        select: { displayName: true }
      })
    : null;
  const counts = new Map(
    groupedUsers.map((row) => [
      row.currentSegment,
      row._count._all
    ])
  );

  return {
    version: activeRule?.version ?? 1,
    ruleSet: activeRule
      ? parseSegmentRuleConfig(activeRule.config)
      : structuredClone(defaultSegmentRuleSet),
    publishedAt: activeRule?.createdAt ?? null,
    publishedBy: publisher?.displayName ?? null,
    latestRun,
    distribution: segments.map((segment) => ({
      segment,
      count: counts.get(segment) ?? 0
    })),
    recentChanges
  };
}

export async function getAssignmentWorkspaceOverview() {
  const [rules, locationRules, members, publicPoolTasks] =
    await Promise.all([
    prisma.assignmentRule.findMany({
      orderBy: { priority: "asc" }
    }),
    prisma.locationAttributionRule.findMany({
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
    locationRules,
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
      wecomUserId: true,
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
    userRows,
    openTasks,
    completedTasks,
    overdueTasks,
    audits
  ] = await Promise.all([
    prisma.userProfile.findMany({
      where: { ...usersScope, sourceDeletedAt: null },
      select: {
        externalUserId: true,
        firstPaidAt: true,
        lastCallAt: true
      }
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
  const liveFacts = await getProductionRightTokenUserFactsByIds(
    userRows.map((user) => user.externalUserId)
  );
  const users = userRows.length;
  const paidUsers = userRows.filter(
    (user) =>
      (liveFacts.get(user.externalUserId)?.firstPaidAt ??
        user.firstPaidAt) !== null
  ).length;
  const activeUsers = userRows.filter((user) => {
    const lastCallAt =
      liveFacts.get(user.externalUserId)?.lastCallAt ??
      user.lastCallAt;
    return lastCallAt !== null && lastCallAt >= sevenDaysAgo;
  }).length;

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

  const [mailboxes, integrationCredentials] = await Promise.all([
    prisma.mailbox.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        emailAddress: true,
        enabled: true,
        lastTestedAt: true,
        lastSuccessAt: true,
        lastErrorCode: true,
        lastSyncedAt: true
      }
    }),
    prisma.integrationCredential.findMany({
      where: {
        kind: {
          in: [
            "WECOM_APP",
            "WECOM_ROBOT"
          ]
        }
      },
      select: { kind: true, enabled: true }
    })
  ]);
  const configuredCredentials = new Set(
    integrationCredentials
      .filter((credential) => credential.enabled)
      .map((credential) => credential.kind)
  );

  return {
    databaseReady,
    mailboxes,
    integrations: [
      {
        name: "Namecheap 客服邮箱",
        configured:
          mailboxes.length > 0 ||
          Boolean(
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
        name: "企业微信应用",
        configured: configuredCredentials.has("WECOM_APP")
      },
      {
        name: "企微群机器人",
        configured:
          configuredCredentials.has("WECOM_ROBOT") ||
          Boolean(process.env.WECOM_WEBHOOK_URL)
      }
    ]
  };
}
