import { describe, expect, it } from "vitest";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { segmentRuleSetSchema } from "@/modules/segmentation/rule-definition";

describe("structured segment rule definition", () => {
  it("accepts the fixed F, ordered A–E, G structure", () => {
    const parsed = segmentRuleSetSchema.parse(defaultSegmentRuleSet);

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.groups.map((group) => group.code)).toEqual([
      "F",
      "B",
      "A",
      "C",
      "E",
      "D",
      "G"
    ]);
  });

  it("rejects a conditional G fallback", () => {
    const invalid = {
      ...defaultSegmentRuleSet,
      groups: defaultSegmentRuleSet.groups.map((group) =>
        group.code === "G"
          ? {
              ...group,
              branches: [
                {
                  clauses: [
                    {
                      field: "anomalyActive",
                      operator: "eq",
                      value: true
                    }
                  ]
                }
              ]
            }
          : group
      )
    };

    expect(() => segmentRuleSetSchema.parse(invalid)).toThrow();
  });

  it("rejects downgrading or delaying F task handling", () => {
    const invalid = {
      ...defaultSegmentRuleSet,
      groups: defaultSegmentRuleSet.groups.map((group) =>
        group.code === "F"
          ? {
              ...group,
              taskPolicy: {
                ...group.taskPolicy,
                delayMinutes: 30,
                priority: "NORMAL"
              }
            }
          : group
      )
    };

    expect(() => segmentRuleSetSchema.parse(invalid)).toThrow();
  });

  it("requires every fixed code exactly once", () => {
    const invalid = {
      ...defaultSegmentRuleSet,
      groups: defaultSegmentRuleSet.groups.filter(
        (group) => group.code !== "D"
      )
    };

    expect(() => segmentRuleSetSchema.parse(invalid)).toThrow();
  });
});
