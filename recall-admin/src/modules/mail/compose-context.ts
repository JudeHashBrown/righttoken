import "server-only";

import type {
  MemberRole,
  Prisma,
  TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type ComposeViewer = {
  id: string;
  role: MemberRole;
};

const openTaskStatuses: TaskStatus[] = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
];

function userScope(
  viewer: ComposeViewer
): Prisma.UserProfileWhereInput {
  return viewer.role === "OPERATOR"
    ? { OR: [{ ownerId: viewer.id }, { ownerId: null }] }
    : {};
}

function userSummary<
  T extends {
    id: string;
    externalUserId: string;
    displayName: string | null;
    email: string;
    unsubscribedAt: Date | null;
    pausedAt: Date | null;
  }
>(user: T) {
  return {
    id: user.id,
    label:
      user.displayName ||
      user.externalUserId ||
      user.email,
    email: user.email,
    suppressed: Boolean(user.unsubscribedAt),
    paused: Boolean(user.pausedAt)
  };
}

export async function findComposeUsers(
  viewer: ComposeViewer,
  query: string,
  selectedUserId?: string
) {
  const normalized = query.trim();
  const rows = await prisma.userProfile.findMany({
    where: {
      AND: [
        userScope(viewer),
        { sourceDeletedAt: null },
        selectedUserId
          ? { id: selectedUserId }
          : normalized
            ? {
                OR: [
                  {
                    email: {
                      contains: normalized,
                      mode: "insensitive"
                    }
                  },
                  {
                    displayName: {
                      contains: normalized,
                      mode: "insensitive"
                    }
                  },
                  {
                    externalUserId: {
                      contains: normalized,
                      mode: "insensitive"
                    }
                  }
                ]
              }
            : {}
      ]
    },
    orderBy: { registeredAt: "desc" },
    take: selectedUserId ? 1 : 20,
    select: {
      id: true,
      externalUserId: true,
      displayName: true,
      email: true,
      unsubscribedAt: true,
      pausedAt: true
    }
  });
  return rows.map(userSummary);
}

export async function getComposeContext(
  viewer: ComposeViewer,
  input: {
    userId?: string | null;
    taskId?: string | null;
  }
) {
  const selectedUser = input.userId
    ? (
        await findComposeUsers(
          viewer,
          "",
          input.userId
        )
      )[0] ?? null
    : null;
  if (input.userId && !selectedUser) {
    return { selectedUser: null, selectedTask: null };
  }
  if (!input.taskId) {
    return { selectedUser, selectedTask: null };
  }
  const task = await prisma.recallTask.findFirst({
    where: {
      id: input.taskId,
      status: { in: openTaskStatuses },
      ...(input.userId ? { userId: input.userId } : {}),
      ...(viewer.role === "OPERATOR"
        ? {
            OR: [
              { assigneeId: viewer.id },
              { user: { ownerId: viewer.id } },
              {
                assigneeId: null,
                status: "UNASSIGNED"
              }
            ]
          }
        : {})
    },
    select: {
      id: true,
      userId: true,
      title: true,
      status: true
    }
  });
  if (!task) {
    return { selectedUser, selectedTask: null };
  }
  const taskUser =
    selectedUser ??
    (
      await findComposeUsers(
        viewer,
        "",
        task.userId
      )
    )[0] ??
    null;
  return {
    selectedUser: taskUser,
    selectedTask: {
      id: task.id,
      userId: task.userId,
      title: task.title,
      status: task.status
    }
  };
}
