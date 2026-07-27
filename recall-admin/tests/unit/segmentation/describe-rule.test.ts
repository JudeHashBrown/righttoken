import { describe, expect, it } from "vitest";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import {
  describeClause,
  describeGroupRule
} from "@/modules/segmentation/describe-rule";

describe("segment rule descriptions", () => {
  it("turns stored conditions into operational Chinese", () => {
    expect(
      describeClause({
        field: "balanceUsdMinor",
        operator: "lt",
        value: 50
      })
    ).toBe("余额低于 0.50 美元");
    expect(
      describeClause({
        field: "anomalyActive",
        operator: "eq",
        value: true
      })
    ).toBe("存在服务异常");
    expect(
      describeClause({
        field: "checkoutStarted",
        operator: "eq",
        value: false
      })
    ).toBe("未进入支付流程");
    expect(
      describeClause({
        field: "firstPaidAt",
        operator: "is_null"
      })
    ).toBe("尚未完成首单");
  });

  it("joins AND clauses into one group sentence", () => {
    const dGroup = defaultSegmentRuleSet.groups.find(
      (group) => group.code === "D"
    )!;

    expect(describeGroupRule(dGroup)).toBe(
      "如果已有成功调用，并且余额不少于 0.50 美元，并且超过 7 天未调用，则进入 D 组。"
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
