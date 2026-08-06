import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env/server";

const baseEnv = {
  DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
  JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
  SESSION_COOKIE_SECRET: "s".repeat(32),
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  VISITOR_HASH_KEY: "v".repeat(32),
  APP_URL: "https://recall.righttoken.ai",
  AUTH_MODE: "development",
  DEPLOYMENT_ENV: "local",
  INTERNAL_API_SECRET_CURRENT: "i".repeat(32)
};

function parseEnvFile(contents: string): Record<string, string> {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator),
          line.slice(separator + 1)
        ];
      })
  );
}

describe("parseServerEnv", () => {
  it("rejects secrets that are too short", () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        SESSION_COOKIE_SECRET: "short",
        APP_ENCRYPTION_KEY: "short"
      })
    ).toThrow();
  });

  it("accepts the login-free development shape", () => {
    const env = parseServerEnv(baseEnv);

    expect(env.APP_URL).toBe("https://recall.righttoken.ai");
    expect(env.AUTH_MODE).toBe("development");
    expect(env.DEPLOYMENT_ENV).toBe("local");
    expect(env.RECONCILE_ENABLED).toBe(false);
    expect(env.RECONCILE_INTERVAL_MINUTES).toBe(15);
  });

  it("accepts the previous internal secret during rotation", () => {
    const env = parseServerEnv({
      ...baseEnv,
      INTERNAL_API_SECRET_PREVIOUS: "p".repeat(32)
    });

    expect(env.INTERNAL_API_SECRET_PREVIOUS).toBe("p".repeat(32));
  });

  it("accepts an explicit RightToken dashboard URL", () => {
    const env = parseServerEnv({
      ...baseEnv,
      RIGHTTOKEN_DASHBOARD_URL: "https://righttoken.ai/dashboard"
    });

    expect(env.RIGHTTOKEN_DASHBOARD_URL).toBe(
      "https://righttoken.ai/dashboard"
    );
  });

  it("accepts optional GeoIP HTTP provider settings", () => {
    const env = parseServerEnv({
      ...baseEnv,
      GEOIP_HTTP_URL: "https://geo.example.test/lookup/{ip}",
      GEOIP_HTTP_TOKEN: "geo-secret",
      GEOIP_HTTP_TIMEOUT_MS: "1500"
    });

    expect(env.GEOIP_HTTP_URL).toBe(
      "https://geo.example.test/lookup/{ip}"
    );
    expect(env.GEOIP_HTTP_TIMEOUT_MS).toBe(1500);
    expect(env.GEOIP_MAX_AGE_DAYS).toBe(45);
  });

  it.each([
    "ftp://geo.example.test/lookup/{ip}",
    "https://geo.example.test/lookup",
    "not-a-url/{ip}"
  ])("rejects an invalid GeoIP HTTP URL contract: %s", (url) => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        GEOIP_HTTP_URL: url
      })
    ).toThrow();
  });

  it("accepts only bounded GeoIP freshness settings", () => {
    expect(
      parseServerEnv({
        ...baseEnv,
        GEOIP_MAX_AGE_DAYS: "60"
      }).GEOIP_MAX_AGE_DAYS
    ).toBe(60);

    for (const value of ["0", "91", "not-a-number"]) {
      expect(() =>
        parseServerEnv({
          ...baseEnv,
          GEOIP_MAX_AGE_DAYS: value
        })
      ).toThrow();
    }
  });

  it("accepts local MMDB and RIR snapshot paths", () => {
    const env = parseServerEnv({
      ...baseEnv,
      GEOIP_MMDB_PATH: "/var/lib/righttoken-geoip/GeoLite2-City.mmdb",
      GEOIP_RIR_PATH: "/var/lib/righttoken-geoip/delegated-rir.txt"
    });

    expect(env.GEOIP_MMDB_PATH).toBe(
      "/var/lib/righttoken-geoip/GeoLite2-City.mmdb"
    );
    expect(env.GEOIP_RIR_PATH).toBe(
      "/var/lib/righttoken-geoip/delegated-rir.txt"
    );
  });

  it("rejects an internal API secret that is too short", () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        INTERNAL_API_SECRET_CURRENT: "short"
      })
    ).toThrow();
  });

  it("requires complete RightToken identity settings", () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        AUTH_MODE: "righttoken"
      })
    ).toThrow();

    const env = parseServerEnv({
      ...baseEnv,
      AUTH_MODE: "righttoken",
      RIGHTTOKEN_ISSUER: "https://righttoken.ai",
      RIGHTTOKEN_AUDIENCE: "righttoken-recall",
      RIGHTTOKEN_SSO_SECRET: "r".repeat(32),
      RIGHTTOKEN_ADMIN_URL: "https://righttoken.ai/admin/dashboard"
    });

    expect(env.AUTH_MODE).toBe("righttoken");
  });

  it("rejects login-free mode in production", () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        DEPLOYMENT_ENV: "production",
        NODE_ENV: "production",
        AUTH_MODE: "development"
      })
    ).toThrow("AUTH_MODE=development is forbidden in production");
  });

  it("requires complete S3 mail asset storage in production", () => {
    const production = {
      ...baseEnv,
      DEPLOYMENT_ENV: "production",
      NODE_ENV: "production",
      AUTH_MODE: "righttoken",
      RIGHTTOKEN_ISSUER: "https://righttoken.ai",
      RIGHTTOKEN_AUDIENCE: "righttoken-recall",
      RIGHTTOKEN_SSO_SECRET: "r".repeat(32),
      RIGHTTOKEN_ADMIN_URL: "https://righttoken.ai/user-operations"
    };

    expect(() => parseServerEnv(production)).toThrow(
      "MAIL_ASSET_STORAGE=s3 is required in production"
    );

    expect(() =>
      parseServerEnv({
        ...production,
        MAIL_ASSET_STORAGE: "s3",
        MAIL_ASSET_S3_BUCKET: "righttoken-private-mail-assets",
        MAIL_ASSET_S3_REGION: "ap-southeast-1",
        MAIL_ASSET_S3_ACCESS_KEY_ID: "access-key",
        MAIL_ASSET_S3_SECRET_ACCESS_KEY: "secret-key"
      })
    ).not.toThrow();
  });

  it("rejects the removed HTTP source mode", () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        RIGHTTOKEN_SOURCE_MODE: "http"
      })
    ).toThrow();
  });

  it("accepts database reconciliation without HTTP credentials", () => {
    const env = parseServerEnv({
      ...baseEnv,
      RECONCILE_ENABLED: "true",
      RIGHTTOKEN_SOURCE_MODE: "database"
    });

    expect(env.RECONCILE_ENABLED).toBe(true);
    expect(env.RIGHTTOKEN_SOURCE_MODE).toBe("database");
  });

  it("parses explicit false flags without Boolean string coercion", () => {
    const env = parseServerEnv({
      ...baseEnv,
      RECONCILE_ENABLED: "false",
      SMTP_SECURE: "false",
      IMAP_SECURE: "true"
    });

    expect(env.RECONCILE_ENABLED).toBe(false);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.IMAP_SECURE).toBe(true);
  });

  it("keeps the checked-in local example runnable", () => {
    const example = parseEnvFile(
      readFileSync(resolve(process.cwd(), ".env.example"), "utf8")
    );

    expect(() => parseServerEnv(example)).not.toThrow();
    expect(example.APP_URL).toBe("http://127.0.0.1:3101");
  });

  it("documents every required production deployment variable", () => {
    const productionExample = readFileSync(
      resolve(process.cwd(), "../deploy/recall.env.example"),
      "utf8"
    );

    for (const name of [
      "RECALL_DATABASE_URL",
      "RECALL_JOB_DATABASE_URL",
      "RECALL_RIGHTTOKEN_NETWORK_NAME",
      "RECALL_SESSION_COOKIE_SECRET",
      "RECALL_APP_ENCRYPTION_KEY",
      "RECALL_VISITOR_HASH_KEY",
      "RECALL_APP_URL",
      "RECALL_AUTH_MODE",
      "RECALL_INTERNAL_API_SECRET_CURRENT",
      "RECALL_RIGHTTOKEN_SSO_SECRET",
      "RECALL_RIGHTTOKEN_ADMIN_URL",
      "RECALL_RIGHTTOKEN_DASHBOARD_URL",
      "RECALL_RECONCILE_ENABLED",
      "RECALL_GEOIP_MMDB_PATH",
      "RECALL_GEOIP_RIR_PATH",
      "RECALL_GEOIP_MAX_AGE_DAYS",
      "RECALL_MAIL_ASSET_STORAGE",
      "RECALL_MAIL_ASSET_S3_BUCKET",
      "RECALL_MAIL_ASSET_S3_REGION",
      "RECALL_MAIL_ASSET_S3_ENDPOINT",
      "RECALL_MAIL_ASSET_S3_FORCE_PATH_STYLE",
      "RECALL_MAIL_ASSET_S3_ACCESS_KEY_ID",
      "RECALL_MAIL_ASSET_S3_SECRET_ACCESS_KEY"
    ]) {
      expect(productionExample).toContain(`${name}=`);
    }
  });
});
