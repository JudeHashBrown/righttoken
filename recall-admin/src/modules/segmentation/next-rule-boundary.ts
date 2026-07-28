import { evaluateRuleSet } from "@/modules/segmentation/evaluate-rule-set";
import {
  buildSegmentFacts,
  type SegmentFactSource
} from "@/modules/segmentation/segment-facts";
import type {
  SegmentClause,
  SegmentRuleSet
} from "@/modules/segmentation/rule-definition";
import type { SegmentCode } from "@/modules/segmentation/types";
import { getTaskPolicy } from "@/modules/tasks/trigger-policy";

export type RuleBoundary = {
  userId: string | undefined;
  ruleVersion: number;
  runAt: Date;
  boundaryKey: string;
  purpose: "TASK" | "RULE";
  expectedSegment?: SegmentCode;
};

type BoundaryCandidate = Omit<RuleBoundary, "userId" | "ruleVersion">;

function durationMinutes(
  value: number,
  unit: SegmentClause["unit"]
): number {
  switch (unit) {
    case "days":
      return value * 1_440;
    case "hours":
      return value * 60;
    case "minutes":
    case undefined:
      return value;
  }
}

function relativeSource(
  user: SegmentFactSource,
  field: SegmentClause["field"]
): Date | null {
  switch (field) {
    case "registrationElapsed":
      return user.registeredAt;
    case "lastCallElapsed":
      return user.lastCallAt;
    case "emptyBalanceElapsed":
      return (user.balanceUsdMinor ?? user.balanceMinor) < 50
        ? user.balanceChangedAt
        : null;
    default:
      return null;
  }
}

function clauseBoundaries(
  user: SegmentFactSource,
  clause: SegmentClause,
  now: Date
): BoundaryCandidate[] {
  const source = relativeSource(user, clause.field);
  if (!source) {
    return [];
  }
  const values = Array.isArray(clause.value)
    ? clause.value
    : [clause.value];
  return values
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    )
    .map((value) => {
      const runAt = new Date(
        source.getTime() +
          durationMinutes(value, clause.unit) * 60_000
      );
      return {
        runAt,
        purpose: "RULE" as const,
        boundaryKey:
          `rule:${clause.field}:${clause.operator}:` +
          `${value}:${clause.unit ?? "minutes"}:${source.toISOString()}`
      };
    })
    .filter((candidate) => candidate.runAt > now);
}

function taskAnchor(
  user: SegmentFactSource,
  segment: SegmentCode,
  now: Date
): Date {
  switch (segment) {
    case "A":
      return user.registeredAt;
    case "B":
      return user.checkoutStartedAt ?? now;
    case "C":
      return user.firstPaidAt ?? now;
    case "D":
      return now;
    case "E":
      return user.balanceChangedAt ?? now;
    case "F":
      return now;
    case "G":
      return now;
  }
}

function taskBoundary(
  user: SegmentFactSource,
  ruleSet: SegmentRuleSet,
  segment: SegmentCode,
  now: Date
): BoundaryCandidate | null {
  const policy = getTaskPolicy(ruleSet, segment);
  if (!policy.enabled) {
    return null;
  }
  const anchor = taskAnchor(user, segment, now);
  const configuredAt = new Date(
    anchor.getTime() + policy.delayMinutes * 60_000
  );
  return {
    runAt: configuredAt,
    purpose: "TASK",
    expectedSegment: segment,
    boundaryKey: `task:${segment}:${anchor.toISOString()}`
  };
}

export function getNextRuleBoundary(
  user: SegmentFactSource,
  ruleSet: SegmentRuleSet,
  ruleVersion: number,
  now: Date,
  options: { includeTask?: boolean } = {}
): RuleBoundary | null {
  const facts = buildSegmentFacts(user, now);
  const evaluation = evaluateRuleSet(facts, ruleSet);
  const candidates: BoundaryCandidate[] = [];

  if (options.includeTask !== false) {
    const task = taskBoundary(
      user,
      ruleSet,
      evaluation.segment,
      now
    );
    if (task) {
      candidates.push(task);
    }
  }
  for (const group of ruleSet.groups) {
    for (const branch of group.branches) {
      for (const clause of branch.clauses) {
        candidates.push(...clauseBoundaries(user, clause, now));
      }
    }
  }

  candidates.sort((left, right) => {
    const byTime = left.runAt.getTime() - right.runAt.getTime();
    if (byTime !== 0) {
      return byTime;
    }
    return left.purpose === "TASK" ? -1 : 1;
  });
  const selected = candidates[0];
  return selected
    ? {
        userId: user.id,
        ruleVersion,
        ...selected
      }
    : null;
}
