import { describe, expect, it, vi } from "vitest";
import { resolveRegistrationLocation } from "@/modules/users/registration-location";
import type { GeoIpResolver } from "@/modules/geoip/types";

function resolver(
  result: Awaited<ReturnType<GeoIpResolver["resolve"]>>
): GeoIpResolver {
  return { resolve: vi.fn().mockResolvedValue(result) };
}

describe("registration location enrichment", () => {
  it("fills missing country and region from the registration IP", async () => {
    const geo = resolver({ countryCode: "CN", region: "广东省" });

    await expect(
      resolveRegistrationLocation(
        {
          registration_ip: "203.0.113.8",
          country_code: undefined,
          region: undefined
        },
        geo
      )
    ).resolves.toEqual({
      countryCode: "CN",
      region: "广东省"
    });
    expect(geo.resolve).toHaveBeenCalledWith("203.0.113.8");
  });

  it("keeps trusted event values and only fills missing fields", async () => {
    const geo = resolver({ countryCode: "US", region: "California" });

    await expect(
      resolveRegistrationLocation(
        {
          registration_ip: "203.0.113.8",
          country_code: "CN",
          region: undefined
        },
        geo
      )
    ).resolves.toEqual({
      countryCode: "CN",
      region: "California"
    });
  });

  it("does not call GeoIP when both values already exist", async () => {
    const geo = resolver({ countryCode: "US", region: "California" });

    await expect(
      resolveRegistrationLocation(
        {
          registration_ip: "203.0.113.8",
          country_code: "CN",
          region: "广东省"
        },
        geo
      )
    ).resolves.toEqual({
      countryCode: "CN",
      region: "广东省"
    });
    expect(geo.resolve).not.toHaveBeenCalled();
  });

  it("does not block registration when lookup fails", async () => {
    const geo: GeoIpResolver = {
      resolve: vi.fn().mockRejectedValue(new Error("provider unavailable"))
    };

    await expect(
      resolveRegistrationLocation(
        {
          registration_ip: "203.0.113.8",
          country_code: undefined,
          region: undefined
        },
        geo
      )
    ).resolves.toEqual({
      countryCode: null,
      region: null
    });
  });
});
