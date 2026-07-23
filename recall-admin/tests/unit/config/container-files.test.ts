import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("recall production container files", () => {
  it("uses Node 24.18 and a non-root runtime user", () => {
    const dockerfile = projectFile("Dockerfile");

    expect(dockerfile).toContain(
      "FROM node:24.18-bookworm-slim"
    );
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain("/api/health/ready");
  });

  it("keeps secrets, caches, tests, and logs out of the build context", () => {
    const dockerignore = projectFile(".dockerignore");

    for (const pattern of [
      ".git",
      ".env",
      ".next",
      "node_modules",
      "coverage",
      "tests",
      "*.log"
    ]) {
      expect(dockerignore).toContain(pattern);
    }
  });

  it("defines production Worker build and health commands", () => {
    const packageJson = JSON.parse(
      projectFile("package.json")
    ) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    expect(packageJson.scripts["worker:build"]).toContain(
      "esbuild"
    );
    expect(packageJson.scripts["worker:prod"]).toBe(
      "node dist/worker/index.mjs"
    );
    expect(packageJson.scripts["worker:health"]).toBe(
      "node --env-file-if-exists=.env scripts/worker-health.mjs"
    );
    expect(packageJson.devDependencies.esbuild).toBeTruthy();
  });
});
