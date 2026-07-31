import { z } from "zod";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import {
  assignTask,
  assignUserOwner
} from "@/modules/assignment/assign-task";
import { createGeoIpResolver } from "@/modules/geoip/http-resolver";
import type { GeoIpResolver } from "@/modules/geoip/types";
import type { LocationRule } from "@/modules/location/email-domain";
import { recalculateStoredUserLocation } from "@/modules/location/recompute-user";
import { locationRuleSetSchema } from "@/modules/location/rule-schema";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";

const inputSchema = z.object({
  runId: z.string().min(1)
});

export type LocationRecalculationInput = z.input<
  typeof inputSchema
>;

function decryptRegistrationIp(value: string | null): string | null {
  if (!value) return null;
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(
    Buffer.from(encryptionKey, "base64")
  ).decrypt(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function handleLocationRecalculation(
  rawInput: LocationRecalculationInput,
  now = new Date(),
  scheduler: TaskScheduler = noopTaskScheduler,
  resolver: GeoIpResolver = createGeoIpResolver(),
  batchSize = 200
) {
  const { runId } = inputSchema.parse(rawInput);
  const run = await prisma.locationRecalculationRun.findUniqueOrThrow({
    where: { id: runId }
  });
  if (run.status === "COMPLETED") {
    return {
      completed: true as const,
      processedUsers: run.processedUsers,
      failedUsers: run.failedUsers
    };
  }
  const parsedRules = locationRuleSetSchema.parse(run.ruleSnapshot);
  const rules: LocationRule[] = parsedRules.map((rule, index) => ({
    id: rule.id ?? `snapshot:${index + 1}`,
    enabled: rule.enabled,
    priority: rule.priority,
    matchType: rule.matchType,
    pattern: rule.pattern,
    countryCode: rule.countryCode
  }));
  const currentRuleIds = new Set(
    (
      await prisma.locationAttributionRule.findMany({
        select: { id: true }
      })
    ).map((rule) => rule.id)
  );
  await prisma.locationRecalculationRun.update({
    where: { id: run.id },
    data: {
      status: "RUNNING",
      startedAt: run.startedAt ?? now,
      completedAt: null
    }
  });

  const users = run.upperBoundUserId
    ? await prisma.userProfile.findMany({
        where: {
          sourceDeletedAt: null,
          id: {
            ...(run.lastProcessedUserId
              ? { gt: run.lastProcessedUserId }
              : {}),
            lte: run.upperBoundUserId
          }
        },
        orderBy: { id: "asc" },
        take: batchSize
      })
    : [];

  let batchFailed = 0;
  for (const user of users) {
    try {
      if (user.locationAssignmentMode === "MANUAL") {
        await prisma.locationRecalculationRun.update({
          where: { id: run.id },
          data: {
            processedUsers: { increment: 1 },
            succeededUsers: { increment: 1 },
            lastProcessedUserId: user.id
          }
        });
        continue;
      }
      const result = await recalculateStoredUserLocation(
        {
          email: user.email,
          registrationIp: user.ipCountryCode
            ? null
            : decryptRegistrationIp(user.registrationIpEnc),
          ipCountryCode: user.ipCountryCode,
          ipRegion: user.ipRegion
        },
        rules,
        resolver
      );
      const countryChanged =
        result.countryCode !== user.countryCode ||
        result.region !== user.region;
      await prisma.userProfile.update({
        where: { id: user.id },
        data: {
          countryCode: result.countryCode,
          region: result.region,
          ipCountryCode: result.ipCountryCode,
          ipRegion: result.ipRegion,
          locationSource: result.source,
          locationRuleId:
            result.ruleId && currentRuleIds.has(result.ruleId)
              ? result.ruleId
              : null,
          locationEvaluatedAt: now
        }
      });
      await assignUserOwner(user.id, now);

      const tasks = await prisma.recallTask.findMany({
        where: {
          userId: user.id,
          status: { in: ["UNASSIGNED", "TODO"] }
        },
        select: { id: true }
      });
      let reassignedTasks = 0;
      for (const task of tasks) {
        await assignTask(task.id, now);
        reassignedTasks += 1;
      }

      await prisma.locationRecalculationRun.update({
        where: { id: run.id },
        data: {
          processedUsers: { increment: 1 },
          succeededUsers: { increment: 1 },
          countryChanges: { increment: countryChanged ? 1 : 0 },
          reassignedTasks: { increment: reassignedTasks },
          lastProcessedUserId: user.id
        }
      });
    } catch (error) {
      batchFailed += 1;
      await prisma.locationRecalculationRun.update({
        where: { id: run.id },
        data: {
          processedUsers: { increment: 1 },
          failedUsers: { increment: 1 },
          lastProcessedUserId: user.id,
          errorSummary: {
            lastFailure: {
              userId: user.id,
              message: errorMessage(error)
            }
          }
        }
      });
    }
  }

  if (users.length === batchSize) {
    await scheduler.scheduleLocationRecalculation?.({ runId: run.id });
    const current =
      await prisma.locationRecalculationRun.findUniqueOrThrow({
        where: { id: run.id }
      });
    return {
      completed: false as const,
      processedUsers: current.processedUsers,
      failedUsers: current.failedUsers
    };
  }

  const final = await prisma.locationRecalculationRun.update({
    where: { id: run.id },
    data: {
      status:
        run.failedUsers + batchFailed > 0
          ? "PARTIAL_FAILURE"
          : "COMPLETED",
      completedAt: now
    }
  });
  return {
    completed: true as const,
    processedUsers: final.processedUsers,
    failedUsers: final.failedUsers
  };
}
