import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("production build command", () => {
  it("uses the verified Next.js webpack builder", () => {
    const packageJson = JSON.parse(
      readFileSync(
        new URL("../../../package.json", import.meta.url),
        "utf8"
      )
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.build).toBe("next build --webpack");
  });

  it("allows the local preview hostname used by the in-app browser", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
  });
});
