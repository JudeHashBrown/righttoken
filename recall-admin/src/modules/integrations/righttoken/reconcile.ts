import { createHmac } from "node:crypto";
import { Prisma, type UserProfile } from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import { createGeoIpResolver } from "@/modules/geoip/http-resolver";
import type { GeoIpResolver } from "@/modules/geoip/types";
import { assignUserOwnerInTransaction } from "@/modules/assignment/assign-task";
import {
  rightTokenUserSnapshotSchema,
  type RightTokenAdapter,
  type RightTokenUserSnapshot
} from "@/modules/integrations/righttoken/adapter";
import type { AttributionResult } from "@/modules/location/attribution";
import type { LocationRule } from "@/modules/location/email-domain";
import { getNextRuleBoundary } from "@/modules/segmentation/next-rule-boundary";
import { resegmentUser } from "@/modules/segmentation/resegment-user";
import { loadActiveSegmentRuleSet } from "@/modules/segmentation/rule-config";
import {
  noopTaskScheduler,
  type SegmentCheckSchedule,
  type TaskScheduler
} from "@/modules/tasks/scheduler";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";
import { resolveRegistrationAttribution } from "@/modules/users/registration-attribution";

export type ReconciliationResult = {
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  isolated: number;
  segmentChanges: number;
  tasksCreated: number;
  nextCursor: string | null;
};

type PageOutcome = Omit<
  ReconciliationResult,
  "scanned" | "isolated" | "tasksCreated" | "nextCursor"
> & {
  schedules: SegmentCheckSchedule[];
};

function registrationIpFields(
  registrationIp: string | null
): Pick<UserProfile, "registrationIpEnc" | "registrationIpHash"> | object {
  if (!registrationIp) {
    return {
      registrationIpEnc: null,
      registrationIpHash: null
    };
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
    ).encrypt(registrationIp),
    registrationIpHash: createHmac("sha256", hashKey)
      .update(registrationIp)
      .digest("hex")
  };
}

function sourceFacts(snapshot: RightTokenUserSnapshot) {
  return {
    email: snapshot.email.toLowerCase(),
    emailNormalized: snapshot.email.toLowerCase(),
    displayName: snapshot.displayName,
    registeredAt: snapshot.registeredAt,
    countryCode: snapshot.countryCode,
    region: snapshot.region,
    language: snapshot.language,
    timezone: snapshot.timezone,
    source: snapshot.source,
    checkoutStartedAt: snapshot.checkoutStartedAt,
    checkoutChangedAt: snapshot.updatedAt,
    paymentStatus: snapshot.firstPaidAt ? "PAID" : "NONE",
    firstPaidAt: snapshot.firstPaidAt,
    totalPaidMinor: snapshot.totalPaidMinor,
    firstCallAt:
      snapshot.firstCallAt ??
      (snapshot.successfulCallCount > 0
        ? snapshot.lastCallAt
        : null),
    lastCallAt: snapshot.lastCallAt,
    successfulCallCount: snapshot.successfulCallCount,
    balanceMinor: snapshot.balanceMinor,
    balanceCurrency: snapshot.balanceCurrency ?? "USD",
    balanceUsdMinor:
      snapshot.balanceUsdMinor ?? snapshot.balanceMinor,
    balanceChangedAt: snapshot.updatedAt,
    anomalyActive: snapshot.anomalyActive,
    anomalyChangedAt: snapshot.anomalyChangedAt,
    profileChangedAt: snapshot.updatedAt,
    lastExternalEventAt: snapshot.updatedAt,
    sourceDeletedAt: snapshot.deletedAt ?? null,
    ...registrationIpFields(snapshot.registrationIp)
  };
}

type AttributedSnapshot = {
  snapshot: RightTokenUserSnapshot;
  location: AttributionResult;
};

function attributedSourceFacts(
  attributed: AttributedSnapshot,
  now: Date
) {
  return {
    ...sourceFacts(attributed.snapshot),
    countryCode: attributed.location.countryCode,
    region: attributed.location.region,
    ipCountryCode: attributed.location.ipCountryCode,
    ipRegion: attributed.location.ipRegion,
    locationSource: attributed.location.source,
    locationRuleId: attributed.location.ruleId,
    locationEvaluatedAt: now
  };
}

async function reconcilePage(
  tx: TransactionClient,
  snapshots: AttributedSnapshot[],
  now: Date
): Promise<PageOutcome> {
  const outcome: PageOutcome = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    segmentChanges: 0,
    schedules: []
  };

  for (const attributed of snapshots) {
    const { snapshot } = attributed;
    await tx.$queryRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${snapshot.externalUserId}, 0)
        )::text AS "locked"
      `
    );
    const existing = await tx.userProfile.findUnique({
      where: { externalUserId: snapshot.externalUserId }
    });
    if (
      existing?.lastExternalEventAt &&
      snapshot.updatedAt <= existing.lastExternalEventAt
    ) {
      await assignUserOwnerInTransaction(tx, existing.id, now);
      outcome.unchanged += 1;
      continue;
    }
    if (snapshot.deletedAt) {
      if (!existing) {
        outcome.unchanged += 1;
        continue;
      }
      const tasks = await tx.recallTask.findMany({
        where: {
          userId: existing.id,
          status: { in: openTaskStatuses }
        },
        select: { id: true }
      });
      if (tasks.length > 0) {
        await tx.recallTask.updateMany({
          where: {
            id: { in: tasks.map((task) => task.id) },
            status: { in: openTaskStatuses }
          },
          data: {
            status: "CANCELLED",
            cancelledAt: now,
            cancelReason: "righttoken_user_deleted"
          }
        });
        await tx.taskActivity.createMany({
          data: tasks.map((task) => ({
            taskId: task.id,
            action: "task.cancelled",
            detail: { reason: "righttoken_user_deleted" }
          }))
        });
      }
      await tx.userProfile.update({
        where: { id: existing.id },
        data: {
          sourceDeletedAt: snapshot.deletedAt,
          lastExternalEventAt: snapshot.updatedAt,
          profileChangedAt: snapshot.updatedAt,
          ownerId: null,
          reasonLabel: "RightToken 用户已删除"
        }
      });
      outcome.updated += 1;
      continue;
    }

    let user: UserProfile;
    if (existing) {
      user = await tx.userProfile.update({
        where: { id: existing.id },
        data: attributedSourceFacts(attributed, now)
      });
      outcome.updated += 1;
    } else {
      user = await tx.userProfile.create({
        data: {
          externalUserId: snapshot.externalUserId,
          currentSegment: "A",
          ...attributedSourceFacts(attributed, now)
        }
      });
      outcome.inserted += 1;
    }

    const segmentChange = await resegmentUser(
      tx,
      user,
      "RightToken user reconciliation",
      now
    );
    if (segmentChange.changed) {
      outcome.segmentChanges += 1;
    }
    await assignUserOwnerInTransaction(tx, user.id, now);
    user = await tx.userProfile.findUniqueOrThrow({
      where: { id: user.id }
    });
    const { config, version } = await loadActiveSegmentRuleSet(tx);
    const boundary = getNextRuleBoundary(user, config, version, now);
    if (boundary) {
      outcome.schedules.push({
        ...boundary,
        userId: user.id
      });
    }
  }
  return outcome;
}

export async function reconcileRightTokenUsers(input: {
  adapter: RightTokenAdapter;
  scheduler?: TaskScheduler;
  updatedAfter?: Date;
  cursor?: string;
  pageSize?: number;
  maxPages?: number;
  now?: Date;
  geoIpResolver?: GeoIpResolver;
}): Promise<ReconciliationResult> {
  const scheduler = input.scheduler ?? noopTaskScheduler;
  const pageSize = Math.min(500, Math.max(1, input.pageSize ?? 200));
  const maxPages = Math.max(1, input.maxPages ?? 100);
  const now = input.now ?? new Date();
  const geoIpResolver =
    input.geoIpResolver ?? createGeoIpResolver();
  const locationRules: LocationRule[] =
    await prisma.locationAttributionRule.findMany({
      where: { enabled: true },
      orderBy: { priority: "asc" },
      select: {
        id: true,
        enabled: true,
        priority: true,
        matchType: true,
        pattern: true,
        countryCode: true
      }
    });
  let cursor = input.cursor;
  const result: ReconciliationResult = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    isolated: 0,
    segmentChanges: 0,
    tasksCreated: 0,
    nextCursor: null
  };

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await input.adapter.listUsers({
      updatedAfter: input.updatedAfter,
      cursor,
      limit: pageSize
    });
    result.scanned += page.users.length;
    const validSnapshots: RightTokenUserSnapshot[] = [];
    for (const rawSnapshot of page.users) {
      const parsed = rightTokenUserSnapshotSchema.safeParse(rawSnapshot);
      if (parsed.success) {
        validSnapshots.push(parsed.data);
      } else {
        result.isolated += 1;
      }
    }
    const attributedSnapshots = await Promise.all(
      validSnapshots.map(async (snapshot) => ({
        snapshot,
        location: await resolveRegistrationAttribution(
          {
            email: snapshot.email,
            registration_ip: snapshot.registrationIp ?? undefined,
            country_code: snapshot.countryCode ?? undefined,
            region: snapshot.region ?? undefined
          },
          geoIpResolver,
          locationRules
        )
      }))
    );

    const pageOutcome = await prisma.$transaction(
      (tx) => reconcilePage(tx, attributedSnapshots, now),
      {
        maxWait: 10_000,
        timeout: 120_000
      }
    );
    result.inserted += pageOutcome.inserted;
    result.updated += pageOutcome.updated;
    result.unchanged += pageOutcome.unchanged;
    result.segmentChanges += pageOutcome.segmentChanges;
    for (const schedule of pageOutcome.schedules) {
      await scheduler.scheduleSegmentCheck(schedule);
    }

    cursor = page.nextCursor ?? undefined;
    result.nextCursor = page.nextCursor;
    if (!page.nextCursor) {
      break;
    }
  }

  return result;
}
