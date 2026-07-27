import { describe, expect, it, vi } from "vitest";
import { FallbackGeoIpResolver } from "@/modules/geoip/resolver-chain";
import type { GeoIpResolver } from "@/modules/geoip/types";

function resolver(
  result: Awaited<ReturnType<GeoIpResolver["resolve"]>>
): GeoIpResolver {
  return { resolve: vi.fn(async () => result) };
}

describe("GeoIP resolver fallback chain", () => {
  it("stops at the first resolver that returns a country", async () => {
    const mmdb = resolver({
      countryCode: "HK",
      region: "Hong Kong",
      source: "IP_GEOIP"
    });
    const rir = resolver({
      countryCode: "CN",
      region: null,
      source: "IP_RIR"
    });
    const chain = new FallbackGeoIpResolver([mmdb, rir]);

    await expect(chain.resolve("8.8.8.8")).resolves.toMatchObject({
      countryCode: "HK"
    });
    expect(rir.resolve).not.toHaveBeenCalled();
  });

  it("falls through empty and failing resolvers", async () => {
    const broken: GeoIpResolver = {
      resolve: vi.fn(async () => {
        throw new Error("database unavailable");
      })
    };
    const chain = new FallbackGeoIpResolver([
      broken,
      resolver(null),
      resolver({
        countryCode: "RU",
        region: null,
        source: "IP_RIR"
      })
    ]);

    await expect(chain.resolve("5.8.1.1")).resolves.toMatchObject({
      countryCode: "RU",
      source: "IP_RIR"
    });
  });
});

