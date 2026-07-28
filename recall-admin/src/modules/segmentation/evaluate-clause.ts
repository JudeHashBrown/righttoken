import type {
  SegmentClause
} from "@/modules/segmentation/rule-definition";
import type {
  SegmentEvaluationFacts
} from "@/modules/segmentation/segment-facts";

function durationMultiplier(unit: SegmentClause["unit"]): number {
  switch (unit) {
    case "days":
      return 1_440;
    case "hours":
      return 60;
    case "minutes":
    case undefined:
      return 1;
  }
}

function comparableValue(
  clause: SegmentClause,
  raw: SegmentEvaluationFacts[keyof SegmentEvaluationFacts]
): unknown {
  if (raw instanceof Date) {
    return raw.getTime();
  }
  return raw;
}

function conditionValue(clause: SegmentClause): unknown {
  const value = clause.value;
  if (
    [
      "registeredAt",
      "firstPaidAt",
      "firstCallAt",
      "lastCallAt",
      "balanceChangedAt",
      "anomalyChangedAt"
    ].includes(clause.field) &&
    typeof value === "string"
  ) {
    return new Date(value).getTime();
  }
  if (
    [
      "registrationElapsed",
      "lastCallElapsed",
      "emptyBalanceElapsed"
    ].includes(clause.field)
  ) {
    const multiplier = durationMultiplier(clause.unit);
    return Array.isArray(value)
      ? value.map((item) => Number(item) * multiplier)
      : Number(value) * multiplier;
  }
  return value;
}

export function evaluateClause(
  facts: SegmentEvaluationFacts,
  clause: SegmentClause
): boolean {
  const raw = facts[clause.field as keyof SegmentEvaluationFacts];
  if (clause.operator === "is_null") {
    return raw === null || raw === undefined;
  }
  if (clause.operator === "is_not_null") {
    return raw !== null && raw !== undefined;
  }
  if (raw === null || raw === undefined) {
    return false;
  }

  const left = comparableValue(clause, raw);
  const right = conditionValue(clause);
  switch (clause.operator) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "in":
      return Array.isArray(right) && right.includes(left as never);
    case "not_in":
      return Array.isArray(right) && !right.includes(left as never);
    case "gt":
    case "after":
      return Number(left) > Number(right);
    case "gte":
    case "after_or_equal":
      return Number(left) >= Number(right);
    case "lt":
    case "before":
      return Number(left) < Number(right);
    case "lte":
    case "before_or_equal":
      return Number(left) <= Number(right);
    case "between":
      return (
        Array.isArray(right) &&
        Number(left) >= Number(right[0]) &&
        Number(left) <= Number(right[1])
      );
  }
}
