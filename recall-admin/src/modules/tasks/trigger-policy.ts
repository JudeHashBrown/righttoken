import { classifyUser } from "@/modules/segmentation/classify-user";
import type {
  SegmentCode,
  SegmentConfig,
  SegmentFacts
} from "@/modules/segmentation/types";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type TriggerPolicy = {
  enabled: boolean;
  delayMinutes: number;
  priority: "URGENT" | "IMPORTANT" | "NORMAL";
  dueMinutesAfterCreation: number;
  templateKey: string | null;
};

const triggerPolicies: Record<SegmentCode, TriggerPolicy> = {
  A: {
    enabled: true,
    delayMinutes: 2 * 60,
    priority: "NORMAL",
    dueMinutesAfterCreation: 24 * 60,
    templateKey: "registration-unpaid"
  },
  B: {
    enabled: true,
    delayMinutes: 30,
    priority: "IMPORTANT",
    dueMinutesAfterCreation: 2 * 60,
    templateKey: "checkout-unpaid"
  },
  C: {
    enabled: true,
    delayMinutes: 24 * 60,
    priority: "IMPORTANT",
    dueMinutesAfterCreation: 2 * 60,
    templateKey: "paid-no-call"
  },
  D: {
    enabled: true,
    delayMinutes: 0,
    priority: "NORMAL",
    dueMinutesAfterCreation: 24 * 60,
    templateKey: "inactive-balance"
  },
  E: {
    enabled: true,
    delayMinutes: 3 * 24 * 60,
    priority: "NORMAL",
    dueMinutesAfterCreation: 24 * 60,
    templateKey: "balance-exhausted"
  },
  F: {
    enabled: true,
    delayMinutes: 0,
    priority: "URGENT",
    dueMinutesAfterCreation: 30,
    templateKey: "service-anomaly"
  },
  G: {
    enabled: false,
    delayMinutes: 0,
    priority: "NORMAL",
    dueMinutesAfterCreation: 0,
    templateKey: null
  }
};

export function getTriggerPolicy(segment: SegmentCode): TriggerPolicy {
  return triggerPolicies[segment];
}

export type TemporalBoundary = {
  runAt: Date;
  expectedSegment: SegmentCode;
  expectedFactTimestamp: string;
  reasonKey: string;
};

function at(source: Date, delayMs: number): Date {
  return new Date(source.getTime() + delayMs);
}

export function getNextTemporalBoundary(
  facts: SegmentFacts,
  now: Date,
  config: SegmentConfig
): TemporalBoundary | null {
  const segment = classifyUser(facts, now, config).segment;

  switch (segment) {
    case "A":
      return {
        runAt: at(facts.registeredAt, 2 * HOUR_MS),
        expectedSegment: "A",
        expectedFactTimestamp: facts.registeredAt.toISOString(),
        reasonKey: "registration_unpaid"
      };
    case "B":
      if (!facts.checkoutStartedAt) {
        return null;
      }
      return {
        runAt: at(facts.checkoutStartedAt, 30 * MINUTE_MS),
        expectedSegment: "B",
        expectedFactTimestamp: facts.checkoutStartedAt.toISOString(),
        reasonKey: "checkout_unpaid"
      };
    case "C":
      if (!facts.firstPaidAt) {
        return null;
      }
      return {
        runAt: at(facts.firstPaidAt, DAY_MS),
        expectedSegment: "C",
        expectedFactTimestamp: facts.firstPaidAt.toISOString(),
        reasonKey: "paid_without_call"
      };
    case "D":
      return {
        runAt: now,
        expectedSegment: "D",
        expectedFactTimestamp: (
          facts.lastCallAt ?? now
        ).toISOString(),
        reasonKey: "inactive_with_balance"
      };
    case "E":
      return {
        runAt: at(facts.balanceChangedAt ?? now, 3 * DAY_MS),
        expectedSegment: "E",
        expectedFactTimestamp: (
          facts.balanceChangedAt ?? now
        ).toISOString(),
        reasonKey: "balance_exhausted"
      };
    case "F":
      return {
        runAt: now,
        expectedSegment: "F",
        expectedFactTimestamp: (
          facts.anomalyChangedAt ?? now
        ).toISOString(),
        reasonKey: "active_anomaly"
      };
    case "G":
      if (!facts.lastCallAt) {
        return null;
      }
      return {
        runAt: at(facts.lastCallAt, config.inactiveMs),
        expectedSegment: "G",
        expectedFactTimestamp: facts.lastCallAt.toISOString(),
        reasonKey: "inactivity_boundary"
      };
  }
}
