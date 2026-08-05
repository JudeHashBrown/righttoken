import { describe, expect, it, vi } from "vitest";
import { constants } from "node:fs";

const { accessMock } = vi.hoisted(() => ({ accessMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ access: accessMock }));

import { getGeoIpRuntimeStatus } from "@/modules/geoip/runtime-status";

describe("GeoIP runtime status", () => {
  it("reports city readiness when the MMDB is readable", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_MMDB_PATH: "/geo/city.mmdb" },
        async (path) => path.endsWith("city.mmdb")
      )
    ).resolves.toEqual({ kind: "city", provinceCapable: true });
  });

  it("reports country readiness when the RIR snapshot is readable", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_RIR_PATH: "/geo/rir.txt" },
        async () => true
      )
    ).resolves.toEqual({ kind: "country", provinceCapable: false });
  });

  it("reports remote readiness when an HTTP provider is configured", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_HTTP_URL: "https://geo.example/{ip}" },
        async () => false
      )
    ).resolves.toEqual({ kind: "remote", provinceCapable: false });
  });

  it("reports unavailable when no provider is ready", async () => {
    await expect(
      getGeoIpRuntimeStatus({}, async () => false)
    ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
  });

  it("continues to the next provider when a file check fails", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        {
          GEOIP_MMDB_PATH: "/geo/missing.mmdb",
          GEOIP_RIR_PATH: "/geo/rir.txt"
        },
        async (path) => {
          if (path.endsWith("missing.mmdb")) {
            throw new Error("ENOENT");
          }
          return true;
        }
      )
    ).resolves.toEqual({ kind: "country", provinceCapable: false });
  });

  it("does not report an unreadable local file as ready with the default checker", async () => {
    accessMock.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES" })
    );

    await expect(
      getGeoIpRuntimeStatus({ GEOIP_MMDB_PATH: "/geo/protected.mmdb" })
    ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });

    expect(accessMock).toHaveBeenCalledWith("/geo/protected.mmdb", constants.R_OK);
  });
});
