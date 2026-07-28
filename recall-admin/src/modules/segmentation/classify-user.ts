import type {
  SegmentConfig,
  SegmentDecision,
  SegmentFacts
} from "@/modules/segmentation/types";
import { evaluateRuleSet } from "@/modules/segmentation/evaluate-rule-set";
import { legacySegmentConfigToRuleSet } from "@/modules/segmentation/rule-config";
import type { SegmentRuleSet } from "@/modules/segmentation/rule-definition";
import { buildSegmentFacts } from "@/modules/segmentation/segment-facts";

export function classifyUser(
  facts: SegmentFacts,
  now: Date,
  config: SegmentConfig | SegmentRuleSet
): SegmentDecision {
  if ("schemaVersion" in config) {
    return evaluateRuleSet(buildSegmentFacts(facts, now), config);
  }

  if (facts.anomalyActive) {
    return { segment: "F", reason: "active service anomaly" };
  }

  if (!facts.firstPaidAt) {
    return facts.checkoutStartedAt
      ? {
          segment: "B",
          reason: "checkout started without first payment"
        }
      : {
          segment: "A",
          reason: "registered without checkout or first payment"
        };
  }

  if (facts.successfulCallCount === 0) {
    return {
      segment: "C",
      reason: "paid without successful call"
    };
  }

  if (facts.balanceMinor <= config.emptyBalanceMinor) {
    return { segment: "E", reason: "balance exhausted" };
  }

  if (
    !facts.lastCallAt ||
    now.getTime() - facts.lastCallAt.getTime() >= config.inactiveMs
  ) {
    return {
      segment: "D",
      reason: "inactive with positive balance"
    };
  }

  return { segment: "G", reason: "healthy active user" };
}

export function classifyUserWithLegacyRules(
  facts: SegmentFacts,
  now: Date,
  config: SegmentConfig
): SegmentDecision {
  return evaluateRuleSet(
    buildSegmentFacts(facts, now),
    legacySegmentConfigToRuleSet(config)
  );
}
