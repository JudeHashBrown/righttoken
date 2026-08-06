import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getGeoIpRuntimeStatus } from "@/modules/geoip/runtime-status";

const dayMs = 24 * 60 * 60 * 1_000;
const nowMs = Date.UTC(2026, 7, 6, 3, 0, 0);

function readinessDependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => nowMs,
    inspectFile: async () => ({
      isFile: true,
      size: 4_096,
      mtimeMs: nowMs - dayMs
    }),
    validateMmdb: async () => true,
    validateRir: async () => true,
    ...overrides
  };
}

describe("GeoIP runtime status", () => {
  it("reports city readiness only after a fresh MMDB parses", async () => {
    const validateMmdb = vi.fn(async () => true);

    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_MMDB_PATH: "/geo/city.mmdb" },
        readinessDependencies({ validateMmdb })
      )
    ).resolves.toEqual({ kind: "city", provinceCapable: true });
    expect(validateMmdb).toHaveBeenCalledWith("/geo/city.mmdb");
  });

  it("reports country readiness only after a fresh RIR snapshot has ranges", async () => {
    const validateRir = vi.fn(async () => true);

    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_RIR_PATH: "/geo/rir.txt" },
        readinessDependencies({ validateRir })
      )
    ).resolves.toEqual({ kind: "country", provinceCapable: false });
    expect(validateRir).toHaveBeenCalledWith("/geo/rir.txt");
  });

  it("reports remote readiness only for HTTP(S) URLs containing {ip}", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_HTTP_URL: "https://geo.example/{ip}" },
        readinessDependencies()
      )
    ).resolves.toEqual({ kind: "remote", provinceCapable: false });
  });

  it.each([
    "ftp://geo.example/{ip}",
    "https://geo.example/lookup",
    "not-a-url/{ip}"
  ])("rejects an invalid remote readiness URL: %s", async (url) => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_HTTP_URL: url },
        readinessDependencies()
      )
    ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
  });

  it("reports unavailable when no provider is ready", async () => {
    await expect(
      getGeoIpRuntimeStatus({}, readinessDependencies())
    ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
  });

  it("continues to a valid RIR source when the MMDB is corrupt", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        {
          GEOIP_MMDB_PATH: "/geo/corrupt.mmdb",
          GEOIP_RIR_PATH: "/geo/rir.txt"
        },
        readinessDependencies({
          validateMmdb: async () => false,
          validateRir: async () => true
        })
      )
    ).resolves.toEqual({ kind: "country", provinceCapable: false });
  });

  it.each(["mmdb", "rir"] as const)(
    "rejects an empty %s file before parsing",
    async (kind) => {
      const validateMmdb = vi.fn(async () => true);
      const validateRir = vi.fn(async () => true);
      const environment =
        kind === "mmdb"
          ? { GEOIP_MMDB_PATH: "/geo/empty.mmdb" }
          : { GEOIP_RIR_PATH: "/geo/empty.txt" };

      await expect(
        getGeoIpRuntimeStatus(
          environment,
          readinessDependencies({
            inspectFile: async () => ({
              isFile: true,
              size: 0,
              mtimeMs: nowMs
            }),
            validateMmdb,
            validateRir
          })
        )
      ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
      expect(validateMmdb).not.toHaveBeenCalled();
      expect(validateRir).not.toHaveBeenCalled();
    }
  );

  it.each(["mmdb", "rir"] as const)(
    "rejects a damaged non-empty %s file",
    async (kind) => {
      const environment =
        kind === "mmdb"
          ? { GEOIP_MMDB_PATH: "/geo/damaged.mmdb" }
          : { GEOIP_RIR_PATH: "/geo/damaged.txt" };

      await expect(
        getGeoIpRuntimeStatus(
          environment,
          readinessDependencies({
            validateMmdb: async () => false,
            validateRir: async () => false
          })
        )
      ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
    }
  );

  it("uses a safe 45-day default freshness limit", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        { GEOIP_RIR_PATH: "/geo/stale.txt" },
        readinessDependencies({
          inspectFile: async () => ({
            isFile: true,
            size: 4_096,
            mtimeMs: nowMs - 46 * dayMs
          })
        })
      )
    ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
  });

  it("accepts a valid configured freshness limit", async () => {
    await expect(
      getGeoIpRuntimeStatus(
        {
          GEOIP_RIR_PATH: "/geo/monthly.txt",
          GEOIP_MAX_AGE_DAYS: "60"
        },
        readinessDependencies({
          inspectFile: async () => ({
            isFile: true,
            size: 4_096,
            mtimeMs: nowMs - 46 * dayMs
          })
        })
      )
    ).resolves.toEqual({ kind: "country", provinceCapable: false });
  });

  it("rejects invalid freshness configuration", async () => {
    for (const value of ["0", "91", "not-a-number"]) {
      await expect(
        getGeoIpRuntimeStatus(
          {
            GEOIP_HTTP_URL: "https://geo.example/{ip}",
            GEOIP_MAX_AGE_DAYS: value
          },
          readinessDependencies()
        )
      ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
    }
  });

  it("does not report an unreadable local file as ready with default probes", async () => {
    await expect(
      getGeoIpRuntimeStatus({ GEOIP_MMDB_PATH: "/geo/missing.mmdb" })
    ).resolves.toEqual({ kind: "unavailable", provinceCapable: false });
  });
});
