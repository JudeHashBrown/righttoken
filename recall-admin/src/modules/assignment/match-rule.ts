import { isIP } from "node:net";
import { z } from "zod";
import type {
  AssignmentCondition,
  RuleAssignmentDecision,
  AssignmentRuleInput,
  AssignmentUserContext,
  AssignmentWorkload,
  OperatorWorkload
} from "@/modules/assignment/types";

function ipv4ToBigInt(address: string): bigint | null {
  const parts = address.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d+$/.test(part))
  ) {
    return null;
  }
  const values = parts.map(Number);
  if (values.some((value) => value < 0 || value > 255)) {
    return null;
  }
  return values.reduce(
    (result, value) => (result << 8n) | BigInt(value),
    0n
  );
}

function parseIpv6Groups(section: string): number[] | null {
  if (!section) {
    return [];
  }
  const rawGroups = section.split(":");
  const groups: number[] = [];
  for (const rawGroup of rawGroups) {
    if (rawGroup.includes(".")) {
      const ipv4 = ipv4ToBigInt(rawGroup);
      if (ipv4 === null) {
        return null;
      }
      groups.push(
        Number((ipv4 >> 16n) & 0xffffn),
        Number(ipv4 & 0xffffn)
      );
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(rawGroup)) {
      return null;
    }
    groups.push(Number.parseInt(rawGroup, 16));
  }
  return groups;
}

function ipv6ToBigInt(address: string): bigint | null {
  const doubleColonParts = address.split("::");
  if (doubleColonParts.length > 2) {
    return null;
  }
  const left = parseIpv6Groups(doubleColonParts[0] ?? "");
  const right = parseIpv6Groups(doubleColonParts[1] ?? "");
  if (!left || !right) {
    return null;
  }

  let groups: number[];
  if (doubleColonParts.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) {
      return null;
    }
    groups = [...left, ...Array<number>(missing).fill(0), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) {
    return null;
  }
  return groups.reduce(
    (result, value) => (result << 16n) | BigInt(value),
    0n
  );
}

function ipToBigInt(
  address: string
): { value: bigint; bits: 32 | 128 } | null {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToBigInt(address);
    return value === null ? null : { value, bits: 32 };
  }
  if (version === 6) {
    const value = ipv6ToBigInt(address);
    return value === null ? null : { value, bits: 128 };
  }
  return null;
}

export function isIpInCidr(address: string, cidr: string): boolean {
  const [networkAddress, rawPrefix, extra] = cidr.split("/");
  if (!networkAddress || !rawPrefix || extra !== undefined) {
    return false;
  }
  const addressValue = ipToBigInt(address);
  const networkValue = ipToBigInt(networkAddress);
  const prefix = Number(rawPrefix);
  if (
    !addressValue ||
    !networkValue ||
    addressValue.bits !== networkValue.bits ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > addressValue.bits
  ) {
    return false;
  }
  if (prefix === 0) {
    return true;
  }
  const shift = BigInt(addressValue.bits - prefix);
  return (
    addressValue.value >> shift === networkValue.value >> shift
  );
}

function isValidCidr(cidr: string): boolean {
  const [address, rawPrefix, extra] = cidr.split("/");
  if (!address || !rawPrefix || extra !== undefined) {
    return false;
  }
  const parsed = ipToBigInt(address);
  const prefix = Number(rawPrefix);
  return Boolean(
    parsed &&
      Number.isInteger(prefix) &&
      prefix >= 0 &&
      prefix <= parsed.bits
  );
}

export const assignmentConditionSchema = z
  .object({
    countryCodes: z
      .array(
        z
          .string()
          .length(2)
          .transform((value) => value.toUpperCase())
      )
      .optional(),
    regionIncludes: z.array(z.string().trim().min(1)).optional(),
    ipCidrs: z
      .array(
        z
          .string()
          .trim()
          .refine(isValidCidr, "invalid IP CIDR")
      )
      .optional(),
    languages: z.array(z.string().trim().min(1)).optional(),
    timezones: z.array(z.string().trim().min(1)).optional(),
    sources: z.array(z.string().trim().min(1)).optional(),
    segments: z
      .array(z.enum(["A", "B", "C", "D", "E", "F", "G"]))
      .optional(),
    minTotalPaidMinor: z.number().int().min(0).optional(),
    maxTotalPaidMinor: z.number().int().min(0).optional()
  })
  .strict()
  .refine(
    (value) =>
      value.minTotalPaidMinor === undefined ||
      value.maxTotalPaidMinor === undefined ||
      value.minTotalPaidMinor <= value.maxTotalPaidMinor,
    "minimum paid value cannot exceed maximum"
  );

export const assignmentRuleInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean().default(true),
    memberTerritoryManaged: z.boolean().default(false),
    priority: z.number().int().min(0),
    conditions: assignmentConditionSchema,
    assigneeId: z.string().min(1).nullable().default(null),
    fallbackAssigneeId: z.string().min(1).nullable().default(null),
    poolKey: z.string().trim().min(1).max(80).nullable().default(null),
    workloadLimit: z.number().int().positive().nullable().default(null),
    effectiveFrom: z.coerce.date().nullable().default(null),
    effectiveTo: z.coerce.date().nullable().default(null)
  })
  .strict()
  .refine(
    (rule) =>
      !rule.effectiveFrom ||
      !rule.effectiveTo ||
      rule.effectiveFrom < rule.effectiveTo,
    "effective date range is invalid"
  );

function includesCaseInsensitive(
  values: string[] | undefined,
  actual: string | null
): boolean {
  if (!values?.length) {
    return true;
  }
  if (!actual) {
    return false;
  }
  const normalized = actual.toLowerCase();
  return values.some((value) => value.toLowerCase() === normalized);
}

function matchesCondition(
  user: AssignmentUserContext,
  conditions: AssignmentCondition
): boolean {
  return (
    (!conditions.countryCodes?.length ||
      Boolean(
        user.countryCode &&
          conditions.countryCodes.includes(
            user.countryCode.toUpperCase()
          )
      )) &&
    (!conditions.regionIncludes?.length ||
      Boolean(
        user.region &&
          conditions.regionIncludes.some((part) =>
            user.region?.includes(part)
          )
      )) &&
    (!conditions.ipCidrs?.length ||
      Boolean(
        user.registrationIp &&
          conditions.ipCidrs.some((cidr) =>
            isIpInCidr(user.registrationIp!, cidr)
          )
      )) &&
    includesCaseInsensitive(conditions.languages, user.language) &&
    includesCaseInsensitive(conditions.timezones, user.timezone) &&
    includesCaseInsensitive(conditions.sources, user.source) &&
    (!conditions.segments?.length ||
      conditions.segments.includes(user.segment)) &&
    (conditions.minTotalPaidMinor === undefined ||
      user.totalPaidMinor >= conditions.minTotalPaidMinor) &&
    (conditions.maxTotalPaidMinor === undefined ||
      user.totalPaidMinor <= conditions.maxTotalPaidMinor)
  );
}

function conditionDescriptions(
  user: AssignmentUserContext,
  conditions: AssignmentCondition
): string[] {
  const descriptions: string[] = [];
  if (conditions.countryCodes?.length && user.countryCode) {
    descriptions.push(`国家=${user.countryCode.toUpperCase()}`);
  }
  if (conditions.regionIncludes?.length) {
    descriptions.push(
      `地区包含=${conditions.regionIncludes.join("/")}`
    );
  }
  if (conditions.ipCidrs?.length) {
    descriptions.push(`IP=${conditions.ipCidrs.join("/")}`);
  }
  if (conditions.languages?.length && user.language) {
    descriptions.push(`语言=${user.language}`);
  }
  if (conditions.timezones?.length && user.timezone) {
    descriptions.push(`时区=${user.timezone}`);
  }
  if (conditions.sources?.length && user.source) {
    descriptions.push(`来源=${user.source}`);
  }
  if (conditions.segments?.length) {
    descriptions.push(`分组=${user.segment}`);
  }
  if (conditions.minTotalPaidMinor !== undefined) {
    descriptions.push(`累计支付≥${conditions.minTotalPaidMinor}`);
  }
  if (conditions.maxTotalPaidMinor !== undefined) {
    descriptions.push(`累计支付≤${conditions.maxTotalPaidMinor}`);
  }
  return descriptions;
}

function isAvailable(
  state: OperatorWorkload | undefined,
  limit: number | null
): state is OperatorWorkload {
  return Boolean(
    state?.active &&
      state.withinWorkHours &&
      (limit === null || state.openTaskCount < limit)
  );
}

function workloadLabel(
  state: OperatorWorkload,
  limit: number | null
): string {
  return `${state.openTaskCount}/${limit ?? "不限"}`;
}

export function matchRule(
  user: AssignmentUserContext,
  rules: AssignmentRuleInput[],
  workload: AssignmentWorkload,
  now = new Date(),
  defaultAssigneeId: string | null = null
): RuleAssignmentDecision {
  const defaultDecision = (
    reason: string
  ): RuleAssignmentDecision | null => {
    if (
      !defaultAssigneeId ||
      !isAvailable(workload[defaultAssigneeId], null)
    ) {
      return null;
    }
    return {
      assigneeId: defaultAssigneeId,
      poolKey: "default-owner",
      matchedRuleId: null,
      matchedRuleName: null,
      matchedRulePriority: null,
      usedFallback: true,
      matchedConditions: [],
      assignmentReason: `${reason}；转交系统默认负责人`
    };
  };
  const geographicSpecificity = (
    rule: AssignmentRuleInput
  ): number =>
    rule.conditions.regionIncludes?.length
      ? 2
      : rule.conditions.countryCodes?.length
        ? 1
        : 0;
  const parsedRules = rules
    .map((rule) => assignmentRuleInputSchema.parse(rule))
    .filter(
      (rule) =>
        rule.enabled &&
        (!rule.effectiveFrom || rule.effectiveFrom <= now) &&
        (!rule.effectiveTo || rule.effectiveTo > now)
    )
    .sort(
      (left, right) =>
        geographicSpecificity(right) -
          geographicSpecificity(left) ||
        left.priority - right.priority
    );

  for (const rule of parsedRules) {
    if (!matchesCondition(user, rule.conditions)) {
      continue;
    }
    const descriptions = conditionDescriptions(user, rule.conditions);
    const baseReason =
      `规则“${rule.name}”命中：` +
      (descriptions.length ? descriptions.join("，") : "默认条件");
    const primaryState = rule.assigneeId
      ? workload[rule.assigneeId]
      : undefined;
    if (
      rule.assigneeId &&
      isAvailable(primaryState, rule.workloadLimit)
    ) {
      return {
        assigneeId: rule.assigneeId,
        poolKey: rule.poolKey ?? "public",
        matchedRuleId: rule.id ?? null,
        matchedRuleName: rule.name,
        matchedRulePriority: rule.priority,
        usedFallback: false,
        matchedConditions: descriptions,
        assignmentReason:
          `${baseReason}；负责人当前未完成任务 ` +
          workloadLabel(primaryState, rule.workloadLimit)
      };
    }

    const fallbackState = rule.fallbackAssigneeId
      ? workload[rule.fallbackAssigneeId]
      : undefined;
    if (
      rule.fallbackAssigneeId &&
      isAvailable(fallbackState, rule.workloadLimit)
    ) {
      return {
        assigneeId: rule.fallbackAssigneeId,
        poolKey: rule.poolKey ?? "public",
        matchedRuleId: rule.id ?? null,
        matchedRuleName: rule.name,
        matchedRulePriority: rule.priority,
        usedFallback: true,
        matchedConditions: descriptions,
        assignmentReason:
          `${baseReason}；主负责人不可用，转交备用负责人；` +
          `备用负责人当前未完成任务 ` +
          workloadLabel(fallbackState, rule.workloadLimit)
      };
    }

    return (
      defaultDecision(`${baseReason}；规则负责人当前不可用`) ?? {
      assigneeId: null,
      poolKey: rule.poolKey ?? "public",
      matchedRuleId: rule.id ?? null,
      matchedRuleName: rule.name,
      matchedRulePriority: rule.priority,
      usedFallback: false,
      matchedConditions: descriptions,
      assignmentReason: `${baseReason}；进入公共池`
      }
    );
  }

  return (
    defaultDecision("没有规则命中") ?? {
    assigneeId: null,
    poolKey: "public",
    matchedRuleId: null,
    matchedRuleName: null,
    matchedRulePriority: null,
    usedFallback: false,
    matchedConditions: [],
    assignmentReason: "没有规则命中；进入公共池"
    }
  );
}
