import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import { assignmentRuleInputSchema } from "@/modules/assignment/match-rule";
import type { AssignmentRuleInput } from "@/modules/assignment/types";

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function validateAssignmentRules(
  inputRules: AssignmentRuleInput[]
) {
  const rules = inputRules.map((rule) =>
    assignmentRuleInputSchema.parse(rule)
  );
  if (rules.length > 100) {
    throw new Error("at most 100 assignment rules are allowed");
  }
  const priorities = new Set(rules.map((rule) => rule.priority));
  if (priorities.size !== rules.length) {
    throw new Error("assignment rule priorities must be unique");
  }
  return rules;
}

export async function publishAssignmentRules(
  actorId: string,
  inputRules: AssignmentRuleInput[]
): Promise<number> {
  const rules = validateAssignmentRules(inputRules);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const actor = await tx.member.findUniqueOrThrow({
            where: { id: actorId },
            select: { id: true, role: true, active: true }
          });
          if (!actor.active) {
            throw new ForbiddenError("rules:publish");
          }
          assertMemberPermission(actor, "rules:publish");

          await tx.$queryRaw(
            Prisma.sql`
              SELECT pg_advisory_xact_lock(
                hashtext('assignment-rules')
              )::text AS "locked"
            `
          );

          const targetIds = [
            ...new Set(
              rules.flatMap((rule) =>
                [rule.assigneeId, rule.fallbackAssigneeId].filter(
                  (id): id is string => Boolean(id)
                )
              )
            )
          ];
          const targets =
            targetIds.length === 0
              ? []
              : await tx.member.findMany({
                  where: { id: { in: targetIds } },
                  select: { id: true, active: true }
                });
          if (
            targets.length !== targetIds.length ||
            targets.some((target) => !target.active)
          ) {
            throw new Error(
              "assignment targets must be active members"
            );
          }

          const before = await tx.assignmentRule.findMany({
            orderBy: { priority: "asc" }
          });
          await tx.assignmentRule.deleteMany({});
          const after = [];
          for (const rule of rules) {
            after.push(
              await tx.assignmentRule.create({
                data: {
                  name: rule.name,
                  enabled: rule.enabled,
                  priority: rule.priority,
                  conditions: toAuditJson(rule.conditions),
                  assigneeId: rule.assigneeId,
                  fallbackAssigneeId: rule.fallbackAssigneeId,
                  poolKey: rule.poolKey,
                  workloadLimit: rule.workloadLimit,
                  effectiveFrom: rule.effectiveFrom,
                  effectiveTo: rule.effectiveTo
                }
              })
            );
          }
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "assignment_rules.published",
              entityType: "AssignmentRule",
              metadata: {
                before: toAuditJson(before),
                after: toAuditJson(after)
              }
            }
          });
          return after.length;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      const retry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2;
      if (!retry) {
        throw error;
      }
    }
  }

  throw new Error("assignment rule publication retry exhausted");
}
