import { describe, expect, it } from "vitest";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { parseSegmentRuleConfig } from "@/modules/segmentation/rule-config";

describe("segment rule config compatibility", () => {
  it("upgrades the previously published F rule without replacing other groups", () => {
    const previous = structuredClone(defaultSegmentRuleSet);
    const fGroup = previous.groups.find((group) => group.code === "F")!;
    const aGroup = previous.groups.find((group) => group.code === "A")!;
    fGroup.branches = [
      {
        clauses: [
          {
            field: "anomalyActive",
            operator: "eq",
            value: true
          }
        ]
      }
    ];
    aGroup.annotation = "保留主管理员已经发布的 A 组说明";

    const parsed = parseSegmentRuleConfig(previous);

    expect(
      parsed.groups.find((group) => group.code === "F")?.branches
    ).toEqual(
      defaultSegmentRuleSet.groups.find((group) => group.code === "F")
        ?.branches
    );
    expect(
      parsed.groups.find((group) => group.code === "A")?.annotation
    ).toBe("保留主管理员已经发布的 A 组说明");
  });
});
