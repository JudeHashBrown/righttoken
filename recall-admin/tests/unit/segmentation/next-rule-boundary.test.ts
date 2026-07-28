import { describe, expect, it } from "vitest";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { getNextRuleBoundary } from "@/modules/segmentation/next-rule-boundary";
import type { SegmentFacts } from "@/modules/segmentation/types";

const now = new Date("2026-07-23T10:00:00.000Z");
const base: SegmentFacts = {
  registeredAt: new Date("2026-07-23T09:00:00.000Z"),
  checkoutStartedAt: null,
  firstPaidAt: null,
  successfulCallCount: 0,
  lastCallAt: null,
  balanceMinor: 0,
  balanceUsdMinor: 0,
  balanceChangedAt: null,
  anomalyActive: false,
  anomalyChangedAt: null
};

describe("next structured-rule boundary", () => {
  it("schedules the configured A task from registration time", () => {
    expect(
      getNextRuleBoundary(base, defaultSegmentRuleSet, 4, now)
    ).toEqual({
      userId: undefined,
      ruleVersion: 4,
      runAt: new Date("2026-07-23T11:00:00.000Z"),
      boundaryKey: "task:A:2026-07-23T09:00:00.000Z",
      purpose: "TASK",
      expectedSegment: "A"
    });
  });

  it("schedules G for the future D inactivity threshold", () => {
    const lastCallAt = new Date("2026-07-23T09:00:00.000Z");
    const healthy = {
      ...base,
      externalUserId: "healthy-user",
      firstPaidAt: new Date("2026-07-20T00:00:00.000Z"),
      successfulCallCount: 3,
      firstCallAt: new Date("2026-07-20T01:00:00.000Z"),
      lastCallAt,
      balanceMinor: 5_000,
      balanceUsdMinor: 5_000
    };

    expect(
      getNextRuleBoundary(healthy, defaultSegmentRuleSet, 4, now)
    ).toMatchObject({
      runAt: new Date("2026-07-30T09:00:00.000Z"),
      purpose: "RULE",
      boundaryKey: expect.stringContaining("lastCallElapsed")
    });
  });

  it("keeps F immediate and urgent", () => {
    const anomalyAt = new Date("2026-07-23T09:59:00.000Z");

    expect(
      getNextRuleBoundary(
        {
          ...base,
          anomalyActive: true,
          anomalyChangedAt: anomalyAt
        },
        defaultSegmentRuleSet,
        4,
        now
      )
    ).toMatchObject({
      runAt: now,
      purpose: "TASK",
      expectedSegment: "F"
    });
  });
});
