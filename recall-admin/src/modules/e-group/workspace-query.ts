import type { MemberRole, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { EGroupQueueUser, EGroupWorkspaceData } from "./types";

type Viewer = { id: string; role: MemberRole };

function authorizedScope(viewer: Viewer): Prisma.UserProfileWhereInput {
  if (viewer.role !== "OPERATOR") return {};
  return {
    OR: [
      { ownerId: viewer.id },
      { tasks: { some: { OR: [
        { assigneeId: viewer.id },
        { assigneeId: null, status: "UNASSIGNED" }
      ] } } }
    ]
  };
}

export function buildEGroupWhere(viewer: Viewer): Prisma.UserProfileWhereInput {
  return { AND: [{ sourceDeletedAt: null, currentSegment: "E" }, authorizedScope(viewer)] };
}

function queueItem(user: {
  id: string;
  externalUserId: string;
  email: string;
  countryCode: string | null;
  displayName: string | null;
}): EGroupQueueUser {
  return {
    id: user.id,
    registrationSequence: user.externalUserId,
    email: user.email,
    countryCode: user.countryCode,
    displayName: user.displayName
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function numberValue(value: Prisma.JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: Prisma.JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function giftDetail(payload: Record<string, Prisma.JsonValue>): string {
  const name = stringValue(payload.promotion_name) ?? stringValue(payload.bonus_name);
  const bonus = numberValue(payload.bonus_minor) ?? numberValue(payload.gift_minor);
  if (name && bonus !== null) return `${name} · 赠送 ${(bonus / 100).toFixed(2)}`;
  if (name) return name;
  if (bonus !== null) return `赠送 ${(bonus / 100).toFixed(2)}`;
  return "无赠送记录";
}

export async function getEGroupWorkspace(
  viewer: Viewer,
  selectedUserId: string | null = null
): Promise<EGroupWorkspaceData> {
  const where = buildEGroupWhere(viewer);
  const users = await prisma.userProfile.findMany({
    where,
    orderBy: [{ balanceChangedAt: "desc" }, { id: "desc" }],
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
      totalPaidMinor: true,
      balanceCurrency: true,
      contact: { select: { wechatId: true, telegramHandle: true } },
      events: {
        where: { eventType: "payment.succeeded", applied: true },
        orderBy: { occurredAt: "desc" },
        select: { id: true, occurredAt: true, payload: true }
      },
      mailMessages: {
        where: { direction: "OUTBOUND", purpose: "PAYMENT_FOLLOW_UP" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, subject: true, status: true, sentAt: true, createdAt: true }
      },
      rechargeOutreachRecords: {
        orderBy: { occurredAt: "desc" },
        take: 100,
        select: {
          id: true,
          reason: true,
          body: true,
          occurredAt: true,
          actor: { select: { displayName: true } },
          asset: { select: { id: true, fileName: true, width: true, height: true } }
        }
      },
      personalizedCarePlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { displayName: true } }
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
      }
    }
  });
  if (!selected) return { users: queue, selectedUser: null };

  return {
    users: queue,
    selectedUser: {
      ...queueItem(selected),
      totalPaidMinor: selected.totalPaidMinor,
      balanceCurrency: selected.balanceCurrency,
      contact: selected.contact,
      rechargeHistory: selected.events.map((event) => {
        const payload = jsonRecord(event.payload);
        return {
          id: event.id,
          occurredAt: event.occurredAt,
          amountMinor: numberValue(payload.amount_minor) ?? 0,
          currency: stringValue(payload.currency) ?? selected.balanceCurrency,
          giftDetail: giftDetail(payload)
        };
      }),
      outreach: {
        mail: selected.mailMessages.map((message) => ({
          id: message.id,
          subject: message.subject,
          status: message.status,
          occurredAt: message.sentAt ?? message.createdAt
        })),
        wechat: selected.rechargeOutreachRecords.map((record) => ({
          id: record.id,
          reason: record.reason,
          body: record.body,
          occurredAt: record.occurredAt,
          actorName: record.actor.displayName,
          asset: record.asset
        }))
      },
      latestCarePlan: selected.personalizedCarePlans[0]
        ? {
            id: selected.personalizedCarePlans[0].id,
            body: selected.personalizedCarePlans[0].body,
            createdAt: selected.personalizedCarePlans[0].createdAt,
            authorName: selected.personalizedCarePlans[0].author.displayName
          }
        : null,
      maintenanceRecords: selected.maintenanceRecords.map(({ sourceMessage, ...record }) => ({
        ...record,
        effective: record.source === "MANUAL" || sourceMessage?.status === "SENT"
      }))
    }
  };
}
