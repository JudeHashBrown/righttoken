import { describe, expect, it } from "vitest";
import { getGeoIpRuntimeStatus } from "@/modules/geoip/runtime-status-core";

describe("GeoIP runtime status core", () => {
  it("is loadable by server-side Node entrypoints without the Next.js marker", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_MMDB_PATH: "/geo/city.mmdb" },
        async () => true
      )
    ).resolves.toEqual({ kind: "city", provinceCapable: true });
  });
});
