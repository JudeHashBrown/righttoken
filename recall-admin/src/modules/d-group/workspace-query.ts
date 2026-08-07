import type { MemberRole, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DGroupQueueUser, DGroupWorkspaceData, GuidanceCategory } from "./types";

type Viewer = { id: string; role: MemberRole };

function authorizedScope(viewer: Viewer): Prisma.UserProfileWhereInput {
  if (viewer.role !== "OPERATOR") return {};
  return { OR: [
    { ownerId: viewer.id },
    { tasks: { some: { OR: [{ assigneeId: viewer.id }, { assigneeId: null, status: "UNASSIGNED" }] } } }
  ] };
}

export function buildDGroupWhere(viewer: Viewer, segment: "C" | "D" = "D"): Prisma.UserProfileWhereInput {
  return { AND: [{ sourceDeletedAt: null, currentSegment: segment }, authorizedScope(viewer)] };
}

function queueItem(user: {
  id: string;
  externalUserId: string;
  email: string;
  countryCode: string | null;
  displayName: string | null;
}): DGroupQueueUser {
  return {
    id: user.id,
    registrationSequence: user.externalUserId,
    email: user.email,
    countryCode: user.countryCode,
    displayName: user.displayName
  };
}

const guidanceCategory = (value: string): GuidanceCategory =>
  value === "GROUP_GUIDANCE" || value === "PERSONALIZED_PROMOTION" ? value : "TUTORIAL";

export async function getDGroupWorkspace(
  viewer: Viewer,
  selectedUserId: string | null = null,
  segment: "C" | "D" = "D"
): Promise<DGroupWorkspaceData> {
  const where = buildDGroupWhere(viewer, segment);
  const users = await prisma.userProfile.findMany({
    where,
    orderBy: [{ lastCallAt: "desc" }, { id: "desc" }],
    take: 200,
    select: { id: true, externalUserId: true, email: true, countryCode: true, displayName: true }
  });
  const queue = users.map(queueItem);
  const activeId = queue.find((user) => user.id === selectedUserId)?.id ?? queue[0]?.id;
  if (!activeId) return { users: queue, selectedUser: null };

  const selected = await prisma.userProfile.findFirst({
    where: { AND: [where, { id: activeId }] },
    select: {
      id: true,
      externalUserId: true,
      email: true,
      countryCode: true,
      displayName: true,
      contact: { select: { wechatId: true, telegramHandle: true } },
      mailMessages: {
        where: { direction: "OUTBOUND", purpose: "USAGE_FOLLOW_UP" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, subject: true, status: true, sentAt: true, createdAt: true }
      },
      inactivityReasonRecords: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, body: true, createdAt: true, actor: { select: { displayName: true } } }
      },
      guidanceRecords: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, category: true, body: true, createdAt: true, actor: { select: { displayName: true } } }
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
      }
    }
  });
  if (!selected) return { users: queue, selectedUser: null };

  return {
    users: queue,
    selectedUser: {
      ...queueItem(selected),
      contact: selected.contact,
      inquiryMail: selected.mailMessages.map((message) => ({
        id: message.id,
        subject: message.subject,
        status: message.status,
        occurredAt: message.sentAt ?? message.createdAt
      })),
      reasons: selected.inactivityReasonRecords.map((record) => ({
        id: record.id,
        body: record.body,
        createdAt: record.createdAt,
        actorName: record.actor.displayName
      })),
      guidanceRecords: selected.guidanceRecords.map((record) => ({
        id: record.id,
        category: guidanceCategory(record.category),
        body: record.body,
        createdAt: record.createdAt,
        actorName: record.actor.displayName
      })),
      maintenanceRecords: selected.maintenanceRecords.map(({ sourceMessage, ...record }) => ({
        ...record,
        effective: record.source === "MANUAL" || sourceMessage?.status === "SENT"
      }))
    }
  };
}
