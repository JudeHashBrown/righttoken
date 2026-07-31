import {
  Prisma,
  type Member,
  type SegmentCode,
  type TaskOrigin,
  type TaskPriority,
  type TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type Viewer = Pick<Member, "id" | "role">;

export type TaskView =
  | "mine"
  | "pool"
  | "waiting"
  | "overdue"
  | "all";

export type TaskFilters = {
  view?: TaskView;
  search?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  origins?: TaskOrigin[];
  segments?: SegmentCode[];
  countryCode?: string;
  source?: string;
  assigneeId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  dueBefore?: Date;
  cursor?: string | null;
  pageSize?: number;
  now?: Date;
};

const taskListSelect = {
  id: true,
  title: true,
  reason: true,
  origin: true,
  priority: true,
  status: true,
  assigneeId: true,
  assignmentReason: true,
  dueAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      externalUserId: true,
      email: true,
      displayName: true,
      currentSegment: true,
      countryCode: true,
      region: true
    }
  },
  assignee: {
    select: {
      id: true,
      displayName: true
    }
  }
} satisfies Prisma.RecallTaskSelect;

export type TaskListItem = Prisma.RecallTaskGetPayload<{
  select: typeof taskListSelect;
}>;

export type TaskPage = {
  items: TaskListItem[];
  nextCursor: string | null;
};

function pageSize(value?: number): number {
  return Math.min(100, Math.max(1, value ?? 30));
}

function operatorTaskScope(viewer: Viewer): Prisma.RecallTaskWhereInput {
  if (viewer.role !== "OPERATOR") {
    return {};
  }
  return {
    OR: [
      { assigneeId: viewer.id },
      { assigneeId: null, status: "UNASSIGNED" }
    ]
  };
}

function viewScope(
  viewer: Viewer,
  filters: TaskFilters
): Prisma.RecallTaskWhereInput {
  const now = filters.now ?? new Date();
  switch (filters.view) {
    case "mine":
      return { assigneeId: viewer.id };
    case "pool":
      return { assigneeId: null, status: "UNASSIGNED" };
    case "waiting":
      return { status: "WAITING_USER" };
    case "overdue":
      return {
        dueAt: { lt: now },
        status: {
          in: [
            "UNASSIGNED",
            "TODO",
            "IN_PROGRESS",
            "WAITING_USER",
            "PAUSED"
          ]
        }
      };
    default:
      return {};
  }
}

function buildTaskWhere(
  viewer: Viewer,
  filters: TaskFilters
): Prisma.RecallTaskWhereInput {
  const search = filters.search?.trim();
  return {
    AND: [
      operatorTaskScope(viewer),
      viewScope(viewer, filters),
      filters.statuses?.length
        ? { status: { in: filters.statuses } }
        : {},
      filters.priorities?.length
        ? { priority: { in: filters.priorities } }
        : {},
      filters.origins?.length
        ? { origin: { in: filters.origins } }
        : {},
      filters.assigneeId
        ? { assigneeId: filters.assigneeId }
        : {},
      filters.dueFrom || filters.dueTo || filters.dueBefore
        ? {
            dueAt: {
              ...(filters.dueFrom ? { gte: filters.dueFrom } : {}),
              ...(filters.dueTo ? { lte: filters.dueTo } : {}),
              ...(filters.dueBefore
                ? { lt: filters.dueBefore }
                : {})
            }
          }
        : {},
      filters.segments?.length ||
      filters.countryCode ||
      filters.source
        ? {
            user: {
              ...(filters.segments?.length
                ? { currentSegment: { in: filters.segments } }
                : {}),
              ...(filters.countryCode
                ? { countryCode: filters.countryCode }
                : {}),
              ...(filters.source ? { source: filters.source } : {})
            }
          }
        : {},
      search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                reason: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                user: {
                  OR: [
                    {
                      externalUserId: {
                        contains: search,
                        mode: "insensitive"
                      }
                    },
                    {
                      email: {
                        contains: search,
                        mode: "insensitive"
                      }
                    },
                    {
                      displayName: {
                        contains: search,
                        mode: "insensitive"
                      }
                    }
                  ]
                }
              }
            ]
          }
        : {}
    ]
  };
}

export async function findTasks(
  viewer: Viewer,
  filters: TaskFilters = {}
): Promise<TaskPage> {
  const take = pageSize(filters.pageSize);
  const rows = await prisma.recallTask.findMany({
    where: buildTaskWhere(viewer, filters),
    orderBy: [
      { priority: "asc" },
      { dueAt: "asc" },
      { id: "asc" }
    ],
    take: take + 1,
    ...(filters.cursor
      ? {
          cursor: { id: filters.cursor },
          skip: 1
        }
      : {}),
    select: taskListSelect
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;

  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null
  };
}

export async function getTaskDetail(viewer: Viewer, taskId: string) {
  return prisma.recallTask.findFirst({
    where: {
      id: taskId,
      AND: [operatorTaskScope(viewer)]
    },
    include: {
      user: {
        select: {
          id: true,
          externalUserId: true,
          email: true,
          displayName: true,
          currentSegment: true,
          countryCode: true,
          region: true,
          paymentStatus: true,
          totalPaidMinor: true,
          balanceMinor: true,
          lastCallAt: true,
          anomalyActive: true,
          anomalyErrorPhase: true,
          anomalyErrorType: true,
          anomalyErrorMessage: true,
          anomalyErrorOwner: true,
          anomalyStatusCode: true,
          anomalyModel: true,
          anomalyPlatform: true,
          anomalyRequestCount: true,
          anomalyFailureCount: true,
          anomalyConsecutiveFailures: true,
          anomalyLastOccurredAt: true,
          ownerId: true
        }
      },
      assignee: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      },
      activities: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }
    }
  });
}
