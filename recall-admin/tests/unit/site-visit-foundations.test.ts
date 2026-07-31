import { describe, expect, it } from "vitest";
import {
  normalizeVisitGeography,
  presentCountry
} from "@/modules/visits/geography";
import { toShanghaiVisitDate } from "@/modules/visits/visit-date";

describe("site visit foundations", () => {
  it("uses the Asia/Shanghai calendar day", () => {
    expect(
      toShanghaiVisitDate(
        new Date("2026-07-31T16:30:00.000Z")
      ).toISOString()
    ).toBe("2026-08-01T00:00:00.000Z");
  });

  it("normalizes mainland China regions to stable short names", () => {
    expect(
      normalizeVisitGeography({
        countryCode: "cn",
        region: "广西壮族自治区"
      })
    ).toEqual({
      countryCode: "CN",
      region: "广西"
    });
    expect(
      normalizeVisitGeography({
        countryCode: "CN",
        region: "北京市"
      })
    ).toEqual({
      countryCode: "CN",
      region: "北京"
    });
  });

  it("keeps Hong Kong, Macao and Taiwan outside mainland regions", () => {
    expect(
      normalizeVisitGeography({
        countryCode: "HK",
        region: "Hong Kong"
      })
    ).toEqual({
      countryCode: "HK",
      region: null
    });
    expect(presentCountry("HK")).toBe("中国香港");
    expect(presentCountry("MO")).toBe("中国澳门");
    expect(presentCountry("TW")).toBe("中国台湾");
  });

  it("uses an explicit unknown geography bucket", () => {
    expect(normalizeVisitGeography(null)).toEqual({
      countryCode: "ZZ",
      region: null
    });
    expect(presentCountry("ZZ")).toBe("未知");
  });
});
