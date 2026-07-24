import {
  describeGroupRule
} from "@/modules/segmentation/describe-rule";
import { evaluateClause } from "@/modules/segmentation/evaluate-clause";
import type {
  SegmentRuleSet
} from "@/modules/segmentation/rule-definition";
import type {
  SegmentEvaluationFacts
} from "@/modules/segmentation/segment-facts";
import type {
  SegmentCode,
  SegmentDecision
} from "@/modules/segmentation/types";

export type SegmentEvaluation = SegmentDecision & {
  matchedGroups: SegmentCode[];
  matchedBranchByGroup: Partial<Record<SegmentCode, number>>;
};

export function evaluateRuleSet(
  facts: SegmentEvaluationFacts,
  ruleSet: SegmentRuleSet
): SegmentEvaluation {
  const matchedGroups: SegmentCode[] = [];
  const matchedBranchByGroup: Partial<Record<SegmentCode, number>> = {};

  for (const group of ruleSet.groups) {
    if (!group.enabled || group.code === "G") {
      continue;
    }
    const branchIndex = group.branches.findIndex((branch) =>
      branch.clauses.every((clause) => evaluateClause(facts, clause))
    );
    if (branchIndex >= 0) {
      matchedGroups.push(group.code);
      matchedBranchByGroup[group.code] = branchIndex;
    }
  }

  const selected =
    ruleSet.groups.find((group) => matchedGroups.includes(group.code)) ??
    ruleSet.groups.find((group) => group.code === "G")!;
  return {
    segment: selected.code,
    reason: describeGroupRule(selected),
    matchedGroups,
    matchedBranchByGroup
  };
}
