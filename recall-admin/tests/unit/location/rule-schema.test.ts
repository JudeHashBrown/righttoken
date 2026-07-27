import { describe, expect, it } from "vitest";
import {
  locationRuleInputSchema,
  locationRuleSetSchema
} from "@/modules/location/rule-schema";

describe("location attribution rule schema", () => {
  it("normalizes exact domains and ISO country codes", () => {
    expect(
      locationRuleInputSchema.parse({
        name: " QQ 邮箱 ",
        enabled: true,
        priority: 1,
        matchType: "EXACT_DOMAIN",
        pattern: " QQ.COM ",
        countryCode: "cn"
      })
    ).toMatchObject({
      name: "QQ 邮箱",
      pattern: "qq.com",
      countryCode: "CN"
    });
  });

  it("normalizes international suffixes to ASCII", () => {
    expect(
      locationRuleInputSchema.parse({
        name: "俄罗斯国家域名",
        enabled: true,
        priority: 2,
        matchType: "DOMAIN_SUFFIX",
        pattern: ".РФ",
        countryCode: "RU"
      }).pattern
    ).toBe(".xn--p1ai");
  });

  it("rejects prohibited global suffix mappings", () => {
    expect(() =>
      locationRuleInputSchema.parse({
        name: "错误的美国规则",
        enabled: true,
        priority: 1,
        matchType: "DOMAIN_SUFFIX",
        pattern: ".com",
        countryCode: "US"
      })
    ).toThrow();
  });

  it("rejects duplicate priorities and match patterns", () => {
    const base = {
      name: "规则",
      enabled: true,
      matchType: "EXACT_DOMAIN" as const,
      countryCode: "CN"
    };

    expect(() =>
      locationRuleSetSchema.parse([
        { ...base, priority: 1, pattern: "qq.com" },
        { ...base, priority: 1, pattern: "163.com" }
      ])
    ).toThrow(/priorities/i);

    expect(() =>
      locationRuleSetSchema.parse([
        { ...base, priority: 1, pattern: "QQ.COM" },
        { ...base, priority: 2, pattern: "qq.com" }
      ])
    ).toThrow(/patterns/i);
  });
});

