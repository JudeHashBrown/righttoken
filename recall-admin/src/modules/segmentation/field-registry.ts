import { isIP } from "node:net";

export const segmentFieldKeys = [
  "registeredAt",
  "registrationElapsed",
  "source",
  "registrationIp",
  "countryCode",
  "checkoutStarted",
  "paymentStatus",
  "firstPaidAt",
  "totalPaidMinor",
  "successfulCallCount",
  "firstCallAt",
  "lastCallAt",
  "lastCallElapsed",
  "balanceUsdMinor",
  "balanceChangedAt",
  "emptyBalanceElapsed",
  "anomalyActive",
  "anomalyChangedAt",
  "unsubscribed",
  "paused",
  "externalUserId",
  "emailDomain"
] as const;

export type SegmentFieldKey = (typeof segmentFieldKeys)[number];

export const conditionOperators = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "before",
  "before_or_equal",
  "after",
  "after_or_equal",
  "is_null",
  "is_not_null"
] as const;

export type ConditionOperator = (typeof conditionOperators)[number];
export type DurationUnit = "minutes" | "hours" | "days";
export type SegmentClauseValue =
  | boolean
  | number
  | string
  | string[]
  | [number, number];

export type SegmentClauseInput = {
  field: SegmentFieldKey;
  operator: ConditionOperator;
  value?: SegmentClauseValue;
  unit?: DurationUnit;
};

type SegmentFieldType =
  | "boolean"
  | "enum"
  | "number"
  | "date"
  | "duration"
  | "text"
  | "country"
  | "ip"
  | "domain";

export type PublicSegmentFieldDefinition = {
  key: SegmentFieldKey;
  category: string;
  label: string;
  type: SegmentFieldType;
  operators: ConditionOperator[];
  options?: Array<{ value: string; label: string }>;
  units?: DurationUnit[];
  sensitive?: boolean;
};

const equalityOperators: ConditionOperator[] = [
  "eq",
  "neq",
  "in",
  "not_in"
];
const numberOperators: ConditionOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between"
];
const dateOperators: ConditionOperator[] = [
  "before",
  "before_or_equal",
  "after",
  "after_or_equal",
  "is_null",
  "is_not_null"
];

const fields: PublicSegmentFieldDefinition[] = [
  {
    key: "registeredAt",
    category: "注册",
    label: "注册时间",
    type: "date",
    operators: dateOperators
  },
  {
    key: "registrationElapsed",
    category: "注册",
    label: "注册后经过时间",
    type: "duration",
    operators: numberOperators,
    units: ["minutes", "hours", "days"]
  },
  {
    key: "source",
    category: "注册",
    label: "注册来源",
    type: "text",
    operators: equalityOperators
  },
  {
    key: "registrationIp",
    category: "地区",
    label: "注册 IP",
    type: "ip",
    operators: equalityOperators,
    sensitive: true
  },
  {
    key: "countryCode",
    category: "地区",
    label: "注册 IP 所属国家",
    type: "country",
    operators: equalityOperators
  },
  {
    key: "checkoutStarted",
    category: "支付",
    label: "是否进入支付",
    type: "boolean",
    operators: ["eq", "neq"]
  },
  {
    key: "paymentStatus",
    category: "支付",
    label: "支付状态",
    type: "enum",
    operators: equalityOperators,
    options: [
      { value: "NONE", label: "未发起" },
      { value: "PENDING", label: "处理中" },
      { value: "PAID", label: "成功" },
      { value: "FAILED", label: "失败" },
      { value: "CANCELLED", label: "取消" },
      { value: "EXPIRED", label: "过期" }
    ]
  },
  {
    key: "firstPaidAt",
    category: "支付",
    label: "首次支付时间",
    type: "date",
    operators: dateOperators
  },
  {
    key: "totalPaidMinor",
    category: "支付",
    label: "累计支付金额",
    type: "number",
    operators: numberOperators
  },
  {
    key: "successfulCallCount",
    category: "调用",
    label: "成功调用次数",
    type: "number",
    operators: numberOperators
  },
  {
    key: "firstCallAt",
    category: "调用",
    label: "首次调用时间",
    type: "date",
    operators: dateOperators
  },
  {
    key: "lastCallAt",
    category: "调用",
    label: "最后调用时间",
    type: "date",
    operators: dateOperators
  },
  {
    key: "lastCallElapsed",
    category: "调用",
    label: "距离最后调用时间",
    type: "duration",
    operators: numberOperators,
    units: ["minutes", "hours", "days"]
  },
  {
    key: "balanceUsdMinor",
    category: "余额",
    label: "美元等值余额（美分）",
    type: "number",
    operators: numberOperators
  },
  {
    key: "balanceChangedAt",
    category: "余额",
    label: "余额最后变化时间",
    type: "date",
    operators: dateOperators
  },
  {
    key: "emptyBalanceElapsed",
    category: "余额",
    label: "余额不足持续时间",
    type: "duration",
    operators: numberOperators,
    units: ["minutes", "hours", "days"]
  },
  {
    key: "anomalyActive",
    category: "异常",
    label: "是否存在服务异常",
    type: "boolean",
    operators: ["eq", "neq"]
  },
  {
    key: "anomalyChangedAt",
    category: "异常",
    label: "异常发生时间",
    type: "date",
    operators: dateOperators
  },
  {
    key: "unsubscribed",
    category: "用户状态",
    label: "是否退订",
    type: "boolean",
    operators: ["eq", "neq"]
  },
  {
    key: "paused",
    category: "用户状态",
    label: "是否暂停",
    type: "boolean",
    operators: ["eq", "neq"]
  },
  {
    key: "externalUserId",
    category: "基础信息",
    label: "用户 ID",
    type: "text",
    operators: equalityOperators
  },
  {
    key: "emailDomain",
    category: "基础信息",
    label: "邮箱域名",
    type: "domain",
    operators: equalityOperators
  }
];

const fieldMap = new Map(fields.map((field) => [field.key, field]));

export function getPublicSegmentFieldRegistry(): PublicSegmentFieldDefinition[] {
  return fields.map((field) => ({
    ...field,
    operators: [...field.operators],
    ...(field.options ? { options: field.options.map((item) => ({ ...item })) } : {}),
    ...(field.units ? { units: [...field.units] } : {})
  }));
}

export function getSegmentFieldDefinition(
  key: SegmentFieldKey
): PublicSegmentFieldDefinition {
  const field = fieldMap.get(key);
  if (!field) {
    throw new Error(`unknown segment field: ${key}`);
  }
  return field;
}

function normalizeList(
  value: SegmentClauseValue | undefined,
  normalize: (item: string) => string
): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error("condition value must be a non-empty list");
  }
  const normalized = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error("condition list values must be strings");
    }
    return normalize(item.trim());
  });
  return [...new Set(normalized)];
}

function normalizeTextValue(
  value: SegmentClauseValue | undefined,
  normalize: (item: string) => string
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("condition value must be a non-empty string");
  }
  return normalize(value.trim());
}

function normalizeDomain(value: string): string {
  const normalized = value.toLowerCase().replace(/^@/, "");
  if (
    normalized.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) ||
    !normalized.includes(".")
  ) {
    throw new Error("condition value must be a valid email domain");
  }
  return normalized;
}

function normalizeCountry(value: string): string {
  const normalized = value.toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error("condition value must be an ISO country code");
  }
  return normalized;
}

function normalizeIp(value: string): string {
  if (isIP(value) === 0) {
    throw new Error("condition value must be an IP address");
  }
  return value;
}

function normalizeNumericValue(
  value: SegmentClauseValue | undefined,
  operator: ConditionOperator
): number | [number, number] {
  if (operator === "between") {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value.some((item) => typeof item !== "number" || !Number.isFinite(item)) ||
      (value[0] as number) > (value[1] as number)
    ) {
      throw new Error("between requires an ordered numeric pair");
    }
    return [value[0] as number, value[1] as number];
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("condition value must be a finite number");
  }
  return value;
}

export function validateClauseForField(
  clause: SegmentClauseInput
): SegmentClauseInput {
  const field = getSegmentFieldDefinition(clause.field);
  if (!field.operators.includes(clause.operator)) {
    throw new Error(
      `operator ${clause.operator} is not allowed for ${clause.field}`
    );
  }

  if (clause.operator === "is_null" || clause.operator === "is_not_null") {
    return { field: clause.field, operator: clause.operator };
  }

  if (field.type === "boolean") {
    if (typeof clause.value !== "boolean") {
      throw new Error("condition value must be boolean");
    }
    return {
      field: clause.field,
      operator: clause.operator,
      value: clause.value
    };
  }

  if (field.type === "number" || field.type === "duration") {
    const value = normalizeNumericValue(clause.value, clause.operator);
    if (
      field.type === "duration" &&
      (!clause.unit || !field.units?.includes(clause.unit))
    ) {
      throw new Error("duration condition requires an approved unit");
    }
    return {
      field: clause.field,
      operator: clause.operator,
      value,
      ...(field.type === "duration" ? { unit: clause.unit } : {})
    };
  }

  if (field.type === "date") {
    const value = normalizeTextValue(clause.value, (item) => {
      const date = new Date(item);
      if (Number.isNaN(date.getTime())) {
        throw new Error("condition value must be an ISO date");
      }
      return date.toISOString();
    });
    return { field: clause.field, operator: clause.operator, value };
  }

  const normalizer =
    field.type === "country"
      ? normalizeCountry
      : field.type === "domain"
        ? normalizeDomain
        : field.type === "ip"
          ? normalizeIp
          : field.type === "enum"
            ? (item: string) => {
                const normalized = item.toUpperCase();
                if (!field.options?.some((option) => option.value === normalized)) {
                  throw new Error("condition value must be a supported option");
                }
                return normalized;
              }
            : (item: string) => item;

  const value =
    clause.operator === "in" || clause.operator === "not_in"
      ? normalizeList(clause.value, normalizer)
      : normalizeTextValue(clause.value, normalizer);
  return { field: clause.field, operator: clause.operator, value };
}
