import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env/server";

const baseEnv = {
  DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
  JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
  SESSION_COOKIE_SECRET: "s".repeat(32),
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
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

  it("requires a complete RightToken source when reconciliation is enabled", () => {
    expect(() =>
      parseServerEnv({
        ...baseEnv,
        RECONCILE_ENABLED: "true"
      })
    ).toThrow();

    const env = parseServerEnv({
      ...baseEnv,
      RECONCILE_ENABLED: "true",
      RIGHTTOKEN_API_BASE_URL: "https://righttoken.ai",
      RIGHTTOKEN_API_TOKEN: "t".repeat(32)
    });

    expect(env.RECONCILE_ENABLED).toBe(true);
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
      "RECALL_POSTGRES_PASSWORD",
      "RECALL_SESSION_COOKIE_SECRET",
      "RECALL_APP_ENCRYPTION_KEY",
      "RECALL_APP_URL",
      "RECALL_AUTH_MODE",
      "RECALL_INTERNAL_API_SECRET_CURRENT",
      "RECALL_RIGHTTOKEN_SSO_SECRET",
      "RECALL_RIGHTTOKEN_ADMIN_URL",
      "RECALL_RIGHTTOKEN_API_BASE_URL",
      "RECALL_RIGHTTOKEN_API_TOKEN",
      "RECALL_RECONCILE_ENABLED",
      "RECALL_GEOIP_MMDB_PATH",
      "RECALL_GEOIP_RIR_PATH"
    ]) {
      expect(productionExample).toContain(`${name}=`);
    }
  });
});
