import { createHmac } from "node:crypto";
import {
  Prisma,
  type UserProfile
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { resegmentUser } from "@/modules/segmentation/resegment-user";
import { loadActiveSegmentRule } from "@/modules/segmentation/rule-config";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";
import { getNextTemporalBoundary } from "@/modules/tasks/trigger-policy";
import {
  rightTokenEventSchema,
  type RightTokenEventInput
} from "@/modules/users/event-schema";
import {
  findUserByExternalId,
  requireUserByExternalId
} from "@/modules/users/user-repository";

export type IngestResult = {
  accepted: true;
  duplicate: boolean;
  applied: boolean;
  previousSegment: UserProfile["currentSegment"] | null;
  currentSegment: UserProfile["currentSegment"];
};

function getRegistrationIpFields(ipAddress?: string): {
  registrationIpEnc?: string;
  registrationIpHash?: string;
} {
  if (!ipAddress) {
    return {};
  }
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  const hashKey = process.env.SESSION_COOKIE_SECRET;
  if (!encryptionKey || !hashKey) {
    throw new Error(
      "APP_ENCRYPTION_KEY and SESSION_COOKIE_SECRET are required"
    );
  }
  return {
    registrationIpEnc: createFieldCipher(
      Buffer.from(encryptionKey, "base64")
    ).encrypt(ipAddress),
    registrationIpHash: createHmac("sha256", hashKey)
      .update(ipAddress)
      .digest("hex")
  };
}

async function duplicateResult(
  eventId: string
): Promise<IngestResult | null> {
  const existing = await prisma.userEvent.findUnique({
    where: { eventId },
    include: { user: true }
  });
  if (!existing) {
    return null;
  }
  return {
    accepted: true,
    duplicate: true,
    applied: existing.applied,
    previousSegment: existing.user.currentSegment,
    currentSegment: existing.user.currentSegment
  };
}

async function ensureEventUser(
  tx: TransactionClient,
  input: RightTokenEventInput
): Promise<UserProfile> {
  if (input.event_type !== "user.registered") {
    return requireUserByExternalId(tx, input.user_id);
  }

  const existing = await findUserByExternalId(tx, input.user_id);
  if (existing) {
    return existing;
  }

  const ipFields = getRegistrationIpFields(
    input.payload.registration_ip
  );
  return tx.userProfile.create({
    data: {
      externalUserId: input.user_id,
      email: input.payload.email,
      emailNormalized: input.payload.email,
      displayName: input.payload.display_name,
      registeredAt: input.occurred_at,
      countryCode: input.payload.country_code,
      region: input.payload.region,
      language: input.payload.language,
      timezone: input.payload.timezone,
      source: input.payload.source,
      profileChangedAt: input.occurred_at,
      lastExternalEventAt: input.occurred_at,
      currentSegment: "A",
      ...ipFields
    }
  });
}

async function applyFacts(
  tx: TransactionClient,
  user: UserProfile,
  input: RightTokenEventInput
): Promise<{ user: UserProfile; applied: boolean }> {
  const occurredAt = input.occurred_at;
  let applied = false;

  switch (input.event_type) {
    case "user.registered":
    case "user.profile_updated": {
      if (!user.profileChangedAt || occurredAt >= user.profileChangedAt) {
        const payload = input.payload;
        const registrationFields =
          input.event_type === "user.registered" &&
          "registration_ip" in payload
            ? getRegistrationIpFields(payload.registration_ip)
            : {};
        user = await tx.userProfile.update({
          where: { id: user.id },
          data: {
            ...(payload.email
              ? {
                  email: payload.email,
                  emailNormalized: payload.email
                }
              : {}),
            ...(payload.display_name !== undefined
              ? { displayName: payload.display_name }
              : {}),
            ...(payload.country_code !== undefined
              ? { countryCode: payload.country_code }
              : {}),
            ...(payload.region !== undefined
              ? { region: payload.region }
              : {}),
            ...(payload.language !== undefined
              ? { language: payload.language }
              : {}),
            ...(payload.timezone !== undefined
              ? { timezone: payload.timezone }
              : {}),
            ...(payload.source !== undefined
              ? { source: payload.source }
              : {}),
            ...registrationFields,
            profileChangedAt: occurredAt
          }
        });
        applied = true;
      }
      break;
    }

    case "checkout.started":
    case "checkout.cancelled":
    case "checkout.expired": {
      if (
        !user.checkoutChangedAt ||
        occurredAt >= user.checkoutChangedAt
      ) {
        user = await tx.userProfile.update({
          where: { id: user.id },
          data: {
            checkoutStartedAt:
              input.event_type === "checkout.started"
                ? occurredAt
                : null,
            checkoutChangedAt: occurredAt
          }
        });
        applied = true;
      }
      break;
    }

    case "payment.failed": {
      if (!user.firstPaidAt) {
        user = await tx.userProfile.update({
          where: { id: user.id },
          data: { paymentStatus: "FAILED" }
        });
        applied = true;
      }
      break;
    }

    case "payment.succeeded": {
      const canUpdateBalance =
        !user.balanceChangedAt || occurredAt >= user.balanceChangedAt;
      user = await tx.userProfile.update({
        where: { id: user.id },
        data: {
          paymentStatus: "PAID",
          firstPaidAt:
            !user.firstPaidAt || occurredAt < user.firstPaidAt
              ? occurredAt
              : user.firstPaidAt,
          totalPaidMinor: {
            increment: input.payload.amount_minor
          },
          ...(canUpdateBalance
            ? {
                balanceMinor: {
                  increment: input.payload.amount_minor
                },
                balanceChangedAt: occurredAt
              }
            : {})
        }
      });
      applied = true;
      break;
    }

    case "balance.changed": {
      if (!user.balanceChangedAt || occurredAt >= user.balanceChangedAt) {
        user = await tx.userProfile.update({
          where: { id: user.id },
          data: {
            balanceMinor: input.payload.balance_minor,
            balanceChangedAt: occurredAt
          }
        });
        applied = true;
      }
      break;
    }

    case "api_call.succeeded": {
      user = await tx.userProfile.update({
        where: { id: user.id },
        data: {
          successfulCallCount: { increment: 1 },
          firstCallAt:
            !user.firstCallAt || occurredAt < user.firstCallAt
              ? occurredAt
              : user.firstCallAt,
          lastCallAt:
            !user.lastCallAt || occurredAt > user.lastCallAt
              ? occurredAt
              : user.lastCallAt
        }
      });
      applied = true;
      break;
    }

    case "service.anomaly":
    case "service.recovered":
    case "complaint.created":
    case "refund.requested": {
      if (!user.anomalyChangedAt || occurredAt >= user.anomalyChangedAt) {
        const anomalyActive =
          input.event_type !== "service.recovered";
        user = await tx.userProfile.update({
          where: { id: user.id },
          data: {
            anomalyActive,
            anomalyChangedAt: occurredAt,
            ...("reason" in input.payload &&
            input.payload.reason !== undefined
              ? { reasonLabel: input.payload.reason }
              : {})
          }
        });
        applied = true;
      }
      break;
    }
  }

  if (
    applied &&
    (!user.lastExternalEventAt ||
      occurredAt > user.lastExternalEventAt)
  ) {
    user = await tx.userProfile.update({
      where: { id: user.id },
      data: { lastExternalEventAt: occurredAt }
    });
  }

  return { user, applied };
}

async function ingestParsedEvent(
  input: RightTokenEventInput,
  scheduler: TaskScheduler = noopTaskScheduler
): Promise<IngestResult> {
  const existing = await duplicateResult(input.event_id);
  if (existing) {
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${input.user_id}, 0)
          )::text AS "locked"
        `
      );
      const initialUser = await ensureEventUser(tx, input);
      const eventRecord = await tx.userEvent.create({
        data: {
          eventId: input.event_id,
          userId: initialUser.id,
          eventType: input.event_type,
          occurredAt: input.occurred_at,
          payload: JSON.parse(
            JSON.stringify(input.payload)
          ) as Prisma.InputJsonValue
        }
      });
      const factResult = await applyFacts(tx, initialUser, input);
      const evaluationTime = new Date(
        Math.max(Date.now(), input.occurred_at.getTime())
      );
      const segmentChange = factResult.applied
        ? await resegmentUser(
            tx,
            factResult.user,
            `event ${input.event_type}`,
            evaluationTime
          )
        : {
            previousSegment: factResult.user.currentSegment,
            currentSegment: factResult.user.currentSegment
          };

      if (factResult.applied) {
        const { config } = await loadActiveSegmentRule(tx);
        const boundary = getNextTemporalBoundary(
          factResult.user,
          evaluationTime,
          config
        );
        if (boundary) {
          await scheduler.scheduleSegmentCheck({
            userId: factResult.user.id,
            ...boundary
          });
        }
      }

      await tx.userEvent.update({
        where: { id: eventRecord.id },
        data: { applied: factResult.applied }
      });

      return {
        accepted: true,
        duplicate: false,
        applied: factResult.applied,
        previousSegment: segmentChange.previousSegment,
        currentSegment: segmentChange.currentSegment
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const duplicate = await duplicateResult(input.event_id);
      if (duplicate) {
        return duplicate;
      }
    }
    throw error;
  }
}

export async function ingestUserEvent(
  input: unknown,
  scheduler: TaskScheduler = noopTaskScheduler
): Promise<IngestResult> {
  return ingestParsedEvent(
    rightTokenEventSchema.parse(input),
    scheduler
  );
}

export interface UserEventIngestionService {
  ingest(input: RightTokenEventInput): Promise<{
    accepted: true;
    duplicate: boolean;
    previousSegment: UserProfile["currentSegment"] | null;
    currentSegment: UserProfile["currentSegment"];
  }>;
}

export const userEventIngestionService: UserEventIngestionService = {
  ingest: (input) => ingestParsedEvent(input)
};
