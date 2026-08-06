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
  it("runs for recall source, deployment, and production image inputs", () => {
    for (const path of [
      "recall-admin/**",
      "Dockerfile",
      "Dockerfile.goreleaser",
      ".goreleaser.yaml",
      ".goreleaser.simple.yaml",
      ".github/workflows/release.yml",
      "deploy/docker-compose.recall.yml",
      "deploy/Caddyfile.recall",
      ".github/workflows/recall-admin-ci.yml"
    ]) {
      expect(workflow).toContain(path);
    }
  });

  it("uses Node 24.18 and runs every application quality gate", () => {
    expect(workflow).toContain("node-version: 24.18.0");
    expect(workflow).toMatch(
      /^\s+VISITOR_HASH_KEY: ci-visitor-hash-key-at-least-32$/m
    );
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
    expect(workflow).toContain("docker build -t righttoken-main:ci .");
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
