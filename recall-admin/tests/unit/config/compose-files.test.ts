import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const recallRoot = process.cwd();
const repositoryRoot = resolve(recallRoot, "..");
const readRecall = (path: string) =>
  readFileSync(resolve(recallRoot, path), "utf8");
const readRepository = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

describe("recall Compose environments", () => {
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
    expect(compose).toContain("DEPLOYMENT_ENV: production");
    expect(
      readRepository("deploy/recall.env.example")
    ).toContain(
      "RECALL_DATABASE_URL=postgresql://righttoken_recall_app:CHANGE_ME_PASSWORD@postgres:5432/sub2api?schema=recall"
    );
    expect(readRecall("docs/deployment.md")).toContain(
      "sub2api?schema=recall"
    );
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
  });
});
