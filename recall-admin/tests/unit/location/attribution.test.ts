import { describe, expect, it } from "vitest";
import { resolveOperationalLocation } from "@/modules/location/attribution";
import type { LocationRule } from "@/modules/location/email-domain";

const rules: LocationRule[] = [
  {
    id: "qq",
    enabled: true,
    priority: 1,
    matchType: "EXACT_DOMAIN",
    pattern: "qq.com",
    countryCode: "CN"
  },
  {
    id: "ru",
    enabled: true,
    priority: 2,
    matchType: "DOMAIN_SUFFIX",
    pattern: ".ru",
    countryCode: "RU"
  }
];

describe("operational location attribution", () => {
  it("lets a Chinese provider domain override a Russian IP", () => {
    expect(
      resolveOperationalLocation({
        email: "person@qq.com",
        rules,
        ipLocation: {
          countryCode: "RU",
          region: "Moscow",
          source: "IP_GEOIP"
        }
      })
    ).toEqual({
      countryCode: "CN",
      region: null,
      ipCountryCode: "RU",
      ipRegion: "Moscow",
      source: "EMAIL_EXACT_DOMAIN",
      ruleId: "qq"
    });
  });

  it("uses IP country and region for global email domains", () => {
    expect(
      resolveOperationalLocation({
        email: "person@gmail.com",
        rules,
        ipLocation: {
          countryCode: "HK",
          region: "Hong Kong",
          source: "IP_GEOIP"
        }
      })
    ).toEqual({
      countryCode: "HK",
      region: "Hong Kong",
      ipCountryCode: "HK",
      ipRegion: "Hong Kong",
      source: "IP_GEOIP",
      ruleId: null
    });
  });

  it("lets a country suffix override another IP country", () => {
    expect(
      resolveOperationalLocation({
        email: "person@company.ru",
        rules,
        ipLocation: {
          countryCode: "US",
          region: "California",
          source: "IP_RIR"
        }
      })
    ).toMatchObject({
      countryCode: "RU",
      region: null,
      ipCountryCode: "US",
      ipRegion: "California",
      source: "EMAIL_DOMAIN_SUFFIX",
      ruleId: "ru"
    });
  });

  it("preserves an empty result for the exceptional invalid-data path", () => {
    expect(
      resolveOperationalLocation({
        email: "person@gmail.com",
        rules,
        ipLocation: null
      })
    ).toEqual({
      countryCode: null,
      region: null,
      ipCountryCode: null,
      ipRegion: null,
      source: "INVALID_REGISTRATION_DATA",
      ruleId: null
    });
  });
});

