import { describe, expect, it, vi } from "vitest";
import type { GeoIpResolver } from "@/modules/geoip/types";
import { recalculateStoredUserLocation } from "@/modules/location/recompute-user";

const qqRule = {
  id: "qq",
  enabled: true,
  priority: 1,
  matchType: "EXACT_DOMAIN" as const,
  pattern: "qq.com",
  countryCode: "CN"
};

describe("stored user location recomputation", () => {
  it("reuses stored IP evidence without another lookup", async () => {
    const resolver: GeoIpResolver = {
      resolve: vi.fn(async () => null)
    };
    const result = await recalculateStoredUserLocation(
      {
        email: "person@qq.com",
        registrationIp: "5.8.1.1",
        ipCountryCode: "RU",
        ipRegion: "Moscow"
      },
      [qqRule],
      resolver
    );

    expect(result).toMatchObject({
      countryCode: "CN",
      ipCountryCode: "RU",
      source: "EMAIL_EXACT_DOMAIN"
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("resolves the encrypted registration IP when evidence is missing", async () => {
    const resolver: GeoIpResolver = {
      resolve: vi.fn(async () => ({
        countryCode: "KZ",
        region: "Almaty",
        source: "IP_RIR" as const
      }))
    };
    const result = await recalculateStoredUserLocation(
      {
        email: "person@gmail.com",
        registrationIp: "1.2.3.4",
        ipCountryCode: null,
        ipRegion: null
      },
      [],
      resolver
    );

    expect(result).toMatchObject({
      countryCode: "KZ",
      region: "Almaty",
      source: "IP_RIR"
    });
  });
});
