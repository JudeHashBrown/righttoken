import { createHmac } from "node:crypto";
import { Prisma, type UserProfile } from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import {
  rightTokenUserSnapshotSchema,
  type RightTokenAdapter,
  type RightTokenUserSnapshot
} from "@/modules/integrations/righttoken/adapter";
import { resegmentUser } from "@/modules/segmentation/resegment-user";
import { loadActiveSegmentRule } from "@/modules/segmentation/rule-config";
import {
  noopTaskScheduler,
  type SegmentCheckSchedule,
  type TaskScheduler
} from "@/modules/tasks/scheduler";
import { getNextTemporalBoundary } from "@/modules/tasks/trigger-policy";

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
      snapshot.successfulCallCount > 0 ? snapshot.lastCallAt : null,
    lastCallAt: snapshot.lastCallAt,
    successfulCallCount: snapshot.successfulCallCount,
    balanceMinor: snapshot.balanceMinor,
    balanceChangedAt: snapshot.updatedAt,
    anomalyActive: snapshot.anomalyActive,
    anomalyChangedAt: snapshot.updatedAt,
    profileChangedAt: snapshot.updatedAt,
    lastExternalEventAt: snapshot.updatedAt,
    ...registrationIpFields(snapshot.registrationIp)
  };
}

async function reconcilePage(
  tx: TransactionClient,
  snapshots: RightTokenUserSnapshot[],
  now: Date
): Promise<PageOutcome> {
  const outcome: PageOutcome = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    segmentChanges: 0,
    schedules: []
  };

  for (const snapshot of snapshots) {
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
      outcome.unchanged += 1;
      continue;
    }

    let user: UserProfile;
    if (existing) {
      user = await tx.userProfile.update({
        where: { id: existing.id },
        data: sourceFacts(snapshot)
      });
      outcome.updated += 1;
    } else {
      user = await tx.userProfile.create({
        data: {
          externalUserId: snapshot.externalUserId,
          currentSegment: "A",
          ...sourceFacts(snapshot)
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
    const { config } = await loadActiveSegmentRule(tx);
    const boundary = getNextTemporalBoundary(user, now, config);
    if (boundary) {
      outcome.schedules.push({ userId: user.id, ...boundary });
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
}): Promise<ReconciliationResult> {
  const scheduler = input.scheduler ?? noopTaskScheduler;
  const pageSize = Math.min(500, Math.max(1, input.pageSize ?? 200));
  const maxPages = Math.max(1, input.maxPages ?? 100);
  const now = input.now ?? new Date();
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

    const pageOutcome = await prisma.$transaction((tx) =>
      reconcilePage(tx, validSnapshots, now)
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
