import type { SegmentClause } from "@/modules/segmentation/rule-definition";

const unitLabels = {
  minutes: "分钟",
  hours: "小时",
  days: "天"
} as const;

function isAffirmative(clause: SegmentClause): boolean | null {
  if (typeof clause.value !== "boolean") return null;
  if (clause.operator === "eq") return clause.value;
  if (clause.operator === "neq") return !clause.value;
  return null;
}

function describeBoolean(clause: SegmentClause): string | null {
  const affirmative = isAffirmative(clause);
  if (affirmative === null) return null;

  const labels: Partial<Record<SegmentClause["field"], [string, string]>> = {
    anomalyActive: ["存在服务异常", "没有服务异常"],
    checkoutStarted: ["已进入支付流程", "未进入支付流程"],
    unsubscribed: ["已退订", "未退订"],
    paused: ["已暂停", "未暂停"]
  };
  const pair = labels[clause.field];
  return pair ? pair[affirmative ? 0 : 1] : null;
}

function describeRecordState(clause: SegmentClause): string | null {
  if (
    clause.operator !== "is_null" &&
    clause.operator !== "is_not_null"
  ) {
    return null;
  }
  const hasRecord = clause.operator === "is_not_null";
  const labels: Partial<Record<SegmentClause["field"], [string, string]>> = {
    firstPaidAt: ["已完成首单", "尚未完成首单"],
    firstCallAt: ["已有首次调用", "尚无首次调用"],
    lastCallAt: ["已有调用记录", "尚无调用记录"],
    anomalyChangedAt: ["已有异常记录", "暂无异常记录"],
    balanceChangedAt: ["已有余额变化记录", "暂无余额变化记录"]
  };
  const pair = labels[clause.field];
  return pair ? pair[hasRecord ? 0 : 1] : null;
}

function numericValue(clause: SegmentClause): number | null {
  return typeof clause.value === "number" ? clause.value : null;
}

function describeSuccessfulCalls(clause: SegmentClause): string | null {
  if (clause.field !== "successfulCallCount") return null;
  const value = numericValue(clause);
  if (value === null) return null;

  if (clause.operator === "eq" && value === 0) return "尚无成功调用";
  if (
    (clause.operator === "gt" && value === 0) ||
    (clause.operator === "gte" && value === 1)
  ) {
    return "已有成功调用";
  }

  const phrases: Partial<Record<SegmentClause["operator"], string>> = {
    eq: `成功调用 ${value} 次`,
    neq: `成功调用次数不是 ${value} 次`,
    gt: `成功调用超过 ${value} 次`,
    gte: `成功调用至少 ${value} 次`,
    lt: `成功调用少于 ${value} 次`,
    lte: `成功调用不超过 ${value} 次`
  };
  return phrases[clause.operator] ?? null;
}

function moneyLabel(field: SegmentClause["field"]): string | null {
  if (field === "balanceUsdMinor") return "余额";
  if (field === "totalPaidMinor") return "累计支付金额";
  return null;
}

function describeMoney(clause: SegmentClause): string | null {
  const subject = moneyLabel(clause.field);
  const value = numericValue(clause);
  if (!subject || value === null) return null;
  const amount = `${(value / 100).toFixed(2)} 美元`;

  const phrases: Partial<Record<SegmentClause["operator"], string>> = {
    eq: `${subject}为 ${amount}`,
    neq: `${subject}不是 ${amount}`,
    gt: `${subject}高于 ${amount}`,
    gte: `${subject}不少于 ${amount}`,
    lt: `${subject}低于 ${amount}`,
    lte: `${subject}不超过 ${amount}`
  };
  return phrases[clause.operator] ?? null;
}

function describeDuration(clause: SegmentClause): string | null {
  const value = numericValue(clause);
  if (value === null || !clause.unit) return null;
  const duration = `${value} ${unitLabels[clause.unit]}`;

  if (
    clause.field === "lastCallElapsed" &&
    (clause.operator === "gte" || clause.operator === "gt")
  ) {
    return `超过 ${duration}未调用`;
  }
  if (
    clause.field === "emptyBalanceElapsed" &&
    (clause.operator === "gte" || clause.operator === "gt")
  ) {
    return `余额不足已持续 ${duration}`;
  }
  if (
    clause.field === "registrationElapsed" &&
    (clause.operator === "gte" || clause.operator === "gt")
  ) {
    return `注册已满 ${duration}`;
  }
  return null;
}

function displayValue(clause: SegmentClause): string {
  if (Array.isArray(clause.value)) {
    return clause.value.join(clause.operator === "between" ? " 至 " : "、");
  }
  return String(clause.value ?? "");
}

export function describeOperationalClause(
  clause: SegmentClause,
  fieldLabel: string = clause.field
): string {
  const specialized =
    describeBoolean(clause) ??
    describeRecordState(clause) ??
    describeSuccessfulCalls(clause) ??
    describeMoney(clause) ??
    describeDuration(clause);
  if (specialized) return specialized;

  if (clause.operator === "is_null") return `${fieldLabel}暂无记录`;
  if (clause.operator === "is_not_null") return `${fieldLabel}已有记录`;

  const value = displayValue(clause);
  const unit = clause.unit ? ` ${unitLabels[clause.unit]}` : "";
  const phrases: Record<
    Exclude<SegmentClause["operator"], "is_null" | "is_not_null">,
    string
  > = {
    eq: `${fieldLabel}为 ${value}${unit}`,
    neq: `${fieldLabel}不是 ${value}${unit}`,
    in: `${fieldLabel}属于 ${value}`,
    not_in: `${fieldLabel}不属于 ${value}`,
    gt: `${fieldLabel}超过 ${value}${unit}`,
    gte: `${fieldLabel}至少 ${value}${unit}`,
    lt: `${fieldLabel}低于 ${value}${unit}`,
    lte: `${fieldLabel}不超过 ${value}${unit}`,
    between: `${fieldLabel}在 ${value}${unit}之间`,
    before: `${fieldLabel}早于 ${value}`,
    before_or_equal: `${fieldLabel}不晚于 ${value}`,
    after: `${fieldLabel}晚于 ${value}`,
    after_or_equal: `${fieldLabel}不早于 ${value}`
  };
  return phrases[clause.operator];
}
