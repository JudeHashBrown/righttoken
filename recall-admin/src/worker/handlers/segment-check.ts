import { z } from "zod";
import type { UserProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assignTask,
  assignUserOwnerInTransaction
} from "@/modules/assignment/assign-task";
import { getNextRuleBoundary } from "@/modules/segmentation/next-rule-boundary";
import { resegmentUser } from "@/modules/segmentation/resegment-user";
import { loadActiveSegmentRuleSet } from "@/modules/segmentation/rule-config";
import { createTriggeredTask } from "@/modules/tasks/create-triggered-task";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";
import {
  getTaskPolicy,
  getTriggerPolicy
} from "@/modules/tasks/trigger-policy";
import { mergeManagedUser } from "@/modules/users/managed-user";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

const legacySegmentCheckSchema = z.object({
  userId: z.string().min(1),
  expectedSegment: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
  expectedFactTimestamp: z.string().datetime({ offset: true }),
  runAt: z.coerce.date(),
  reasonKey: z.string().min(1).max(120)
});

const structuredSegmentCheckSchema = z.object({
  userId: z.string().min(1),
  ruleVersion: z.number().int().positive(),
  runAt: z.coerce.date(),
  boundaryKey: z.string().min(1).max(500),
  purpose: z.enum(["TASK", "RULE"]),
  expectedSegment: z
    .enum(["A", "B", "C", "D", "E", "F", "G"])
    .optional()
});

const segmentCheckSchema = z.union([
  structuredSegmentCheckSchema,
  legacySegmentCheckSchema
]);

export type SegmentCheckInput = z.input<typeof segmentCheckSchema>;

function currentFactTimestamp(
  user: UserProfile,
  reasonKey: string
): Date | null {
  switch (reasonKey) {
    case "registration_unpaid":
      return user.registeredAt;
    case "checkout_unpaid":
      return user.checkoutStartedAt;
    case "paid_without_call":
      return user.firstPaidAt;
    case "inactivity_boundary":
    case "inactive_with_balance":
      return user.lastCallAt;
    case "balance_exhausted":
      return user.balanceChangedAt;
    case "active_anomaly":
      return user.anomalyChangedAt;
    default:
      return null;
  }
}

export async function handleSegmentCheck(
  rawInput: SegmentCheckInput,
  now = new Date(),
  scheduler: TaskScheduler = noopTaskScheduler
) {
  const input = segmentCheckSchema.parse(rawInput);
  if (input.runAt > now) {
    return { skipped: "not_due" as const };
  }
  if ("ruleVersion" in input) {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "recall"."UserProfile"
        WHERE "id" = ${input.userId}
        FOR UPDATE
      `;
      const user = await tx.userProfile.findUniqueOrThrow({
        where: { id: input.userId }
      });
      if (user.sourceDeletedAt) {
        return { skipped: "user_deleted" as const };
      }
      const active = await loadActiveSegmentRuleSet(tx);
      if (active.version !== input.ruleVersion) {
        return { skipped: "rule_version_changed" as const };
      }
      const segmentChange = await resegmentUser(
        tx,
        user,
        `scheduled rule boundary ${input.boundaryKey}`,
        now
      );
      await assignUserOwnerInTransaction(tx, user.id, now);
      const currentUser = await tx.userProfile.findUniqueOrThrow({
        where: { id: user.id }
      });
      return {
        user: currentUser,
        config: active.config,
        segment: segmentChange.currentSegment,
        ruleVersion: active.version
      };
    });
    if ("skipped" in outcome) {
      return outcome;
    }

    let taskId: string | null = null;
    if (
      input.purpose === "TASK" &&
      (!input.expectedSegment ||
        input.expectedSegment === outcome.segment)
    ) {
      const policy = getTaskPolicy(
        outcome.config,
        outcome.segment
      );
      if (policy.enabled) {
        const task = await createTriggeredTask({
          userId: input.userId,
          segment: outcome.segment,
          policyKey: input.boundaryKey,
          windowStart: input.runAt,
          ruleVersion: outcome.ruleVersion,
          reason: `规则边界命中：${input.boundaryKey}`,
          policy,
          now
        });
        if (
          task.status === "UNASSIGNED" ||
          task.status === "TODO"
        ) {
          await assignTask(task.id, now);
        }
        taskId = task.id;
      }
    }

    const liveFacts = (
      await getProductionRightTokenUserFactsByIds([
        outcome.user.externalUserId
      ])
    ).get(outcome.user.externalUserId);
    const boundaryUser = liveFacts
      ? mergeManagedUser(outcome.user, liveFacts)
      : outcome.user;
    const nextBoundary = getNextRuleBoundary(
      boundaryUser,
      outcome.config,
      outcome.ruleVersion,
      now,
      { includeTask: input.purpose !== "TASK" }
    );
    if (nextBoundary) {
      await scheduler.scheduleSegmentCheck({
        ...nextBoundary,
        userId: input.userId
      });
    }
    return {
      checked: true as const,
      segment: outcome.segment,
      taskId
    };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "recall"."UserProfile"
      WHERE "id" = ${input.userId}
      FOR UPDATE
    `;
    const user = await tx.userProfile.findUniqueOrThrow({
      where: { id: input.userId }
    });
    if (user.sourceDeletedAt) {
      return { skipped: "user_deleted" as const };
    }
    const factTimestamp = currentFactTimestamp(
      user,
      input.reasonKey
    );
    if (
      user.currentSegment !== input.expectedSegment ||
      !factTimestamp ||
      factTimestamp.toISOString() !== input.expectedFactTimestamp
    ) {
      return { skipped: "state_changed" as const };
    }

    const segmentChange = await resegmentUser(
      tx,
      user,
      `scheduled check ${input.reasonKey}`,
      now
    );
    await assignUserOwnerInTransaction(tx, user.id, now);
    return {
      segment: segmentChange.currentSegment,
      ruleVersion: segmentChange.ruleVersion
    };
  });
  if ("skipped" in outcome) {
    return outcome;
  }

  const policy = getTriggerPolicy(outcome.segment);
  if (!policy.enabled) {
    return {
      checked: true as const,
      segment: outcome.segment,
      taskId: null
    };
  }
  const task = await createTriggeredTask({
    userId: input.userId,
    segment: outcome.segment,
    policyKey: input.reasonKey,
    windowStart: new Date(input.expectedFactTimestamp),
    ruleVersion: outcome.ruleVersion,
    reason: `定时检查命中：${input.reasonKey}`,
    now
  });
  if (task.status === "UNASSIGNED" || task.status === "TODO") {
    await assignTask(task.id, now);
  }

  return {
    checked: true as const,
    segment: outcome.segment,
    taskId: task.id
  };
}
