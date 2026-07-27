import { describe, expect, it } from "vitest";
import type { GeoIpResolver } from "@/modules/geoip/types";
import type { LocationRule } from "@/modules/location/email-domain";
import { resolveRegistrationAttribution } from "@/modules/users/registration-attribution";

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

function resolver(
  value: Awaited<ReturnType<GeoIpResolver["resolve"]>>
): GeoIpResolver {
  return { resolve: async () => value };
}

describe("registration operational location attribution", () => {
  it("stores Russian IP evidence while assigning QQ email to China", async () => {
    await expect(
      resolveRegistrationAttribution(
        {
          email: "customer@qq.com",
          registration_ip: "5.8.1.1"
        },
        resolver({
          countryCode: "RU",
          region: "Moscow",
          source: "IP_GEOIP"
        }),
        rules
      )
    ).resolves.toEqual({
      countryCode: "CN",
      region: null,
      ipCountryCode: "RU",
      ipRegion: "Moscow",
      source: "EMAIL_EXACT_DOMAIN",
      ruleId: "qq"
    });
  });

  it("keeps Hong Kong IP attribution for a generic email", async () => {
    await expect(
      resolveRegistrationAttribution(
        {
          email: "customer@gmail.com",
          registration_ip: "1.1.1.1"
        },
        resolver({
          countryCode: "HK",
          region: "Hong Kong",
          source: "IP_GEOIP"
        }),
        rules
      )
    ).resolves.toMatchObject({
      countryCode: "HK",
      region: "Hong Kong",
      source: "IP_GEOIP"
    });
  });

  it("uses trusted event geography only when local lookup fails", async () => {
    await expect(
      resolveRegistrationAttribution(
        {
          email: "customer@example.com",
          registration_ip: "8.8.8.8",
          country_code: "US",
          region: "California"
        },
        {
          resolve: async () => {
            throw new Error("database unavailable");
          }
        },
        rules
      )
    ).resolves.toMatchObject({
      countryCode: "US",
      region: "California",
      source: "IP_EVENT"
    });
  });
});

