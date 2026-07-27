import { describe, expect, it } from "vitest";
import {
  matchEmailLocation,
  normalizeEmailDomain,
  type LocationRule
} from "@/modules/location/email-domain";

function rule(
  overrides: Partial<LocationRule> = {}
): LocationRule {
  return {
    id: "rule-1",
    enabled: true,
    priority: 1,
    matchType: "EXACT_DOMAIN",
    pattern: "qq.com",
    countryCode: "CN",
    ...overrides
  };
}

describe("email-domain operational location matching", () => {
  it("normalizes case, whitespace and international domains", () => {
    expect(normalizeEmailDomain(" User@Почта.РФ ")).toBe(
      "xn--80a1acny.xn--p1ai"
    );
  });

  it("returns null for malformed email addresses", () => {
    expect(normalizeEmailDomain("not-an-email")).toBeNull();
    expect(normalizeEmailDomain("user@")).toBeNull();
  });

  it("matches an exact provider domain before a suffix rule", () => {
    const result = matchEmailLocation("mail.kz", [
      rule({
        id: "suffix",
        matchType: "DOMAIN_SUFFIX",
        pattern: ".kz",
        countryCode: "KZ",
        priority: 1
      }),
      rule({
        id: "exact",
        pattern: "mail.kz",
        countryCode: "RU",
        priority: 99
      })
    ]);

    expect(result).toEqual({
      ruleId: "exact",
      countryCode: "RU",
      source: "EMAIL_EXACT_DOMAIN"
    });
  });

  it("matches suffixes only on a DNS label boundary", () => {
    const suffix = rule({
      id: "ru-suffix",
      matchType: "DOMAIN_SUFFIX",
      pattern: ".ru",
      countryCode: "RU"
    });

    expect(matchEmailLocation("company.ru", [suffix])?.countryCode).toBe(
      "RU"
    );
    expect(matchEmailLocation("fakeru.com", [suffix])).toBeNull();
  });

  it("ignores disabled rules and prohibited global suffixes", () => {
    expect(
      matchEmailLocation("gmail.com", [
        rule({
          matchType: "DOMAIN_SUFFIX",
          pattern: ".com",
          countryCode: "US"
        }),
        rule({ enabled: false, pattern: "gmail.com", countryCode: "US" })
      ])
    ).toBeNull();
  });
});

