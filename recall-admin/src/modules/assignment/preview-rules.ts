import { prisma } from "@/lib/db/prisma";
import {
  loadAssignmentWorkload,
  userToAssignmentContext
} from "@/modules/assignment/assign-task";
import {
  assignmentRuleInputSchema,
  matchRule
} from "@/modules/assignment/match-rule";
import type { AssignmentRuleInput } from "@/modules/assignment/types";

export type AssignmentRulePreview = {
  sampledUsers: number;
  countsByRule: Record<string, number>;
  countsByAssignee: Record<string, number>;
  publicPool: number;
  unmatchedConditions: number;
};

export async function previewRules(
  inputRules: AssignmentRuleInput[],
  now = new Date()
): Promise<AssignmentRulePreview> {
  const rules = inputRules.map((rule) =>
    assignmentRuleInputSchema.parse(rule)
  );
  const priorities = new Set(rules.map((rule) => rule.priority));
  if (priorities.size !== rules.length) {
    throw new Error("assignment rule priorities must be unique");
  }

  return prisma.$transaction(async (tx) => {
    const users = await tx.userProfile.findMany({
      orderBy: { createdAt: "desc" },
      take: 500
    });
    const workload = await loadAssignmentWorkload(
      tx,
      rules.flatMap((rule) =>
        [rule.assigneeId, rule.fallbackAssigneeId].filter(
          (id): id is string => Boolean(id)
        )
      )
    );
    const result: AssignmentRulePreview = {
      sampledUsers: users.length,
      countsByRule: {},
      countsByAssignee: {},
      publicPool: 0,
      unmatchedConditions: 0
    };

    for (const user of users) {
      const decision = matchRule(
        userToAssignmentContext(user),
        rules,
        workload,
        now
      );
      const ruleKey = decision.matchedRuleId
        ? decision.matchedRuleId
        : decision.matchedRulePriority === null
          ? null
          : `draft:${decision.matchedRulePriority}`;
      if (ruleKey) {
        result.countsByRule[ruleKey] =
          (result.countsByRule[ruleKey] ?? 0) + 1;
      } else {
        result.unmatchedConditions += 1;
      }
      if (decision.assigneeId) {
        result.countsByAssignee[decision.assigneeId] =
          (result.countsByAssignee[decision.assigneeId] ?? 0) + 1;
      } else {
        result.publicPool += 1;
      }
    }

    return result;
  });
}
