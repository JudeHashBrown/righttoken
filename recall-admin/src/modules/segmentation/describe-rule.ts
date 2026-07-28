import {
  getSegmentFieldDefinition
} from "@/modules/segmentation/field-registry";
import type {
  SegmentClause,
  SegmentGroupRule
} from "@/modules/segmentation/rule-definition";
import { describeOperationalClause } from "@/modules/segmentation/operational-copy";

export function describeClause(clause: SegmentClause): string {
  const field = getSegmentFieldDefinition(clause.field);
  return describeOperationalClause(clause, field.label);
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
