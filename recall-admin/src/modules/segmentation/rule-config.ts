import { z } from "zod";
import type { TransactionClient } from "@/lib/db/transaction";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import {
  segmentRuleSetSchema,
  type SegmentRuleSet
} from "@/modules/segmentation/rule-definition";
import type { SegmentConfig } from "@/modules/segmentation/types";

export const defaultSegmentConfig: SegmentConfig = {
  emptyBalanceMinor: 0,
  inactiveMs: 7 * 24 * 60 * 60 * 1000,
  registrationUnpaidMs: 2 * 60 * 60 * 1000,
  checkoutUnpaidMs: 30 * 60 * 1000,
  paidWithoutCallMs: 24 * 60 * 60 * 1000,
  emptyBalanceReminderMs: 3 * 24 * 60 * 60 * 1000
};

export const segmentConfigSchema = z.object({
  emptyBalanceMinor: z.number().int(),
  inactiveMs: z.number().int().positive(),
  registrationUnpaidMs: z
    .number()
    .int()
    .positive()
    .default(defaultSegmentConfig.registrationUnpaidMs!),
  checkoutUnpaidMs: z
    .number()
    .int()
    .positive()
    .default(defaultSegmentConfig.checkoutUnpaidMs!),
  paidWithoutCallMs: z
    .number()
    .int()
    .positive()
    .default(defaultSegmentConfig.paidWithoutCallMs!),
  emptyBalanceReminderMs: z
    .number()
    .int()
    .positive()
    .default(defaultSegmentConfig.emptyBalanceReminderMs!)
});

function cloneDefaultRuleSet(): SegmentRuleSet {
  return structuredClone(defaultSegmentRuleSet);
}

export function legacySegmentConfigToRuleSet(
  input: SegmentConfig
): SegmentRuleSet {
  const ruleSet = cloneDefaultRuleSet();
  const dGroup = ruleSet.groups.find((group) => group.code === "D")!;
  const eGroup = ruleSet.groups.find((group) => group.code === "E")!;
  const aGroup = ruleSet.groups.find((group) => group.code === "A")!;
  const bGroup = ruleSet.groups.find((group) => group.code === "B")!;
  const cGroup = ruleSet.groups.find((group) => group.code === "C")!;

  dGroup.branches[0]!.clauses = dGroup.branches[0]!.clauses.map(
    (clause) =>
      clause.field === "lastCallElapsed"
        ? {
            field: "lastCallElapsed",
            operator: "gte",
            value: input.inactiveMs / 60_000,
            unit: "minutes"
          }
        : clause
  );
  eGroup.branches[0]!.clauses = eGroup.branches[0]!.clauses.map(
    (clause) =>
      clause.field === "balanceUsdMinor"
        ? {
            field: "balanceUsdMinor",
            operator: "lte",
            value: input.emptyBalanceMinor
          }
        : clause
  );
  aGroup.taskPolicy.delayMinutes =
    (input.registrationUnpaidMs ?? defaultSegmentConfig.registrationUnpaidMs!) /
    60_000;
  bGroup.taskPolicy.delayMinutes =
    (input.checkoutUnpaidMs ?? defaultSegmentConfig.checkoutUnpaidMs!) /
    60_000;
  cGroup.taskPolicy.delayMinutes =
    (input.paidWithoutCallMs ?? defaultSegmentConfig.paidWithoutCallMs!) /
    60_000;
  eGroup.taskPolicy.delayMinutes =
    (input.emptyBalanceReminderMs ??
      defaultSegmentConfig.emptyBalanceReminderMs!) / 60_000;
  return segmentRuleSetSchema.parse(ruleSet);
}

export function parseSegmentRuleConfig(value: unknown): SegmentRuleSet {
  const current = segmentRuleSetSchema.safeParse(value);
  if (current.success) {
    return current.data;
  }
  const legacy = segmentConfigSchema.safeParse(value);
  return legacy.success
    ? legacySegmentConfigToRuleSet(legacy.data)
    : cloneDefaultRuleSet();
}

export async function loadActiveSegmentRuleSet(
  tx: TransactionClient
): Promise<{ config: SegmentRuleSet; version: number }> {
  const activeRule = await tx.automationRuleVersion.findFirst({
    where: { kind: "segmentation", active: true },
    orderBy: { version: "desc" }
  });
  return {
    config: activeRule
      ? parseSegmentRuleConfig(activeRule.config)
      : cloneDefaultRuleSet(),
    version: activeRule?.version ?? 1
  };
}

export async function loadActiveSegmentRule(
  tx: TransactionClient
): Promise<{ config: SegmentConfig; version: number }> {
  const activeRule = await tx.automationRuleVersion.findFirst({
    where: { kind: "segmentation", active: true },
    orderBy: { version: "desc" }
  });
  const parsedConfig = activeRule
    ? segmentConfigSchema.safeParse(activeRule.config)
    : null;

  return {
    config:
      parsedConfig?.success === true
        ? parsedConfig.data
        : defaultSegmentConfig,
    version: activeRule?.version ?? 1
  };
}
