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

  it("keeps production data and workers private", () => {
    const compose = readRepository("deploy/docker-compose.recall.yml");
    const databaseBlock = compose.split("  recall-db:")[1]!.split(
      "  recall-migrate:"
    )[0]!;
    const workerBlock = compose.split("  recall-worker:")[1]!.split(
      "\nvolumes:"
    )[0]!;

    expect(compose).toContain("postgres:16-bookworm");
    expect(databaseBlock).not.toContain("ports:");
    expect(workerBlock).not.toContain("ports:");
    expect(workerBlock).toContain("- sub2api-network");
    expect(compose).toContain(
      "127.0.0.1:${RECALL_SERVER_PORT:-3000}:3000"
    );
    expect(compose).toContain(
      "image: ${RECALL_IMAGE:?RECALL_IMAGE is required}"
    );
    expect(compose).toContain("internal: true");
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
    expect(backup).toContain("-mtime +14");
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
