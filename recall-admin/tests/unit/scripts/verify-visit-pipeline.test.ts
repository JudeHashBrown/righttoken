import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createVisitPipelineRuntimeDependencies,
  runVisitPipelineCli,
  verifyVisitPipeline
} from "../../../scripts/verify-visit-pipeline";

describe("visit pipeline verifier", () => {
  it("defines development, build, and production verifier commands", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "visit:verify":
        "node --env-file-if-exists=.env --import tsx scripts/verify-visit-pipeline.ts",
      "visit:verify:build":
        "esbuild scripts/verify-visit-pipeline.ts --bundle --platform=node --format=esm --target=node24 --packages=external --outfile=dist/verify-visit-pipeline.mjs",
      "visit:verify:prod": "node dist/verify-visit-pipeline.mjs"
    });
  });

  it("fails when the SiteVisit table is missing", async () => {
    await expect(
      verifyVisitPipeline({
        siteVisitTableExists: async () => false,
        geoIpStatus: async () => ({
          kind: "city",
          provinceCapable: true
        })
      })
    ).rejects.toThrow("VISIT_PIPELINE_TABLE_MISSING");
  });

  it("fails when GeoIP has no usable source", async () => {
    await expect(
      verifyVisitPipeline({
        siteVisitTableExists: async () => true,
        geoIpStatus: async () => ({
          kind: "unavailable",
          provinceCapable: false
        })
      })
    ).rejects.toThrow("VISIT_PIPELINE_GEOIP_UNAVAILABLE");
  });

  it.each(["city", "country", "remote"] as const)(
    "accepts the %s GeoIP source",
    async (kind) => {
      const geoIpStatus = vi.fn(async () => ({
        kind,
        provinceCapable: kind === "city"
      }));

      await expect(
        verifyVisitPipeline({
          siteVisitTableExists: async () => true,
          geoIpStatus
        })
      ).resolves.toBeUndefined();
      expect(geoIpStatus).toHaveBeenCalledOnce();
    }
  );

  it("prints only the ready kind after a successful CLI check", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const disconnect = vi.fn(async () => undefined);

    await expect(
      runVisitPipelineCli(
        {
          siteVisitTableExists: async () => true,
          geoIpStatus: async () => ({
            kind: "city",
            provinceCapable: true
          }),
          disconnect
        },
        { stdout, stderr }
      )
    ).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith("visit_pipeline_ready:city\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("prints only the stable validation code after a failed CLI check", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const disconnect = vi.fn(async () => undefined);

    await expect(
      runVisitPipelineCli(
        {
          siteVisitTableExists: async () => false,
          geoIpStatus: async () => ({
            kind: "city",
            provinceCapable: true
          }),
          disconnect
        },
        { stdout, stderr }
      )
    ).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "VISIT_PIPELINE_TABLE_MISSING\n"
    );
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("redacts unexpected failure details from CLI output", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const disconnect = vi.fn(async () => undefined);

    await expect(
      runVisitPipelineCli(
        {
          siteVisitTableExists: async () => {
            throw new Error(
              "postgresql://secret@db/recall?token=do-not-print"
            );
          },
          geoIpStatus: async () => ({
            kind: "remote",
            provinceCapable: false
          }),
          disconnect
        },
        { stdout, stderr }
      )
    ).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "VISIT_PIPELINE_CHECK_FAILED\n"
    );
    expect(stderr.mock.calls.flat().join(" ")).not.toContain("secret");
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not report readiness when disconnecting fails", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(
      runVisitPipelineCli(
        {
          siteVisitTableExists: async () => true,
          geoIpStatus: async () => ({
            kind: "country",
            provinceCapable: false
          }),
          disconnect: async () => {
            throw new Error("database path and credentials");
          }
        },
        { stdout, stderr }
      )
    ).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "VISIT_PIPELINE_CHECK_FAILED\n"
    );
  });

  it("checks only the SiteVisit table registration through the runtime database", async () => {
    const queryRaw = vi.fn(async (query: TemplateStringsArray) => {
      void query;
      return [{ relation: 'recall."SiteVisit"' }];
    });
    const disconnect = vi.fn(async () => undefined);
    const geoIpStatus = vi.fn(async () => ({
      kind: "remote" as const,
      provinceCapable: false
    }));
    const dependencies = createVisitPipelineRuntimeDependencies(
      { $queryRaw: queryRaw, $disconnect: disconnect },
      geoIpStatus
    );

    await expect(dependencies.siteVisitTableExists()).resolves.toBe(true);
    await expect(dependencies.geoIpStatus()).resolves.toEqual({
      kind: "remote",
      provinceCapable: false
    });
    await dependencies.disconnect();

    const query = queryRaw.mock.calls[0]?.[0].join(" ")
      .replace(/\s+/g, " ")
      .trim();
    expect(query).toBe(
      `SELECT to_regclass('recall."SiteVisit"')::text AS relation`
    );
    expect(query).not.toMatch(/\bFROM\b/i);
    expect(geoIpStatus).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("reports a missing table when to_regclass returns null", async () => {
    const dependencies = createVisitPipelineRuntimeDependencies(
      {
        $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
          void query;
          return [{ relation: null }];
        }),
        $disconnect: vi.fn(async () => undefined)
      },
      async () => ({ kind: "city", provinceCapable: true })
    );

    await expect(dependencies.siteVisitTableExists()).resolves.toBe(false);
  });
});
