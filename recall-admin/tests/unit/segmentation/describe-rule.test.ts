import { describe, expect, it } from "vitest";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import {
  describeClause,
  describeGroupRule
} from "@/modules/segmentation/describe-rule";

describe("segment rule descriptions", () => {
  it("describes typed conditions in Chinese", () => {
    expect(
      describeClause({
        field: "balanceUsdMinor",
        operator: "lt",
        value: 50
      })
    ).toBe("美元等值余额（美分）小于 50");
  });

  it("joins AND clauses into one group sentence", () => {
    const dGroup = defaultSegmentRuleSet.groups.find(
      (group) => group.code === "D"
    )!;

    expect(describeGroupRule(dGroup)).toBe(
      "如果成功调用次数大于 0，并且美元等值余额（美分）大于等于 50，并且距离最后调用时间大于等于 7 天，则进入 D 组。"
    );
  });

  it("describes G as the unconditional fallback", () => {
    const gGroup = defaultSegmentRuleSet.groups.find(
      (group) => group.code === "G"
    )!;

    expect(describeGroupRule(gGroup)).toBe(
      "如果前面的分组均未命中，则进入 G 组。"
    );
  });
});
