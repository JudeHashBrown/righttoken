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
  AUTH_MODE: "standalone",
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

  it("accepts the standalone production shape", () => {
    const env = parseServerEnv(baseEnv);

    expect(env.APP_URL).toBe("https://recall.righttoken.ai");
    expect(env.AUTH_MODE).toBe("standalone");
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
      RIGHTTOKEN_JWKS_URL: "https://righttoken.ai/.well-known/jwks.json"
    });

    expect(env.AUTH_MODE).toBe("righttoken");
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
    expect(example.APP_URL).toBe("http://127.0.0.1:3000");
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
      "RECALL_INTERNAL_API_SECRET_CURRENT"
    ]) {
      expect(productionExample).toContain(`${name}=`);
    }
  });
});
