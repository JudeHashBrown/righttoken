import { describe, expect, it } from "vitest";
import {
  assignmentConditionSchema,
  matchRule
} from "@/modules/assignment/match-rule";
import type {
  AssignmentRuleInput,
  AssignmentUserContext,
  AssignmentWorkload
} from "@/modules/assignment/types";

function rule(
  priority: number,
  conditions: AssignmentRuleInput["conditions"],
  assigneeId: string | null,
  options: Partial<AssignmentRuleInput> = {}
): AssignmentRuleInput {
  return {
    name: `规则 ${priority}`,
    enabled: true,
    priority,
    conditions,
    assigneeId,
    fallbackAssigneeId: null,
    poolKey: null,
    workloadLimit: null,
    effectiveFrom: null,
    effectiveTo: null,
    ...options
  };
}

function user(
  overrides: Partial<AssignmentUserContext> = {}
): AssignmentUserContext {
  return {
    userId: "user-test",
    countryCode: null,
    region: null,
    registrationIp: null,
    language: null,
    timezone: null,
    source: null,
    segment: "A",
    totalPaidMinor: 0,
    ...overrides
  };
}

function workload(
  overrides: AssignmentWorkload = {}
): AssignmentWorkload {
  return overrides;
}

describe("ordered assignment rule matching", () => {
  it("assigns unmatched users to the system default owner", () => {
    expect(
      matchRule(
        user({ countryCode: "ZZ" }),
        [],
        {
          "primary-admin": {
            active: true,
            withinWorkHours: true,
            openTaskCount: 3
          }
        },
        new Date("2026-07-25T00:00:00.000Z"),
        "primary-admin"
      )
    ).toMatchObject({
      assigneeId: "primary-admin",
      poolKey: "default-owner",
      usedFallback: true,
      assignmentReason: expect.stringContaining("系统默认负责人")
    });
  });

  const rules = [
    rule(
      10,
      { countryCodes: ["US"], segments: ["B"] },
      "us-operator",
      { name: "美国 B 组", workloadLimit: 20 }
    ),
    rule(
      20,
      { regionIncludes: ["广东"] },
      "south-operator",
      { name: "华南用户" }
    ),
    rule(999, {}, null, { name: "公共池", poolKey: "public" })
  ];
  const availableWorkload = workload({
    "us-operator": {
      active: true,
      withinWorkHours: true,
      openTaskCount: 6
    },
    "south-operator": {
      active: true,
      withinWorkHours: true,
      openTaskCount: 0
    }
  });

  it("uses the first complete country and segment match", () => {
    expect(
      matchRule(
        user({ countryCode: "US", segment: "B" }),
        rules,
        availableWorkload
      )
    ).toMatchObject({
      assigneeId: "us-operator",
      matchedRulePriority: 10
    });
  });

  it("matches a partial region name in priority order", () => {
    expect(
      matchRule(
        user({ countryCode: "CN", region: "广东省深圳市" }),
        rules,
        availableWorkload
      )
    ).toMatchObject({
      assigneeId: "south-operator",
      matchedRulePriority: 20
    });
  });

  it("prefers a province or region owner over a country owner", () => {
    const geographicRules = [
      rule(1, { countryCodes: ["CN"] }, "china-owner", {
        name: "中国负责人"
      }),
      rule(20, { regionIncludes: ["广东"] }, "guangdong-owner", {
        name: "广东负责人"
      })
    ];
    const geographicWorkload = workload({
      "china-owner": {
        active: true,
        withinWorkHours: true,
        openTaskCount: 0
      },
      "guangdong-owner": {
        active: true,
        withinWorkHours: true,
        openTaskCount: 0
      }
    });

    expect(
      matchRule(
        user({ countryCode: "CN", region: "广东省" }),
        geographicRules,
        geographicWorkload
      )
    ).toMatchObject({
      assigneeId: "guangdong-owner",
      matchedRulePriority: 20
    });
  });

  it("matches IP CIDR, language, timezone, source, and value range", () => {
    const strictRule = rule(
      1,
      {
        ipCidrs: ["203.0.113.0/24"],
        languages: ["zh-CN"],
        timezones: ["Asia/Shanghai"],
        sources: ["partner-a"],
        minTotalPaidMinor: 1_000,
        maxTotalPaidMinor: 10_000
      },
      "specialist"
    );

    expect(
      matchRule(
        user({
          registrationIp: "203.0.113.42",
          language: "zh-CN",
          timezone: "Asia/Shanghai",
          source: "partner-a",
          totalPaidMinor: 5_000
        }),
        [strictRule],
        workload({
          specialist: {
            active: true,
            withinWorkHours: true,
            openTaskCount: 1
          }
        })
      )
    ).toMatchObject({ assigneeId: "specialist" });

    expect(
      matchRule(
        user({
          registrationIp: "203.0.114.42",
          language: "zh-CN",
          timezone: "Asia/Shanghai",
          source: "partner-a",
          totalPaidMinor: 5_000
        }),
        [strictRule],
        {}
      )
    ).toMatchObject({ assigneeId: null, poolKey: "public" });
  });

  it.each([
    {
      active: true,
      withinWorkHours: false,
      openTaskCount: 2
    },
    {
      active: true,
      withinWorkHours: true,
      openTaskCount: 5
    }
  ])(
    "uses the fallback when the primary operator is unavailable",
    (primaryState) => {
      const fallbackRule = rule(1, {}, "primary", {
        fallbackAssigneeId: "backup",
        workloadLimit: 5
      });
      expect(
        matchRule(user(), [fallbackRule], {
          primary: primaryState,
          backup: {
            active: true,
            withinWorkHours: true,
            openTaskCount: 1
          }
        })
      ).toMatchObject({
        assigneeId: "backup",
        usedFallback: true
      });
    }
  );

  it("uses the public pool when no healthy target or rule is available", () => {
    expect(
      matchRule(user(), [rule(1, {}, "inactive")], {
        inactive: {
          active: false,
          withinWorkHours: true,
          openTaskCount: 0
        }
      })
    ).toMatchObject({
      assigneeId: null,
      poolKey: "public",
      matchedRulePriority: 1
    });
    expect(matchRule(user(), [], {})).toMatchObject({
      assigneeId: null,
      poolKey: "public",
      matchedRulePriority: null
    });
  });

  it("rejects invalid CIDR and conflicting value bounds", () => {
    expect(() =>
      assignmentConditionSchema.parse({
        ipCidrs: ["203.0.113.99/99"]
      })
    ).toThrow();
    expect(() =>
      assignmentConditionSchema.parse({
        minTotalPaidMinor: 5_000,
        maxTotalPaidMinor: 1_000
      })
    ).toThrow();
  });
});
