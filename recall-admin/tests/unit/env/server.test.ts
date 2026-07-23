import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env/server";

describe("parseServerEnv", () => {
  it("rejects secrets that are too short", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
        JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
        SESSION_COOKIE_SECRET: "short",
        APP_ENCRYPTION_KEY: "short",
        APP_URL: "https://recall.righttoken.com"
      })
    ).toThrow();
  });

  it("accepts the complete production shape", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
      JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
      SESSION_COOKIE_SECRET: "s".repeat(32),
      APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      APP_URL: "https://recall.righttoken.com"
    });

    expect(env.APP_URL).toBe("https://recall.righttoken.com");
  });
});
