import {
  getSegmentFieldDefinition
} from "@/modules/segmentation/field-registry";
import type {
  SegmentClause,
  SegmentGroupRule
} from "@/modules/segmentation/rule-definition";

const operatorLabels: Record<SegmentClause["operator"], string> = {
  eq: "等于",
  neq: "不等于",
  in: "属于",
  not_in: "不属于",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  between: "介于",
  before: "早于",
  before_or_equal: "早于或等于",
  after: "晚于",
  after_or_equal: "晚于或等于",
  is_null: "为空",
  is_not_null: "不为空"
};

const unitLabels = {
  minutes: "分钟",
  hours: "小时",
  days: "天"
} as const;

function displayValue(clause: SegmentClause): string {
  if (clause.operator === "is_null" || clause.operator === "is_not_null") {
    return "";
  }
  if (typeof clause.value === "boolean") {
    return clause.value ? "是" : "否";
  }
  if (Array.isArray(clause.value)) {
    const separator = clause.operator === "between" ? " 至 " : "、";
    return clause.value.join(separator);
  }
  return String(clause.value ?? "");
}

export function describeClause(clause: SegmentClause): string {
  const field = getSegmentFieldDefinition(clause.field);
  const value = displayValue(clause);
  const unit = clause.unit ? ` ${unitLabels[clause.unit]}` : "";
  return `${field.label}${operatorLabels[clause.operator]}${
    value ? ` ${value}${unit}` : ""
  }`;
}

export function describeGroupRule(group: SegmentGroupRule): string {
  if (group.code === "G") {
    return "如果前面的分组均未命中，则进入 G 组。";
  }
  if (!group.enabled) {
    return `${group.code} 组当前未启用。`;
  }
  const branches = group.branches.map((branch) =>
    branch.clauses.map(describeClause).join("，并且")
  );
  return `如果${branches.join("；或者")}，则进入 ${group.code} 组。`;
}
