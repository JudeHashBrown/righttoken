import { describe, expect, it, vi } from "vitest";
import { MmdbGeoIpResolver } from "@/modules/geoip/mmdb-resolver";

describe("local MMDB GeoIP resolver", () => {
  it("reads country and first subdivision and reuses one reader", async () => {
    const get = vi.fn(() => ({
      country: { iso_code: "ru" },
      subdivisions: [
        { names: { "zh-CN": "莫斯科", en: "Moscow" } }
      ]
    }));
    const loadReader = vi.fn(async () => ({ get }));
    const resolver = new MmdbGeoIpResolver(
      "/data/GeoLite2-City.mmdb",
      loadReader
    );

    await expect(resolver.resolve("8.8.8.8")).resolves.toEqual({
      countryCode: "RU",
      region: "莫斯科",
      source: "IP_GEOIP"
    });
    await resolver.resolve("1.1.1.1");

    expect(loadReader).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not open the database for invalid or private IPs", async () => {
    const loadReader = vi.fn();
    const resolver = new MmdbGeoIpResolver("/data/city.mmdb", loadReader);

    await expect(resolver.resolve("127.0.0.1")).resolves.toBeNull();
    await expect(resolver.resolve("not-an-ip")).resolves.toBeNull();
    expect(loadReader).not.toHaveBeenCalled();
  });

  it("returns null when the database is unavailable", async () => {
    const resolver = new MmdbGeoIpResolver(
      "/missing.mmdb",
      async () => {
        throw new Error("missing");
      }
    );
    await expect(resolver.resolve("8.8.8.8")).resolves.toBeNull();
  });
});

