import {
  Prisma,
  type Member,
  type SegmentCode
} from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";

type Viewer = Pick<Member, "id" | "role">;

export type UserFilters = {
  search?: string;
  segments?: SegmentCode[];
  countryCode?: string;
  region?: string;
  ownerId?: string;
  source?: string;
  registeredFrom?: Date;
  registeredTo?: Date;
  cursor?: string | null;
  pageSize?: number;
};

const userListSelect = {
  id: true,
  externalUserId: true,
  email: true,
  displayName: true,
  registeredAt: true,
  countryCode: true,
  region: true,
  source: true,
  paymentStatus: true,
  totalPaidMinor: true,
  lastCallAt: true,
  successfulCallCount: true,
  balanceMinor: true,
  currentSegment: true,
  reasonLabel: true,
  ownerId: true,
  lastExternalEventAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      displayName: true
    }
  },
  tasks: {
    where: { status: { in: openTaskStatuses } },
    orderBy: [
      { priority: "asc" as const },
      { dueAt: "asc" as const },
      { id: "asc" as const }
    ],
    take: 1,
    select: {
      id: true,
      title: true,
      priority: true,
      status: true,
      dueAt: true
    }
  }
} satisfies Prisma.UserProfileSelect;

export type UserListItem = Prisma.UserProfileGetPayload<{
  select: typeof userListSelect;
}>;

export type UserPage = {
  items: UserListItem[];
  nextCursor: string | null;
};

function pageSize(value?: number): number {
  return Math.min(100, Math.max(1, value ?? 30));
}

function userScope(viewer: Viewer): Prisma.UserProfileWhereInput {
  return viewer.role === "OPERATOR" ? { ownerId: viewer.id } : {};
}

function authorizedUserScope(
  viewer: Viewer
): Prisma.UserProfileWhereInput {
  if (viewer.role !== "OPERATOR") {
    return {};
  }
  return {
    OR: [
      { ownerId: viewer.id },
      {
        tasks: {
          some: {
            OR: [
              { assigneeId: viewer.id },
              {
                assigneeId: null,
                status: "UNASSIGNED"
              }
            ]
          }
        }
      }
    ]
  };
}

function buildUserWhere(
  viewer: Viewer,
  filters: UserFilters
): Prisma.UserProfileWhereInput {
  const search = filters.search?.trim();
  return {
    AND: [
      userScope(viewer),
      filters.segments?.length
        ? { currentSegment: { in: filters.segments } }
        : {},
      filters.countryCode
        ? { countryCode: filters.countryCode }
        : {},
      filters.region
        ? {
            region: {
              contains: filters.region,
              mode: "insensitive"
            }
          }
        : {},
      filters.ownerId ? { ownerId: filters.ownerId } : {},
      filters.source ? { source: filters.source } : {},
      filters.registeredFrom || filters.registeredTo
        ? {
            registeredAt: {
              ...(filters.registeredFrom
                ? { gte: filters.registeredFrom }
                : {}),
              ...(filters.registeredTo
                ? { lte: filters.registeredTo }
                : {})
            }
          }
        : {},
      search
        ? {
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
              },
              {
                countryCode: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                region: {
                  contains: search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {}
    ]
  };
}

export async function findUsers(
  viewer: Viewer,
  filters: UserFilters = {}
): Promise<UserPage> {
  const take = pageSize(filters.pageSize);
  const rows = await prisma.userProfile.findMany({
    where: buildUserWhere(viewer, filters),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(filters.cursor
      ? {
          cursor: { id: filters.cursor },
          skip: 1
        }
      : {}),
    select: userListSelect
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;

  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null
  };
}

function decryptRegistrationIp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(Buffer.from(key, "base64")).decrypt(value);
}

export async function getUser360(viewer: Viewer, userId: string) {
  const user = await prisma.userProfile.findFirst({
    where: {
      id: userId,
      AND: [authorizedUserScope(viewer)]
    },
    include: {
      owner: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      },
      events: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 100
      },
      segmentHistory: {
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        take: 100
      },
      segmentOverrides: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20
      },
      tasks: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          assignee: {
            select: {
              id: true,
              displayName: true
            }
          }
        }
      },
      notes: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          author: {
            select: {
              id: true,
              displayName: true
            }
          }
        }
      }
    }
  });
  if (!user) {
    return null;
  }

  const { registrationIpEnc, registrationIpHash, ...safeUser } = user;
  void registrationIpHash;
  return {
    ...safeUser,
    registrationIp: decryptRegistrationIp(registrationIpEnc)
  };
}
