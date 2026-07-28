import {
  Prisma,
  type Member,
  type SegmentCode
} from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";
import { mergeManagedUser } from "@/modules/users/managed-user";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

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
  filters: UserFilters,
  liveSearchExternalIds: string[] | null = null
): Prisma.UserProfileWhereInput {
  const search = filters.search?.trim();
  return {
    AND: [
      { sourceDeletedAt: null },
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
              ...(liveSearchExternalIds === null
                ? [
                    {
                      email: {
                        contains: search,
                        mode: "insensitive" as const
                      }
                    },
                    {
                      displayName: {
                        contains: search,
                        mode: "insensitive" as const
                      }
                    }
                  ]
                : [
                    {
                      externalUserId: {
                        in: liveSearchExternalIds
                      }
                    }
                  ]),
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

async function findLiveSearchExternalIds(
  search: string | undefined
): Promise<string[] | null> {
  const normalized = search?.trim();
  if (
    !normalized ||
    process.env.RIGHTTOKEN_SOURCE_MODE !== "database"
  ) {
    return null;
  }
  if (normalized.length < 3) {
    throw new Error(
      "USER_SEARCH_REQUIRES_AT_LEAST_3_CHARACTERS"
    );
  }
  const pattern = `%${normalized}%`;
  const rows = await prisma.$queryRaw<Array<{ id: bigint | string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "public"."users"
      WHERE "deleted_at" IS NULL
        AND (
          "id"::text ILIKE ${pattern}
          OR "email" ILIKE ${pattern}
          OR COALESCE("username", '') ILIKE ${pattern}
        )
      LIMIT 501
    `
  );
  if (rows.length > 500) {
    throw new Error("USER_SEARCH_TOO_BROAD");
  }
  return rows.map((row) => String(row.id));
}

export async function findUsers(
  viewer: Viewer,
  filters: UserFilters = {}
): Promise<UserPage> {
  const take = pageSize(filters.pageSize);
  const databaseMode =
    process.env.RIGHTTOKEN_SOURCE_MODE === "database";
  const liveSearchExternalIds =
    await findLiveSearchExternalIds(filters.search);
  const collected: UserListItem[] = [];
  let cursor = filters.cursor ?? null;
  let exhausted = false;
  while (collected.length <= take && !exhausted) {
    const rows = await prisma.userProfile.findMany({
      where: buildUserWhere(
        viewer,
        filters,
        liveSearchExternalIds
      ),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: databaseMode ? Math.max(100, take + 1) : take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {}),
      select: userListSelect
    });
    if (rows.length === 0) {
      exhausted = true;
      break;
    }
    cursor = rows.at(-1)?.id ?? null;
    const liveFacts = await getProductionRightTokenUserFactsByIds(
      rows.map((user) => user.externalUserId)
    );
    for (const user of rows) {
      const facts = liveFacts.get(user.externalUserId);
      if (databaseMode && (!facts || facts.deletedAt)) {
        continue;
      }
      collected.push(
        facts ? mergeManagedUser(user, facts) : user
      );
      if (collected.length > take) {
        break;
      }
    }
    exhausted =
      rows.length <
      (databaseMode ? Math.max(100, take + 1) : take + 1);
  }
  const hasMore = collected.length > take;
  const items = hasMore ? collected.slice(0, take) : collected;

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
      sourceDeletedAt: null,
      AND: [authorizedUserScope(viewer)]
    },
    include: {
      locationRule: {
        select: {
          name: true,
          pattern: true
        }
      },
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

  const liveFacts = (
    await getProductionRightTokenUserFactsByIds([
      user.externalUserId
    ])
  ).get(user.externalUserId);
  const currentUser = liveFacts
    ? mergeManagedUser(user, liveFacts)
    : user;
  if (liveFacts?.deletedAt) {
    return null;
  }
  const {
    registrationIpEnc,
    registrationIpHash,
    ...safeUser
  } = currentUser;
  void registrationIpHash;
  return {
    ...safeUser,
    registrationIp:
      liveFacts?.registrationIp ??
      decryptRegistrationIp(registrationIpEnc)
  };
}
