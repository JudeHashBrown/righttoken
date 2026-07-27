import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";
import type { LocationRule } from "@/modules/location/email-domain";
import { previewLocationRules } from "@/modules/location/preview-rules";
import {
  locationRuleSetSchema,
  type LocationRuleInput
} from "@/modules/location/rule-schema";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toLocationRules(
  rules: LocationRuleInput[]
): LocationRule[] {
  return rules.map((rule, index) => ({
    id: rule.id ?? `draft:${index + 1}`,
    enabled: rule.enabled,
    priority: rule.priority,
    matchType: rule.matchType,
    pattern: rule.pattern,
    countryCode: rule.countryCode
  }));
}

export async function previewPublishedLocationRules(
  inputRules: LocationRuleInput[]
) {
  const rules = locationRuleSetSchema.parse(inputRules);
  const users = await prisma.userProfile.findMany({
    select: {
      email: true,
      countryCode: true,
      ipCountryCode: true,
      ipRegion: true
    }
  });
  return previewLocationRules(users, toLocationRules(rules));
}

export async function publishLocationRules(
  actorId: string,
  inputRules: LocationRuleInput[],
  scheduler: TaskScheduler = noopTaskScheduler
) {
  const rules = locationRuleSetSchema.parse(inputRules);

  const result = await prisma.$transaction(
    async (tx) => {
      const actor = await tx.member.findUniqueOrThrow({
        where: { id: actorId },
        select: { id: true, role: true, active: true }
      });
      if (!actor.active || actor.role !== "PRIMARY_ADMIN") {
        throw new ForbiddenError("location-rules:publish");
      }

      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtext('location-attribution-rules')
          )::text AS "locked"
        `
      );
      const before = await tx.locationAttributionRule.findMany({
        orderBy: { priority: "asc" }
      });
      await tx.locationAttributionRule.deleteMany({});
      const after = [];
      for (const rule of rules) {
        after.push(
          await tx.locationAttributionRule.create({
            data: {
              ...(rule.id ? { id: rule.id } : {}),
              name: rule.name,
              enabled: rule.enabled,
              priority: rule.priority,
              matchType: rule.matchType,
              pattern: rule.pattern,
              countryCode: rule.countryCode
            }
          })
        );
      }
      const ruleSnapshot = after.map((rule) => ({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        priority: rule.priority,
        matchType: rule.matchType,
        pattern: rule.pattern,
        countryCode: rule.countryCode
      }));
      const [totalUsers, upperBoundUser] = await Promise.all([
        tx.userProfile.count(),
        tx.userProfile.findFirst({
          orderBy: { id: "desc" },
          select: { id: true }
        })
      ]);
      const run = await tx.locationRecalculationRun.create({
        data: {
          requestedById: actor.id,
          totalUsers,
          upperBoundUserId: upperBoundUser?.id ?? null,
          ruleSnapshot
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "location_rules.published",
          entityType: "LocationAttributionRule",
          metadata: {
            before: toAuditJson(before),
            after: toAuditJson(after),
            recalculationRunId: run.id,
            totalUsers
          }
        }
      });
      return { published: after.length, run };
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable
    }
  );
  await scheduler.scheduleLocationRecalculation?.({
    runId: result.run.id
  });
  return result;
}
