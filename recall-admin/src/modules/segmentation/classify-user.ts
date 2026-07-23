import type {
  SegmentConfig,
  SegmentDecision,
  SegmentFacts
} from "@/modules/segmentation/types";

export function classifyUser(
  facts: SegmentFacts,
  now: Date,
  config: SegmentConfig
): SegmentDecision {
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
