import type {
  SegmentBranch,
  SegmentGroupRule,
  SegmentRuleSet,
  SegmentTaskPolicy
} from "@/modules/segmentation/rule-definition";
import type {
  ConditionOperator,
  DurationUnit,
  SegmentClauseValue,
  SegmentFieldKey
} from "@/modules/segmentation/field-registry";

function clause(
  field: SegmentFieldKey,
  operator: ConditionOperator,
  value?: SegmentClauseValue,
  unit?: DurationUnit
) {
  return {
    field,
    operator,
    ...(value === undefined ? {} : { value }),
    ...(unit ? { unit } : {})
  };
}

function branch(...clauses: ReturnType<typeof clause>[]): SegmentBranch {
  return { clauses } as SegmentBranch;
}

function policy(
  enabled: boolean,
  delayMinutes: number,
  priority: SegmentTaskPolicy["priority"],
  dueMinutesAfterCreation: number,
  templateKey: string | null
): SegmentTaskPolicy {
  return {
    enabled,
    delayMinutes,
    priority,
    dueMinutesAfterCreation,
    templateKey
  };
}

const groups: SegmentGroupRule[] = [
  {
    code: "F",
    annotation: "存在服务异常，需要紧急人工介入",
    enabled: true,
    order: 0,
    branches: [
      branch(
        clause("anomalyActive", "eq", true),
        clause("anomalyChangedAt", "is_not_null"),
        clause("anomalyElapsed", "lt", 24, "hours")
      )
    ],
    taskPolicy: policy(true, 0, "URGENT", 30, "service-anomaly")
  },
  {
    code: "B",
    annotation: "已进入支付流程但尚未完成首单",
    enabled: true,
    order: 1,
    branches: [
      branch(
        clause("firstPaidAt", "is_null"),
        clause("checkoutStarted", "eq", true)
      )
    ],
    taskPolicy: policy(true, 30, "IMPORTANT", 120, "checkout-unpaid")
  },
  {
    code: "A",
    annotation: "注册后尚未进入支付流程",
    enabled: true,
    order: 2,
    branches: [
      branch(
        clause("firstPaidAt", "is_null"),
        clause("checkoutStarted", "eq", false)
      )
    ],
    taskPolicy: policy(true, 120, "NORMAL", 1_440, "registration-unpaid")
  },
  {
    code: "C",
    annotation: "已完成首单但尚未产生成功调用",
    enabled: true,
    order: 3,
    branches: [
      branch(
        clause("firstPaidAt", "is_not_null"),
        clause("successfulCallCount", "eq", 0)
      )
    ],
    taskPolicy: policy(true, 1_440, "IMPORTANT", 120, "paid-no-call")
  },
  {
    code: "E",
    annotation: "余额不足（低于 0.5 美元或等值货币）或耗尽、等待复充",
    enabled: true,
    order: 4,
    branches: [
      branch(
        clause("firstPaidAt", "is_not_null"),
        clause("successfulCallCount", "gt", 0),
        clause("balanceUsdMinor", "lt", 50)
      )
    ],
    taskPolicy: policy(true, 4_320, "NORMAL", 1_440, "balance-exhausted")
  },
  {
    code: "D",
    annotation: "曾成功调用、有余额但已长期未调用",
    enabled: true,
    order: 5,
    branches: [
      branch(
        clause("successfulCallCount", "gt", 0),
        clause("balanceUsdMinor", "gte", 50),
        clause("lastCallElapsed", "gte", 7, "days")
      )
    ],
    taskPolicy: policy(true, 0, "NORMAL", 1_440, "inactive-balance")
  },
  {
    code: "G",
    annotation: "未命中召回条件的健康或其他用户",
    enabled: true,
    order: 6,
    branches: [],
    taskPolicy: policy(false, 0, "NORMAL", 1, null)
  }
];

export const defaultSegmentRuleSet: SegmentRuleSet = {
  schemaVersion: 2,
  groups,
  changeSummary: ""
};
