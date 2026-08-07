import type {
  MemberRole,
  Prisma
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  currentSegmentEpisodeStartedAt,
  deriveAGroupProgress
} from "@/modules/a-group/current-episode";
import type {
  AGroupQueueUser,
  AGroupWorkspaceData
} from "@/modules/a-group/types";

type AGroupViewer = {
  id: string;
  role: MemberRole;
};

function authorizedScope(
  viewer: AGroupViewer
): Prisma.UserProfileWhereInput {
  if (viewer.role !== "OPERATOR") return {};
  return {
    OR: [
      { ownerId: viewer.id },
      {
        tasks: {
          some: {
            OR: [
              { assigneeId: viewer.id },
              { assigneeId: null, status: "UNASSIGNED" }
            ]
          }
        }
      }
    ]
  };
}

export function buildAGroupWhere(
  viewer: AGroupViewer,
  query = ""
): Prisma.UserProfileWhereInput {
  const search = query.trim();
  return {
    AND: [
      {
        sourceDeletedAt: null,
        currentSegment: "A",
        checkoutStartedAt: null
      },
      authorizedScope(viewer),
      ...(search
        ? [
            {
              OR: [
                {
                  externalUserId: {
                    contains: search,
                    mode: "insensitive" as const
                  }
                },
                {
                  email: {
                    contains: search,
                    mode: "insensitive" as const
                  }
                }
              ]
            }
          ]
        : [])
    ]
  };
}

export function aGroupOrderBy(): Prisma.UserProfileOrderByWithRelationInput[] {
  return [{ registeredAt: "desc" }, { id: "desc" }];
}

function queueItem(user: {
  id: string;
  externalUserId: string;
  email: string;
  countryCode: string | null;
  registeredAt: Date;
}): AGroupQueueUser {
  return {
    id: user.id,
    registrationSequence: user.externalUserId,
    email: user.email,
    countryCode: user.countryCode,
    registeredAt: user.registeredAt
  };
}

export async function getAGroupWorkspace(
  viewer: AGroupViewer,
  query = "",
  selectedUserId: string | null = null
): Promise<AGroupWorkspaceData> {
  const where = buildAGroupWhere(viewer, query);
  const users = await prisma.userProfile.findMany({
    where,
    orderBy: aGroupOrderBy(),
    take: 200,
    select: {
      id: true,
      externalUserId: true,
      email: true,
      countryCode: true,
      registeredAt: true
    }
  });
  const queue = users.map(queueItem);
  const activeId =
    queue.find((user) => user.id === selectedUserId)?.id ??
    queue[0]?.id;
  if (!activeId) return { users: queue, selectedUser: null };

  const selected = await prisma.userProfile.findFirst({
    where: {
      AND: [buildAGroupWhere(viewer), { id: activeId }]
    },
    select: {
      id: true,
      externalUserId: true,
      email: true,
      countryCode: true,
      registeredAt: true,
      currentSegment: true,
      segmentHistory: {
        orderBy: { changedAt: "desc" },
        select: { toSegment: true, changedAt: true }
      },
      contact: {
        select: {
          wechatId: true,
          telegramHandle: true,
          phoneCountryCode: true,
          phoneNumber: true
        }
      },
      couponGrant: {
        select: {
          status: true,
          grantedAt: true,
          failureCode: true
        }
      },
      maintenanceRecords: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          body: true,
          source: true,
          occurredAt: true,
          sourceMessage: { select: { status: true } }
        }
      },
      mailMessages: {
        orderBy: { createdAt: "desc" },
        select: {
          direction: true,
          status: true,
          sentAt: true,
          receivedAt: true,
          createdAt: true
        }
      }
    }
  });
  if (!selected) return { users: queue, selectedUser: null };

  const episodeStartedAt = currentSegmentEpisodeStartedAt({
    currentSegment: selected.currentSegment,
    registeredAt: selected.registeredAt,
    segmentHistory: selected.segmentHistory
  });
  const sent = selected.mailMessages.filter(
    (message) =>
      message.direction === "OUTBOUND" &&
      (message.status === "SENT" || message.status === "BOUNCED")
  );
  const received = selected.mailMessages.filter(
    (message) =>
      message.direction === "INBOUND" &&
      message.status === "RECEIVED"
  );
  const bounced = selected.mailMessages.filter(
    (message) => message.status === "BOUNCED"
  );
  const hasContact = Boolean(
    selected.contact &&
      (selected.contact.wechatId ||
        selected.contact.telegramHandle ||
        selected.contact.phoneNumber)
  );
  const maintenanceRecords = selected.maintenanceRecords.map(
    ({ sourceMessage, ...record }) => ({
      ...record,
      effective:
        record.source === "MANUAL" ||
        sourceMessage?.status === "SENT"
    })
  );

  return {
    users: queue,
    selectedUser: {
      ...queueItem(selected),
      episodeStartedAt,
      progress: deriveAGroupProgress({
        episodeStartedAt,
        sentMailDates: sent
          .filter((message) => message.status === "SENT")
          .map((message) => message.sentAt ?? message.createdAt),
        maintenanceDates: maintenanceRecords
          .filter((record) => record.effective)
          .map((record) => record.occurredAt),
        hasContact,
        couponSucceeded:
          selected.couponGrant?.status === "SUCCEEDED"
      }),
      mailStats: {
        sent: sent.length,
        received: received.length,
        bounced: bounced.length
      },
      contact: selected.contact,
      coupon: selected.couponGrant,
      maintenanceRecords
    }
  };
}
