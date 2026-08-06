import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(
    process.cwd(),
    "../.github/workflows/recall-admin-ci.yml"
  ),
  "utf8"
);

describe("recall admin CI workflow", () => {
  it("runs only for recall source and deployment changes", () => {
    for (const path of [
      "recall-admin/**",
      "deploy/docker-compose.recall.yml",
      "deploy/Caddyfile.recall",
      ".github/workflows/recall-admin-ci.yml"
    ]) {
      expect(workflow).toContain(path);
    }
  });

  it("uses Node 24.18 and runs every application quality gate", () => {
    expect(workflow).toContain("node-version: 24.18.0");
    for (const command of [
      "npm ci",
      "npm test",
      "npm run test:integration",
      "npm run typecheck",
      "npm run lint",
      "npm run build",
      "npm run worker:build",
      "npm run visit:verify:build",
      "npm run bootstrap:build"
    ]) {
      expect(workflow).toContain(command);
    }
  });

  it("builds the image and validates both Compose environments", () => {
    expect(workflow).toContain(
      "docker build -t righttoken-recall-admin:ci ."
    );
    expect(workflow).toContain(
      "docker compose --env-file .env.example config --quiet"
    );
    expect(workflow).toContain(
      "--env-file recall.env.example"
    );
  });

  it("uses read-only repository permissions", () => {
    expect(workflow).toMatch(
      /permissions:\s*\n\s+contents:\s+read/
    );
    expect(workflow).not.toContain("contents: write");
  });
});
