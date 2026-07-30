import { describe, expect, it } from "vitest";
import type { AssignmentRuleInput } from "@/modules/assignment/types";
import {
  assertNoTerritoryConflict,
  mergeMemberTerritories,
  territoriesForMember
} from "@/modules/assignment/member-territories";

function rule(
  input: Partial<AssignmentRuleInput> & {
    id: string;
    assigneeId: string | null;
  }
): AssignmentRuleInput {
  return {
    id: input.id,
    name: input.name ?? input.id,
    enabled: input.enabled ?? true,
    priority: input.priority ?? 1,
    conditions: input.conditions ?? {},
    assigneeId: input.assigneeId,
    fallbackAssigneeId: input.fallbackAssigneeId ?? null,
    poolKey: input.poolKey ?? null,
    workloadLimit: input.workloadLimit ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    memberTerritoryManaged:
      input.memberTerritoryManaged ?? false
  };
}

describe("member territories", () => {
  const advancedRule = rule({
    id: "advanced-rule",
    assigneeId: "operator-1",
    conditions: {
      countryCodes: ["US"],
      segments: ["B"]
    }
  });
  const oldManagedRule = rule({
    id: "old-managed",
    assigneeId: "operator-1",
    priority: 2,
    conditions: {
      countryCodes: ["CN"],
      regionIncludes: ["旧地区"]
    },
    memberTerritoryManaged: true
  });
  const anotherMemberRule = rule({
    id: "other-managed",
    assigneeId: "operator-2",
    priority: 3,
    conditions: { countryCodes: ["BY"] },
    memberTerritoryManaged: true
  });

  it("keeps unrelated rules while replacing one member's territories", () => {
    const merged = mergeMemberTerritories(
      "operator-1",
      [
        { countryCode: "CN", regions: ["广东", "广西"] },
        { countryCode: "RU", regions: [] }
      ],
      [advancedRule, oldManagedRule, anotherMemberRule]
    );

    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "advanced-rule" }),
        expect.objectContaining({ id: "other-managed" }),
        expect.objectContaining({
          assigneeId: "operator-1",
          memberTerritoryManaged: true,
          conditions: {
            countryCodes: ["CN"],
            regionIncludes: ["广东", "广西"]
          }
        }),
        expect.objectContaining({
          assigneeId: "operator-1",
          memberTerritoryManaged: true,
          conditions: { countryCodes: ["RU"] }
        })
      ])
    );
    expect(
      merged.some((item) => item.id === "old-managed")
    ).toBe(false);
    expect(merged.map((item) => item.priority)).toEqual([
      1, 2, 3, 4
    ]);
  });

  it("extracts only member-managed territory rules", () => {
    expect(
      territoriesForMember("operator-1", [
        advancedRule,
        oldManagedRule,
        anotherMemberRule
      ])
    ).toEqual([
      { countryCode: "CN", regions: ["旧地区"] }
    ]);
  });

  it("rejects the same region assigned to two primary owners", () => {
    expect(() =>
      assertNoTerritoryConflict([
        rule({
          id: "cn-a",
          assigneeId: "operator-1",
          conditions: {
            countryCodes: ["CN"],
            regionIncludes: ["广东"]
          },
          memberTerritoryManaged: true
        }),
        rule({
          id: "cn-b",
          assigneeId: "operator-2",
          conditions: {
            countryCodes: ["CN"],
            regionIncludes: ["广东"]
          },
          memberTerritoryManaged: true
        })
      ])
    ).toThrow("TERRITORY_CONFLICT");
  });
});
