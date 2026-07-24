import { describe, expect, it } from "vitest";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { evaluateRuleSet } from "@/modules/segmentation/evaluate-rule-set";
import type { SegmentEvaluationFacts } from "@/modules/segmentation/segment-facts";
import type { SegmentRuleSet } from "@/modules/segmentation/rule-definition";

const now = new Date("2026-07-24T12:00:00.000Z");

function facts(
  patch: Partial<SegmentEvaluationFacts> = {}
): SegmentEvaluationFacts {
  return {
    now,
    registeredAt: new Date("2026-07-20T00:00:00.000Z"),
    registrationElapsed: 6_480,
    source: "organic",
    registrationIp: "203.0.113.10",
    countryCode: "SG",
    checkoutStarted: false,
    paymentStatus: "NONE",
    firstPaidAt: null,
    totalPaidMinor: 0,
    successfulCallCount: 0,
    firstCallAt: null,
    lastCallAt: null,
    lastCallElapsed: null,
    balanceUsdMinor: 0,
    balanceChangedAt: null,
    emptyBalanceElapsed: null,
    anomalyActive: false,
    anomalyChangedAt: null,
    unsubscribed: false,
    paused: false,
    externalUserId: "U-1",
    emailDomain: "example.test",
    ...patch
  };
}

function reorder(
  first: "D" | "E",
  second: "D" | "E"
): SegmentRuleSet {
  const ruleSet = structuredClone(defaultSegmentRuleSet);
  const fixed = ruleSet.groups.filter(
    (group) => !["D", "E"].includes(group.code)
  );
  const insertAt = fixed.findIndex((group) => group.code === "G");
  const byCode = new Map(
    defaultSegmentRuleSet.groups.map((group) => [
      group.code,
      structuredClone(group)
    ])
  );
  fixed.splice(insertAt, 0, byCode.get(first)!, byCode.get(second)!);
  ruleSet.groups = fixed.map((group, index) => ({
    ...group,
    order: index
  }));
  const d = ruleSet.groups.find((group) => group.code === "D")!;
  d.branches = [
    {
      clauses: [
        {
          field: "successfulCallCount",
          operator: "gt",
          value: 0
        }
      ]
    }
  ];
  return ruleSet;
}

describe("mutually exclusive segment evaluation", () => {
  it("uses OR between branches and AND inside each branch", () => {
    const result = evaluateRuleSet(
      facts({
        firstPaidAt: now,
        successfulCallCount: 2,
        anomalyActive: true
      }),
      defaultSegmentRuleSet
    );

    expect(result.segment).toBe("F");
    expect(result.matchedGroups).toContain("F");
    expect(result.reason).toContain("F 组");
  });

  it("selects the first configured match while reporting overlap", () => {
    const overlap = facts({
      firstPaidAt: now,
      successfulCallCount: 4,
      lastCallAt: new Date("2026-07-01T00:00:00.000Z"),
      lastCallElapsed: 33_840,
      balanceUsdMinor: 0,
      balanceChangedAt: new Date("2026-07-01T00:00:00.000Z"),
      emptyBalanceElapsed: 33_840
    });

    const eFirst = evaluateRuleSet(overlap, reorder("E", "D"));
    const dFirst = evaluateRuleSet(overlap, reorder("D", "E"));

    expect(eFirst.segment).toBe("E");
    expect(dFirst.segment).toBe("D");
    expect(eFirst.matchedGroups).toEqual(
      expect.arrayContaining(["D", "E"])
    );
  });

  it("falls back to G when no configured branch matches", () => {
    const result = evaluateRuleSet(
      facts({
        firstPaidAt: now,
        successfulCallCount: 3,
        firstCallAt: now,
        lastCallAt: now,
        lastCallElapsed: 0,
        balanceUsdMinor: 5_000
      }),
      defaultSegmentRuleSet
    );

    expect(result).toMatchObject({
      segment: "G",
      matchedGroups: [],
      matchedBranchByGroup: {}
    });
  });
});
