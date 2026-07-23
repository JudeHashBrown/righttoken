import {
  Prisma,
  type AssignmentRule,
  type UserProfile
} from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import { matchRule } from "@/modules/assignment/match-rule";
import type {
  AssignmentDecision,
  AssignmentRuleInput,
  AssignmentUserContext,
  AssignmentWorkload
} from "@/modules/assignment/types";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";

export function storedRuleToInput(
  rule: AssignmentRule
): AssignmentRuleInput {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    conditions:
      rule.conditions as AssignmentRuleInput["conditions"],
    assigneeId: rule.assigneeId,
    fallbackAssigneeId: rule.fallbackAssigneeId,
    poolKey: rule.poolKey,
    workloadLimit: rule.workloadLimit,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo
  };
}

function decryptRegistrationIp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(
    Buffer.from(encryptionKey, "base64")
  ).decrypt(value);
}

export function userToAssignmentContext(
  user: UserProfile
): AssignmentUserContext {
  return {
    userId: user.id,
    countryCode: user.countryCode,
    region: user.region,
    registrationIp: decryptRegistrationIp(
      user.registrationIpEnc
    ),
    language: user.language,
    timezone: user.timezone,
    source: user.source,
    segment: user.currentSegment,
    totalPaidMinor: user.totalPaidMinor
  };
}

export async function loadAssignmentWorkload(
  tx: TransactionClient,
  assigneeIds: string[]
): Promise<AssignmentWorkload> {
  const uniqueIds = [...new Set(assigneeIds)];
  if (uniqueIds.length === 0) {
    return {};
  }
  const [members, taskCounts] = await Promise.all([
    tx.member.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, active: true }
    }),
    tx.recallTask.groupBy({
      by: ["assigneeId"],
      where: {
        assigneeId: { in: uniqueIds },
        status: { in: openTaskStatuses }
      },
      _count: { _all: true }
    })
  ]);
  const counts = new Map(
    taskCounts.map((row) => [
      row.assigneeId,
      row._count._all
    ])
  );

  return Object.fromEntries(
    members.map((member) => [
      member.id,
      {
        active: member.active,
        withinWorkHours: true,
        openTaskCount: counts.get(member.id) ?? 0
      }
    ])
  );
}

export async function assignTask(
  taskId: string,
  now = new Date()
): Promise<AssignmentDecision> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "RecallTask"
        WHERE "id" = ${taskId}
        FOR UPDATE
      `
    );
    const task = await tx.recallTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { user: true }
    });
    if (!["UNASSIGNED", "TODO"].includes(task.status)) {
      throw new Error("only unstarted tasks can be assigned");
    }

    const storedRules = await tx.assignmentRule.findMany({
      where: {
        enabled: true,
        AND: [
          {
            OR: [
              { effectiveFrom: null },
              { effectiveFrom: { lte: now } }
            ]
          },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: now } }
            ]
          }
        ]
      },
      orderBy: { priority: "asc" }
    });
    const rules = storedRules.map(storedRuleToInput);
    const workload = await loadAssignmentWorkload(
      tx,
      rules.flatMap((rule) =>
        [rule.assigneeId, rule.fallbackAssigneeId].filter(
          (id): id is string => Boolean(id)
        )
      )
    );
    const decision = matchRule(
      userToAssignmentContext(task.user),
      rules,
      workload,
      now
    );

    await tx.recallTask.update({
      where: { id: task.id },
      data: {
        assigneeId: decision.assigneeId,
        assignmentReason: decision.assignmentReason,
        status: decision.assigneeId ? "TODO" : "UNASSIGNED"
      }
    });
    if (decision.assigneeId) {
      await tx.userProfile.update({
        where: { id: task.userId },
        data: { ownerId: decision.assigneeId }
      });
    }
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        action: "task.assigned",
        detail: {
          assigneeId: decision.assigneeId,
          poolKey: decision.poolKey,
          matchedRuleId: decision.matchedRuleId,
          matchedRulePriority: decision.matchedRulePriority,
          usedFallback: decision.usedFallback,
          assignmentReason: decision.assignmentReason
        }
      }
    });

    return decision;
  });
}
