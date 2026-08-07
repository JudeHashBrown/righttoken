import { describe, expect, it } from "vitest";
import { getGeoIpRuntimeStatus } from "@/modules/geoip/runtime-status-core";

describe("GeoIP runtime status core", () => {
  it("is loadable by server-side Node entrypoints without the Next.js marker", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_MMDB_PATH: "/geo/city.mmdb" },
        {
          now: () => Date.UTC(2026, 7, 6),
          inspectFile: async () => ({
            isFile: true,
            size: 1,
            mtimeMs: Date.UTC(2026, 7, 5)
          }),
          validateMmdb: async () => true,
          validateRir: async () => false
        }
      )
    ).resolves.toEqual({ kind: "city", provinceCapable: true });
  });
});
