import { z } from "zod";
import type { TransactionClient } from "@/lib/db/transaction";
import type { SegmentConfig } from "@/modules/segmentation/types";

export const defaultSegmentConfig: SegmentConfig = {
  emptyBalanceMinor: 0,
  inactiveMs: 7 * 24 * 60 * 60 * 1000
};

export const segmentConfigSchema = z.object({
  emptyBalanceMinor: z.number().int(),
  inactiveMs: z.number().int().positive()
});

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
