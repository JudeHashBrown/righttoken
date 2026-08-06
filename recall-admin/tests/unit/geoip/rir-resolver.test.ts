import { describe, expect, it } from "vitest";
import { RirGeoIpResolver } from "@/modules/geoip/rir-resolver";

const delegated = `
# delegated RIR fixture
apnic|CN|ipv4|1.0.1.0|256|20110414|allocated
ripencc|RU|ipv4|5.8.0.0|65536|20120501|allocated
arin|US|ipv6|2600:1000::|24|20100101|allocated
`;

describe("RIR delegated-range fallback resolver", () => {
  it("reports whether a snapshot contains at least one usable range", () => {
    expect(RirGeoIpResolver.fromText(delegated).hasRanges()).toBe(true);
    expect(
      RirGeoIpResolver.fromText("# comments only\ninvalid|row").hasRanges()
    ).toBe(false);
  });

  it("uses binary-searchable IPv4 allocation ranges", async () => {
    const resolver = RirGeoIpResolver.fromText(delegated);

    await expect(resolver.resolve("1.0.1.42")).resolves.toEqual({
      countryCode: "CN",
      region: null,
      source: "IP_RIR"
    });
    await expect(resolver.resolve("5.8.22.1")).resolves.toMatchObject({
      countryCode: "RU",
      source: "IP_RIR"
    });
  });

  it("supports IPv6 prefix allocations", async () => {
    const resolver = RirGeoIpResolver.fromText(delegated);
    await expect(
      resolver.resolve("2600:10ff:ffff::1")
    ).resolves.toMatchObject({
      countryCode: "US",
      source: "IP_RIR"
    });
  });

  it("returns null outside delegated ranges", async () => {
    const resolver = RirGeoIpResolver.fromText(delegated);
    await expect(resolver.resolve("8.8.8.8")).resolves.toBeNull();
  });

  it("skips malformed sizes and prefixes without rejecting good rows", async () => {
    const resolver = RirGeoIpResolver.fromText(`
arin|US|ipv4|8.0.0.0|not-a-number|20260725|allocated
arin|US|ipv4|255.255.255.0|512|20260725|allocated
arin|US|ipv6|2600::|129|20260725|allocated
apnic|CN|ipv4|1.0.1.0|256|20260725|allocated
`);

    await expect(resolver.resolve("1.0.1.1")).resolves.toMatchObject({
      countryCode: "CN"
    });
    await expect(resolver.resolve("8.0.0.1")).resolves.toBeNull();
  });
});
