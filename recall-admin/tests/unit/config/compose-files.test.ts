import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recallRoot = process.cwd();
const repositoryRoot = resolve(recallRoot, "..");
const readRecall = (path: string) =>
  readFileSync(resolve(recallRoot, path), "utf8");
const readRepository = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

describe("recall Compose environments", () => {
  it("pins the repository main-site release image by manifest digest", () => {
    const compose = readRepository("deploy/docker-compose.recall.yml");
    const productionExample = readRepository("deploy/recall.env.example");
    const releaseConfig = readRepository(".goreleaser.yaml");
    const deployment = readRecall("docs/deployment.md");
    const mainServiceBlock = compose
      .split("services:\n")[1]!
      .split("\n  recall-migrate:")[0]!;

    expect(mainServiceBlock).toContain("  sub2api:");
    expect(mainServiceBlock).toContain(
      "image: ${RIGHTTOKEN_IMAGE:?RIGHTTOKEN_IMAGE is required}"
    );
    expect(productionExample).toMatch(
      /^RIGHTTOKEN_IMAGE=ghcr\.io\/judehashbrown\/sub2api@sha256:/m
    );
    expect(productionExample).not.toMatch(/^RIGHTTOKEN_IMAGE=.*:latest$/m);
    expect(releaseConfig).toContain(
      'ghcr.io/{{ .Env.GITHUB_REPO_OWNER_LOWER }}/sub2api:{{ .Version }}'
    );
    expect(deployment).toContain(
      "docker buildx imagetools inspect ghcr.io/judehashbrown/sub2api:"
    );
    expect(deployment).toContain("pull sub2api recall-migrate recall-web recall-worker");
    expect(deployment).toContain(
      "up -d --force-recreate sub2api recall-web recall-worker"
    );
    expect(deployment).toContain(
      "`RIGHTTOKEN_IMAGE` 改为上一条已验证 manifest digest"
    );
  });

  it("requires an explicit safe trusted proxy configuration for the main service", () => {
    const composeFiles = [
      "deploy/docker-compose.yml",
      "deploy/docker-compose.local.yml",
      "deploy/docker-compose.standalone.yml"
    ];
    const envExample = readRepository("deploy/.env.example");
    const configExample = readRepository("deploy/config.example.yaml");

    for (const composeFile of composeFiles) {
      expect(readRepository(composeFile)).toContain(
        "SERVER_TRUSTED_PROXIES=${SERVER_TRUSTED_PROXIES:?SERVER_TRUSTED_PROXIES is required}"
      );
    }
    expect(envExample).toMatch(/^SERVER_TRUSTED_PROXIES=192\.0\.2\.1$/m);
    expect(envExample).toContain(
      "replace this placeholder with the exact reverse-proxy or Docker gateway IP/CIDR"
    );
    expect(configExample).toContain(
      "Production deployments must use the exact reverse-proxy or Docker gateway IP/CIDR"
    );
  });

  it("defines the complete local stack with a loopback-only database", () => {
    const compose = readRecall("compose.yaml");

    for (const service of [
      "recall-db:",
      "recall-migrate:",
      "recall-seed:",
      "recall-web:",
      "recall-worker:"
    ]) {
      expect(compose).toContain(service);
    }
    expect(compose).toContain("postgres:16-bookworm");
    expect(compose).toContain("127.0.0.1:55432:5432");
    expect(compose).toContain("condition: service_completed_successfully");
  });

  it("uses the supported development auth mode for the local stack", () => {
    const compose = readRecall("compose.yaml");

    expect(compose).toContain(
      "AUTH_MODE: ${AUTH_MODE:-development}"
    );
    expect(compose).toContain("DEPLOYMENT_ENV: local");
    expect(compose).toContain("NODE_ENV: development");
    expect(compose).not.toContain("AUTH_MODE:-standalone");
  });

  it("uses the shared RightToken database without a recall database service", () => {
    const compose = readRepository("deploy/docker-compose.recall.yml");
    const workerBlock = compose.split("  recall-worker:")[1]!.split(
      "\nnetworks:"
    )[0]!;

    expect(compose).not.toContain("  recall-db:");
    expect(compose).not.toContain("recall_postgres_data");
    expect(compose).not.toContain("RECALL_POSTGRES_PASSWORD");
    expect(workerBlock).not.toContain("ports:");
    expect(workerBlock).toContain("- sub2api-network");
    expect(compose).toContain(
      "127.0.0.1:${RECALL_SERVER_PORT:-3000}:3000"
    );
    expect(compose).toContain(
      "image: ${RECALL_IMAGE:?RECALL_IMAGE is required}"
    );
    expect(compose).toContain("external: true");
    expect(compose).toContain("RIGHTTOKEN_SOURCE_MODE: database");
    expect(compose).toContain(
      "VISITOR_HASH_KEY: ${RECALL_VISITOR_HASH_KEY:?RECALL_VISITOR_HASH_KEY is required}"
    );
    expect(compose).not.toContain("RIGHTTOKEN_API_TOKEN");
    expect(compose).not.toContain("BOOTSTRAP_PRIMARY_ADMIN_PASSWORD");
    expect(compose).toContain(
      "/var/lib/righttoken-geoip:/var/lib/righttoken-geoip:ro"
    );
    expect(compose).toContain(
      "GEOIP_MMDB_PATH: ${RECALL_GEOIP_MMDB_PATH"
    );
    expect(compose).toContain(
      "GEOIP_RIR_PATH: ${RECALL_GEOIP_RIR_PATH"
    );
    expect(compose).toContain(
      "GEOIP_MAX_AGE_DAYS: ${RECALL_GEOIP_MAX_AGE_DAYS:-45}"
    );
    expect(compose).toContain("DEPLOYMENT_ENV: production");
    for (const mapping of [
      "MAIL_ASSET_STORAGE: ${RECALL_MAIL_ASSET_STORAGE",
      "MAIL_ASSET_S3_BUCKET: ${RECALL_MAIL_ASSET_S3_BUCKET",
      "MAIL_ASSET_S3_REGION: ${RECALL_MAIL_ASSET_S3_REGION",
      "MAIL_ASSET_S3_ENDPOINT: ${RECALL_MAIL_ASSET_S3_ENDPOINT",
      "MAIL_ASSET_S3_FORCE_PATH_STYLE: ${RECALL_MAIL_ASSET_S3_FORCE_PATH_STYLE",
      "MAIL_ASSET_S3_ACCESS_KEY_ID: ${RECALL_MAIL_ASSET_S3_ACCESS_KEY_ID",
      "MAIL_ASSET_S3_SECRET_ACCESS_KEY: ${RECALL_MAIL_ASSET_S3_SECRET_ACCESS_KEY"
    ]) {
      expect(compose).toContain(mapping);
    }
    expect(
      readRepository("deploy/recall.env.example")
    ).toContain(
      "RECALL_DATABASE_URL=postgresql://righttoken_recall_app:CHANGE_ME_PASSWORD@postgres:5432/sub2api?schema=recall"
    );
    expect(readRepository("deploy/recall.env.example")).toMatch(
      /^RECALL_VISITOR_HASH_KEY=.{32,}$/m
    );
    expect(readRecall("docs/deployment.md")).toContain(
      "sub2api?schema=recall"
    );
  });

  it("gates production Web and Worker on visit pipeline readiness", () => {
    const compose = readRepository("deploy/docker-compose.recall.yml");
    const verifierBlock = compose
      .split("  recall-visit-verify:")[1]!
      .split("\n  recall-bootstrap:")[0]!;
    const webBlock = compose
      .split("  recall-web:")[1]!
      .split("\n  recall-worker:")[0]!;
    const workerBlock = compose
      .split("  recall-worker:")[1]!
      .split("\nnetworks:")[0]!;

    expect(verifierBlock).toContain(
      'command: ["node", "dist/verify-visit-pipeline.mjs"]'
    );
    expect(verifierBlock).toContain("recall-migrate:");
    expect(verifierBlock).toContain(
      "condition: service_completed_successfully"
    );
    for (const applicationBlock of [webBlock, workerBlock]) {
      expect(applicationBlock).toContain("recall-visit-verify:");
      expect(applicationBlock).toContain(
        "condition: service_completed_successfully"
      );
    }
    for (const mapping of [
      "VISITOR_HASH_KEY: ${RECALL_VISITOR_HASH_KEY:",
      "GEOIP_HTTP_URL: ${RECALL_GEOIP_HTTP_URL",
      "GEOIP_HTTP_TOKEN: ${RECALL_GEOIP_HTTP_TOKEN",
      "GEOIP_HTTP_TIMEOUT_MS: ${RECALL_GEOIP_HTTP_TIMEOUT_MS",
      "GEOIP_MMDB_PATH: ${RECALL_GEOIP_MMDB_PATH",
      "GEOIP_RIR_PATH: ${RECALL_GEOIP_RIR_PATH",
      "GEOIP_MAX_AGE_DAYS: ${RECALL_GEOIP_MAX_AGE_DAYS"
    ]) {
      expect(compose).toContain(mapping);
    }

    expect(readRepository("deploy/recall.env.example")).toContain(
      "The deployment preflight parses non-empty local files and rejects stale data."
    );
    expect(readRepository("deploy/recall.env.example")).toMatch(
      /^RECALL_GEOIP_MAX_AGE_DAYS=45$/m
    );
  });

  it("keeps the production verifier entrypoint output machine-readable", () => {
    const compose = readRepository("deploy/docker-compose.recall.yml");
    const verifierBlock = compose
      .split("  recall-visit-verify:")[1]!
      .split("\n  recall-bootstrap:")[0]!;
    const commandSource = verifierBlock.match(/command: (\[[^\n]+\])/);
    const command = JSON.parse(commandSource?.[1] ?? "null") as
      | string[]
      | null;
    const fixtureRoot = mkdtempSync(
      resolve(tmpdir(), "recall-visit-verify-")
    );

    try {
      mkdirSync(resolve(fixtureRoot, "dist"));
      writeFileSync(
        resolve(fixtureRoot, "package.json"),
        JSON.stringify({
          scripts: {
            "visit:verify:prod": "node dist/verify-visit-pipeline.mjs"
          }
        })
      );
      writeFileSync(
        resolve(fixtureRoot, "dist/verify-visit-pipeline.mjs"),
        `if (process.env.VISIT_VERIFY_TEST_FAILURE) {
  process.stderr.write("VISIT_PIPELINE_CHECK_FAILED\\n");
  process.exitCode = 1;
} else {
  process.stdout.write("visit_pipeline_ready:remote\\n");
}
`
      );

      expect(command).not.toBeNull();
      const success = spawnSync(command![0], command!.slice(1), {
        cwd: fixtureRoot,
        encoding: "utf8"
      });
      expect(success).toMatchObject({
        status: 0,
        stdout: "visit_pipeline_ready:remote\n",
        stderr: ""
      });

      const failure = spawnSync(command![0], command!.slice(1), {
        cwd: fixtureRoot,
        encoding: "utf8",
        env: { ...process.env, VISIT_VERIFY_TEST_FAILURE: "1" }
      });
      expect(failure).toMatchObject({
        status: 1,
        stdout: "",
        stderr: "VISIT_PIPELINE_CHECK_FAILED\n"
      });
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("builds the visit verifier into the production image", () => {
    const dockerfile = readRecall("Dockerfile");

    expect(dockerfile).toContain("npm run visit:verify:build");
    expect(dockerfile).toContain(
      "COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist"
    );
  });

  it("documents migrate, verify, and service startup in that order", () => {
    const deployment = readRecall("docs/deployment.md");
    const runbook = readRecall("docs/runbooks/deployment.md");
    const migrate = deployment.indexOf("run --rm recall-migrate");
    const verify = deployment.indexOf(
      "run --rm --no-deps recall-visit-verify"
    );
    const start = deployment.indexOf(
      "up -d --force-recreate sub2api recall-web recall-worker"
    );

    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(migrate);
    expect(start).toBeGreaterThan(verify);
    expect(deployment).toContain("COUNT(*) AS site_visit_rows");
    expect(deployment).toContain("COUNT(*) FILTER");
    expect(runbook).toContain("recall-visit-verify");
    expect(runbook).toContain("迁移 → 访问链路预检 → Web/Worker");
    expect(runbook).toContain("强制重建 `sub2api`");
  });

  it("ships root-level domain verification files in the web image", () => {
    const dockerfile = readRecall("Dockerfile");
    const verification = readRecall(
      "public/WW_verify_4r7rzaKrRbPD0ZJa.txt"
    );

    expect(dockerfile).toContain(
      "COPY --from=builder --chown=nextjs:nodejs /app/public ./public"
    );
    expect(verification.trim()).toBe("4r7rzaKrRbPD0ZJa");
  });

  it("documents host ingress and protected backups", () => {
    const caddy = readRepository("deploy/Caddyfile.recall");
    const backup = readRepository("deploy/backup-recall.sh");

    expect(caddy).toContain("recall.righttoken.ai");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
    expect(caddy).toContain("health_uri /api/health/ready");
    expect(caddy).toContain("max_size 10MB");
    expect(backup).toContain("umask 077");
    expect(backup).toContain("pg_dump");
    expect(backup).toContain("exec -T postgres");
    expect(backup).toContain("--schema=recall --schema=pgboss");
    expect(backup).not.toContain("exec -T recall-db");
    expect(backup).toContain("-mtime +14");
  });

  it("provides an explicit legacy-state migration before shared deployment", () => {
    const migration = readRecall(
      "scripts/migrate-legacy-recall-state.sh"
    );
    const deployment = readRecall("docs/deployment.md");

    expect(migration).toContain("LEGACY_RECALL_DATABASE_URL");
    expect(migration).toContain("RIGHTTOKEN_DATABASE_OWNER_URL");
    expect(migration).toContain("INSERT INTO recall.");
    expect(migration).toContain("--schema=pgboss");
    expect(migration).toContain(
      'DELETE FROM recall."LocationAttributionRule";'
    );
    expect(migration).toContain(
      "DROP SCHEMA IF EXISTS pgboss CASCADE;"
    );
    expect(deployment).toContain(
      "migrate-legacy-recall-state.sh"
    );
    expect(deployment.indexOf("run --rm recall-migrate")).toBeLessThan(
      deployment.indexOf("verify-shared-database.sql")
    );
  });

  it("does not ignore nested recall tests or scripts", () => {
    const gitignore = readRepository(".gitignore");

    expect(gitignore).toContain("/tests");
    expect(gitignore).toContain("/scripts");
    expect(gitignore).not.toMatch(/^tests$/m);
    expect(gitignore).not.toMatch(/^scripts$/m);
  });

  it("runs the main-site recall contract in CI", () => {
    const workflow = readRepository(
      ".github/workflows/recall-admin-ci.yml"
    );

    expect(workflow).toContain('- "backend/**"');
    expect(workflow).toContain('- "frontend/**"');
    expect(workflow).toContain("main-contract:");
    expect(workflow).toContain(
      "go test -tags=recallcontract ./internal/handler/admin"
    );
    expect(workflow).toContain(
      "npm run test -- --run src/composables/useRecallAccess.test.ts"
    );
    expect(workflow).toContain("docker build -t righttoken-main:ci .");
  });
});
