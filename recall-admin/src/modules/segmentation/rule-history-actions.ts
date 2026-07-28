import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import { parseSegmentRuleConfig } from "@/modules/segmentation/rule-config";
import type { TaskScheduler } from "@/modules/tasks/scheduler";

type RunActionInput = {
  actorId: string;
  idempotencyKey: string;
  scheduler: TaskScheduler;
};

function actionReference(
  value: Prisma.JsonValue,
  key: "retryOf" | "rollbackOf"
): string | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value[key] === "string"
  ) {
    return value[key];
  }
  return null;
}

function validateIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key || key.length > 160) {
    throw new Error("valid idempotency key is required");
  }
  return key;
}

async function assertActiveRuleManager(
  tx: Prisma.TransactionClient,
  actorId: string
) {
  const actor = await tx.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("rules:publish");
  }
  return assertMemberPermission(actor, "rules:publish");
}

export async function listSegmentRuleHistory(actorId: string) {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("users:read");
  }
  assertMemberPermission(actor, "users:read");
  const versions = await prisma.automationRuleVersion.findMany({
    where: { kind: "segmentation" },
    orderBy: { version: "desc" },
    include: {
      recalculationRuns: {
        orderBy: { createdAt: "desc" }
      }
    }
  });
  const members = await prisma.member.findMany({
    where: {
      id: { in: [...new Set(versions.map((item) => item.createdById))] }
    },
    select: { id: true, displayName: true }
  });
  const names = new Map(
    members.map((member) => [member.id, member.displayName])
  );
  return versions.map((version) => {
    const config = parseSegmentRuleConfig(version.config);
    return {
      id: version.id,
      version: version.version,
      active: version.active,
      createdAt: version.createdAt,
      createdBy: names.get(version.createdById) ?? "已停用成员",
      changeSummary: config.changeSummary,
      config,
      runs: version.recalculationRuns.map((run) => ({
        id: run.id,
        status: run.status,
        totalUsers: run.totalUsers,
        processedUsers: run.processedUsers,
        succeededUsers: run.succeededUsers,
        failedUsers: run.failedUsers,
        segmentChanges: run.segmentChanges,
        cancelledTasks: run.cancelledTasks,
        createdTasks: run.createdTasks,
        errorSummary: run.errorSummary,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt
      }))
    };
  });
}

export async function retrySegmentRecalculation(
  input: RunActionInput & { runId: string }
) {
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const result = await prisma.$transaction(
    async (tx) => {
      const actor = await assertActiveRuleManager(tx, input.actorId);
      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtext('segment-recalculation-retry')
          )::text AS "locked"
        `
      );
      const existing = await tx.segmentRecalculationRun.findUnique({
        where: { idempotencyKey }
      });
      if (existing) {
        if (
          actionReference(existing.previewSummary, "retryOf") !==
          input.runId
        ) {
          throw new Error("idempotency key belongs to another action");
        }
        return { run: existing, shouldSchedule: false };
      }
      const source = await tx.segmentRecalculationRun.findUniqueOrThrow({
        where: { id: input.runId }
      });
      if (
        source.status !== "FAILED" &&
        source.status !== "PARTIAL_FAILURE"
      ) {
        throw new Error("only failed recalculations can be retried");
      }
      const [totalUsers, upperBoundUser] = await Promise.all([
        tx.userProfile.count({
          where: { sourceDeletedAt: null }
        }),
        tx.userProfile.findFirst({
          where: { sourceDeletedAt: null },
          orderBy: { id: "desc" },
          select: { id: true }
        })
      ]);
      const run = await tx.segmentRecalculationRun.create({
        data: {
          ruleVersionId: source.ruleVersionId,
          ruleVersionNumber: source.ruleVersionNumber,
          requestedById: actor.id,
          idempotencyKey,
          totalUsers,
          upperBoundUserId: upperBoundUser?.id ?? null,
          previewSummary: { retryOf: source.id }
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "segment_recalculation.retried",
          entityType: "SegmentRecalculationRun",
          entityId: run.id,
          metadata: {
            retryOf: source.id,
            ruleVersion: source.ruleVersionNumber
          }
        }
      });
      return { run, shouldSchedule: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (result.shouldSchedule) {
    await input.scheduler.scheduleSegmentRecalculation?.({
      runId: result.run.id
    });
  }
  return result.run;
}

export async function rollbackSegmentRuleVersion(
  input: RunActionInput & {
    targetVersionId: string;
    changeSummary: string;
  }
) {
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  const changeSummary = input.changeSummary.trim();
  if (changeSummary.length < 4 || changeSummary.length > 500) {
    throw new Error("rollback change summary is required");
  }
  const result = await prisma.$transaction(
    async (tx) => {
      const actor = await assertActiveRuleManager(tx, input.actorId);
      await tx.$queryRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtext('segmentation')
          )::text AS "locked"
        `
      );
      const existing = await tx.segmentRecalculationRun.findUnique({
        where: { idempotencyKey },
        include: { ruleVersion: true }
      });
      if (existing) {
        if (
          actionReference(existing.previewSummary, "rollbackOf") !==
          input.targetVersionId
        ) {
          throw new Error("idempotency key belongs to another action");
        }
        return {
          ruleVersion: existing.ruleVersion,
          run: existing,
          shouldSchedule: false
        };
      }
      const target = await tx.automationRuleVersion.findFirstOrThrow({
        where: {
          id: input.targetVersionId,
          kind: "segmentation"
        }
      });
      const config = parseSegmentRuleConfig(target.config);
      const latest = await tx.automationRuleVersion.findFirst({
        where: { kind: "segmentation" },
        orderBy: { version: "desc" },
        select: { version: true }
      });
      const version = (latest?.version ?? 0) + 1;
      await tx.automationRuleVersion.updateMany({
        where: { kind: "segmentation", active: true },
        data: { active: false }
      });
      const ruleVersion = await tx.automationRuleVersion.create({
        data: {
          kind: "segmentation",
          version,
          config: {
            ...config,
            changeSummary
          } as Prisma.InputJsonValue,
          active: true,
          createdById: actor.id
        }
      });
      const [totalUsers, upperBoundUser] = await Promise.all([
        tx.userProfile.count({
          where: { sourceDeletedAt: null }
        }),
        tx.userProfile.findFirst({
          where: { sourceDeletedAt: null },
          orderBy: { id: "desc" },
          select: { id: true }
        })
      ]);
      const run = await tx.segmentRecalculationRun.create({
        data: {
          ruleVersionId: ruleVersion.id,
          ruleVersionNumber: version,
          requestedById: actor.id,
          idempotencyKey,
          totalUsers,
          upperBoundUserId: upperBoundUser?.id ?? null,
          previewSummary: {
            rollbackOf: target.id,
            rollbackFromVersion: target.version
          }
        }
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "segment_rule.rolled_back",
          entityType: "AutomationRuleVersion",
          entityId: ruleVersion.id,
          metadata: {
            rollbackOf: target.id,
            rollbackFromVersion: target.version,
            version,
            recalculationRunId: run.id,
            changeSummary
          }
        }
      });
      return { ruleVersion, run, shouldSchedule: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (result.shouldSchedule) {
    await input.scheduler.scheduleSegmentRecalculation?.({
      runId: result.run.id
    });
  }
  return {
    ruleVersion: result.ruleVersion,
    run: result.run
  };
}
