import "server-only";

import type {
  MemberRole,
  TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";
import type {
  MailWorkspaceFilter
} from "@/modules/mail/workspace-filter";
import { mailboxSyncStatusText } from "@/modules/mail/sync-error";
import {
  listMailBatches
} from "@/modules/mail/mail-batch-query";

const openStatuses: TaskStatus[] = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
];

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

function messageScope(viewer: WorkspaceViewer) {
  return viewer.role === "OPERATOR"
    ? {
        OR: [
          { user: { ownerId: viewer.id } },
          { user: { ownerId: null } },
          { task: { assigneeId: viewer.id } },
          { task: { assigneeId: null } },
          { userId: null, taskId: null }
        ]
      }
    : {};
}

function threadScope(
  viewer: WorkspaceViewer,
  pending: boolean
) {
  return {
    user: {
      ...userScope(viewer),
      ...(pending
        ? {
            tasks: {
              some: {
                ...taskScope(viewer),
                origin: "EMAIL_REPLY" as const,
                status: { in: openStatuses }
              }
            }
          }
        : {})
    },
    messages: {
      some: { direction: "INBOUND" as const }
    }
  };
}

function iso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

export type MailWorkspaceData = Awaited<
  ReturnType<typeof getMailWorkspaceData>
>;

export async function getMailWorkspaceData(
  viewer: WorkspaceViewer,
  filter: MailWorkspaceFilter
) {
  const users = userScope(viewer);
  const messages = messageScope(viewer);
  const [
    replyTasks,
    openReplyTasks,
    unsubscribedUsers,
    mailboxes,
    unmatchedMessages,
    draftMessages,
    sentMessages,
    failedMessages,
    templates,
    mailBatches
  ] = await Promise.all([
    prisma.mailThread.count({
      where: threadScope(viewer, false)
    }),
    prisma.mailThread.count({
      where: threadScope(viewer, true)
    }),
    prisma.userProfile.count({
      where: {
        ...users,
        sourceDeletedAt: null,
        unsubscribedAt: { not: null }
      }
    }),
    prisma.mailbox.findMany({
      where: configuredMailboxWhere,
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
        ...messages,
        direction: "INBOUND",
        status: "UNMATCHED"
      }
    }),
    prisma.mailMessage.count({
      where: {
        ...messages,
        direction: "OUTBOUND",
        status: "DRAFT"
      }
    }),
    prisma.mailMessage.count({
      where: {
        ...messages,
        direction: "OUTBOUND",
        status: "SENT"
      }
    }),
    prisma.mailMessage.count({
      where: {
        ...messages,
        direction: "OUTBOUND",
        status: "FAILED"
      }
    }),
    prisma.mailTemplate.findMany({
      where: {
        archivedAt: null
      },
      distinct: ["key"],
      orderBy: [{ key: "asc" }, { version: "desc" }],
      select: {
        id: true,
        key: true,
        version: true,
        name: true,
        locale: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        active: true,
        assets: {
          orderBy: { sortOrder: "asc" },
          select: {
            disposition: true,
            cid: true,
            sortOrder: true,
            asset: {
              select: {
                id: true,
                fileName: true,
                contentType: true,
                byteSize: true,
                width: true,
                height: true
              }
            }
          }
        }
      }
    }),
    listMailBatches(viewer)
  ]);
  const templateSummaries = templates.map((template) => ({
    ...template,
    bodyHtml:
      template.bodyHtml ??
      `<p>${template.bodyText
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")}</p>`,
    assets: template.assets.map((usage) => ({
      ...usage.asset,
      disposition: usage.disposition,
      cid: usage.cid,
      sortOrder: usage.sortOrder,
      previewUrl: `/api/mail/assets/${usage.asset.id}`
    }))
  }));

  const items = await listItems(viewer, filter);
  const selected = filter.selectedId
    ? await selectedItem(viewer, filter)
    : null;
  const assignableUsers =
    filter.view === "unmatched"
      ? await prisma.userProfile.findMany({
          where: {
            ...users,
            sourceDeletedAt: null
          },
          orderBy: { registeredAt: "desc" },
          take: 100,
          select: {
            id: true,
            externalUserId: true,
            displayName: true,
            email: true,
            currentSegment: true
          }
        })
      : [];

  return {
    filter,
    stats: {
      replyTasks,
      openReplyTasks,
      unsubscribedUsers,
      enabledMailboxes: mailboxes.filter((mailbox) => mailbox.enabled)
        .length,
      totalMailboxes: mailboxes.length,
      unmatchedMessages,
      draftMessages,
      sentMessages,
      failedMessages,
      lastSyncRan: mailboxes.some(
        (mailbox) => mailbox.lastSyncedAt
      )
    },
    items,
    selected,
    mailBatches,
    templates: templateSummaries,
    mailboxes: mailboxes.map((mailbox) => ({
      ...mailbox,
      lastSyncedAt: iso(mailbox.lastSyncedAt),
      lastSuccessAt: iso(mailbox.lastSuccessAt)
    })),
    assignableUsers,
    permissions: {
      canArchiveTemplates: viewer.role === "PRIMARY_ADMIN"
    }
  };
}

async function listItems(
  viewer: WorkspaceViewer,
  filter: MailWorkspaceFilter
) {
  const users = userScope(viewer);
  const messages = messageScope(viewer);
  if (filter.view === "unsubscribed") {
    const rows = await prisma.userProfile.findMany({
      where: {
        ...users,
        sourceDeletedAt: null,
        unsubscribedAt: { not: null }
      },
      orderBy: { unsubscribedAt: "desc" },
      take: 100,
      select: {
        id: true,
        displayName: true,
        externalUserId: true,
        email: true,
        unsubscribedAt: true
      }
    });
    return rows.map((user) => ({
      id: user.id,
      kind: "USER" as const,
      title: user.displayName || user.externalUserId,
      subtitle: user.email,
      preview: "已退订，系统禁止继续发送运营邮件",
      occurredAt: iso(user.unsubscribedAt),
      status: "已退订"
    }));
  }
  if (filter.view === "mailboxes" || filter.view === "sync") {
    const rows = await prisma.mailbox.findMany({
      where: configuredMailboxWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        emailAddress: true,
        enabled: true,
        lastSyncedAt: true,
        lastErrorCode: true
      }
    });
    return rows.map((mailbox) => ({
      id: mailbox.id,
      kind: "MAILBOX" as const,
      title: mailbox.name,
      subtitle: mailbox.emailAddress,
      preview:
        mailboxSyncStatusText({
          lastErrorCode: mailbox.lastErrorCode,
          lastSyncedAt: mailbox.lastSyncedAt
        }),
      occurredAt: iso(mailbox.lastSyncedAt),
      status: mailbox.enabled ? "已启用" : "未启用"
    }));
  }
  if (
    filter.view === "unmatched" ||
    filter.view === "drafts" ||
    filter.view === "sent" ||
    filter.view === "failed"
  ) {
    const status =
      filter.view === "unmatched"
        ? "UNMATCHED"
        : filter.view === "drafts"
          ? "DRAFT"
          : filter.view === "sent"
            ? "SENT"
            : "FAILED";
    const rows = await prisma.mailMessage.findMany({
      where: {
        ...messages,
        status,
        ...(filter.view === "unmatched"
          ? { direction: "INBOUND" as const }
          : { direction: "OUTBOUND" as const })
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        threadId: true,
        subject: true,
        bodyText: true,
        fromAddress: true,
        toAddresses: true,
        status: true,
        createdAt: true,
        receivedAt: true,
        sentAt: true,
        user: {
          select: {
            displayName: true,
            externalUserId: true,
            email: true
          }
        }
      }
    });
    return rows.map((message) => ({
      id:
        filter.view === "sent"
          ? message.id
          : message.threadId ?? message.id,
      messageId: message.id,
      kind:
        filter.view !== "sent" && message.threadId !== null
          ? ("THREAD" as const)
          : ("MESSAGE" as const),
      title: message.subject,
      subtitle:
        filter.view === "sent"
          ? message.toAddresses.join("、")
          : message.user?.displayName ||
            message.user?.externalUserId ||
            message.fromAddress,
      preview: message.bodyText.slice(0, 160),
      occurredAt: iso(
        message.receivedAt ?? message.sentAt ?? message.createdAt
      ),
      status:
        filter.view === "sent" ? "已发送" : message.status
    }));
  }

  const pending = filter.view === "pending";
  const rows = await prisma.mailThread.findMany({
    where: threadScope(viewer, pending),
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      updatedAt: true,
      user: {
        select: {
          displayName: true,
          externalUserId: true,
          email: true
        }
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          bodyText: true,
          status: true,
          receivedAt: true,
          sentAt: true,
          createdAt: true
        }
      }
    }
  });
  return rows.map((thread) => {
    const latest = thread.messages[0];
    return {
      id: thread.id,
      kind: "THREAD" as const,
      title: thread.subject,
      subtitle:
        thread.user.displayName ||
        thread.user.externalUserId ||
        thread.user.email,
      preview: latest?.bodyText.slice(0, 160) ?? "",
      occurredAt: iso(
        latest?.receivedAt ??
          latest?.sentAt ??
          latest?.createdAt ??
          thread.updatedAt
      ),
      status: latest?.status ?? "RECEIVED"
    };
  });
}

async function selectedItem(
  viewer: WorkspaceViewer,
  filter: MailWorkspaceFilter
) {
  if (
    (filter.view === "mailboxes" ||
      filter.view === "sync") &&
    filter.selectedId
  ) {
    const mailbox = await prisma.mailbox.findFirst({
      where: {
        id: filter.selectedId,
        ...configuredMailboxWhere
      },
      select: {
        id: true,
        name: true,
        emailAddress: true,
        enabled: true,
        lastTestedAt: true,
        lastSyncedAt: true,
        lastErrorCode: true
      }
    });
    return mailbox
      ? {
          kind: "mailbox" as const,
          mailbox: {
            id: mailbox.id,
            name: mailbox.name,
            emailAddress: mailbox.emailAddress,
            enabled: mailbox.enabled,
            statusText: mailboxSyncStatusText({
              lastErrorCode: mailbox.lastErrorCode,
              lastSyncedAt: mailbox.lastSyncedAt
            }),
            lastTestedAt: iso(mailbox.lastTestedAt),
            lastSyncedAt: iso(mailbox.lastSyncedAt)
          }
        }
      : null;
  }
  if (filter.view === "unmatched" && filter.selectedId) {
    const message = await prisma.mailMessage.findFirst({
      where: {
        id: filter.selectedId,
        ...messageScope(viewer),
        direction: "INBOUND",
        status: "UNMATCHED"
      },
      select: {
        id: true,
        mailboxId: true,
        fromAddress: true,
        toAddresses: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        externalImagesBlocked: true,
        assets: {
          orderBy: { sortOrder: "asc" },
          select: {
            disposition: true,
            cid: true,
            sortOrder: true,
            asset: {
              select: {
                id: true,
                fileName: true,
                contentType: true,
                byteSize: true,
                width: true,
                height: true
              }
            }
          }
        },
        receivedAt: true,
        createdAt: true
      }
    });
    return message
      ? {
          kind: "unmatched" as const,
          message: {
            ...message,
            assets: message.assets.map((usage) => ({
              ...usage.asset,
              disposition: usage.disposition,
              cid: usage.cid,
              sortOrder: usage.sortOrder,
              previewUrl: `/api/mail/assets/${usage.asset.id}`
            })),
            receivedAt: iso(message.receivedAt),
            createdAt: message.createdAt.toISOString()
          }
        }
      : null;
  }
  if (filter.view === "sent" && filter.selectedId) {
    const message = await prisma.mailMessage.findFirst({
      where: {
        id: filter.selectedId,
        ...messageScope(viewer),
        direction: "OUTBOUND",
        status: "SENT"
      },
      select: {
        id: true,
        fromAddress: true,
        toAddresses: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        externalImagesBlocked: true,
        assets: {
          orderBy: { sortOrder: "asc" },
          select: {
            disposition: true,
            cid: true,
            sortOrder: true,
            asset: {
              select: {
                id: true,
                fileName: true,
                contentType: true,
                byteSize: true,
                width: true,
                height: true
              }
            }
          }
        },
        sentAt: true,
        createdAt: true
      }
    });
    return message
      ? {
          kind: "message" as const,
          message: {
            ...message,
            assets: message.assets.map((usage) => ({
              ...usage.asset,
              disposition: usage.disposition,
              cid: usage.cid,
              sortOrder: usage.sortOrder,
              previewUrl: `/api/mail/assets/${usage.asset.id}`
            })),
            sentAt: iso(message.sentAt),
            createdAt: message.createdAt.toISOString()
          }
        }
      : null;
  }
  if (!filter.selectedId) {
    return null;
  }
  const thread = await prisma.mailThread.findFirst({
    where: {
      id: filter.selectedId,
      user: userScope(viewer)
    },
    select: {
      id: true,
      subject: true,
      user: {
        select: {
          id: true,
          externalUserId: true,
          displayName: true,
          email: true,
          currentSegment: true,
          countryCode: true,
          region: true,
          owner: {
            select: {
              id: true,
              displayName: true
            }
          },
          unsubscribedAt: true,
          pausedAt: true,
          tasks: {
            where: {
              ...taskScope(viewer),
              origin: "EMAIL_REPLY",
              status: { in: openStatuses }
            },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              title: true,
              status: true,
              assigneeId: true
            }
          }
        }
      },
      mailbox: {
        select: {
          id: true,
          name: true,
          emailAddress: true,
          enabled: true
        }
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          status: true,
          fromAddress: true,
          toAddresses: true,
          subject: true,
          bodyText: true,
          bodyHtml: true,
          externalImagesBlocked: true,
          assets: {
            orderBy: { sortOrder: "asc" },
            select: {
              disposition: true,
              cid: true,
              sortOrder: true,
              asset: {
                select: {
                  id: true,
                  fileName: true,
                  contentType: true,
                  byteSize: true,
                  width: true,
                  height: true
                }
              }
            }
          },
          sentAt: true,
          receivedAt: true,
          createdAt: true
        }
      }
    }
  });
  if (!thread) {
    return null;
  }
  return {
    kind: "thread" as const,
    thread: {
      id: thread.id,
      subject: thread.subject,
      user: {
        ...thread.user,
        unsubscribedAt: iso(thread.user.unsubscribedAt),
        pausedAt: iso(thread.user.pausedAt),
        task: thread.user.tasks[0] ?? null,
        tasks: undefined
      },
      mailbox: thread.mailbox,
      messages: thread.messages.map((message) => ({
        ...message,
        assets: message.assets.map((usage) => ({
          ...usage.asset,
          disposition: usage.disposition,
          cid: usage.cid,
          sortOrder: usage.sortOrder,
          previewUrl: `/api/mail/assets/${usage.asset.id}`
        })),
        sentAt: iso(message.sentAt),
        receivedAt: iso(message.receivedAt),
        createdAt: message.createdAt.toISOString()
      }))
    }
  };
}
