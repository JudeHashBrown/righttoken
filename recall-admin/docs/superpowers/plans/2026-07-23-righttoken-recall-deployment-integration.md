# RightToken Recall Deployment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `recall-admin/` 在 RightToken 主仓库中具备可重复的本地与生产容器环境、可验证的内部事件入口、独立运营账号初始化、健康检查和 CI，从而可直接进入 `recall.righttoken.ai` 发布测试。

**Architecture:** 保持 Next.js 召回后台为独立子应用，同一镜像分别运行 Web 与 pg-boss Worker，使用独立 PostgreSQL 16。生产通过 Compose 覆盖文件接入 RightToken 现有网络，宿主机 Caddy 从 `127.0.0.1:3000` 反向代理；RightToken 通过内部 Bearer 密钥事件接口同步用户事实。

**Tech Stack:** Next.js 16、React 19、TypeScript 5.9、Prisma 7、PostgreSQL 16、pg-boss 12、Docker Compose、Caddy、GitHub Actions、Vitest。

## Global Constraints

- 正式域名固定为 `https://recall.righttoken.ai`。
- 分支固定为 `codex/righttoken-user-recall-admin`，不自动合并到 `main`。
- Node.js 固定为 `24.18.x`，不得使用 Node.js 25。
- 首发 `AUTH_MODE` 固定为 `standalone`；不得提供无鉴权模式。
- 召回数据库与 RightToken 主数据库隔离。
- 生产数据库、Worker 和迁移任务不得公开端口。
- 召回 Web 仅可绑定宿主机回环地址，默认 `127.0.0.1:3000`。
- `.env`、生产凭据、真实用户数据、备份和构建缓存不得进入 Git。
- CSV 导出继续仅允许 `PRIMARY_ADMIN`。
- 本阶段不修改正式 DNS、不登录正式服务器、不推送生产镜像。

## File Structure

### New files

- `recall-admin/src/modules/integrations/internal-api-auth.ts`：当前/上一内部密钥的恒定时间校验。
- `recall-admin/src/modules/tasks/runtime-scheduler.ts`：Web 进程使用的 pg-boss 生产者单例。
- `recall-admin/src/app/api/internal/righttoken/events/route.ts`：RightToken 事件入口。
- `recall-admin/src/modules/health/readiness.ts`：就绪探针。
- `recall-admin/src/app/api/health/live/route.ts`：存活接口。
- `recall-admin/src/app/api/health/ready/route.ts`：就绪接口。
- `recall-admin/src/modules/auth/bootstrap-primary-admin.ts`：幂等主管理员初始化。
- `recall-admin/scripts/bootstrap-primary-admin.ts`：初始化命令入口。
- `recall-admin/scripts/worker-health.mjs`：Worker 数据库健康检查。
- `recall-admin/Dockerfile`：Web/Worker 共用生产镜像。
- `recall-admin/.dockerignore`：镜像上下文白名单。
- `deploy/docker-compose.recall.yml`：主站生产 Compose 覆盖。
- `deploy/recall.env.example`：生产变量清单。
- `deploy/Caddyfile.recall`：宿主机 Caddy 子域配置。
- `deploy/backup-recall.sh`：召回数据库逻辑备份。
- `.github/workflows/recall-admin-ci.yml`：召回模块 CI。
- 对应的单元与集成测试文件。

### Modified files

- `recall-admin/src/lib/env/server.ts`：部署、身份、内部 API 和渠道变量。
- `recall-admin/tests/unit/env/server.test.ts`：环境约束。
- `recall-admin/package.json`、`package-lock.json`：Worker 构建、初始化和镜像脚本。
- `recall-admin/prisma/seed.ts`：复用主管理员初始化服务。
- `recall-admin/compose.yaml`：完整本地栈。
- `recall-admin/.env.example`：安全的本地默认值。
- `recall-admin/README.md`：本地、生产与发布说明。
- `.gitignore`：允许追踪召回测试，继续忽略所有真实环境文件。
- 已确认的部署设计文档：明确宿主机 Caddy 和双密钥轮换。

---

### Task 1: Validate Deployment and Authentication Environment

**Files:**
- Modify: `recall-admin/src/lib/env/server.ts`
- Modify: `recall-admin/tests/unit/env/server.test.ts`
- Modify: `recall-admin/.env.example`
- Create: `deploy/recall.env.example`

**Interfaces:**
- Produces: `parseServerEnv(input): ServerEnv`.
- Produces: `ServerEnv.AUTH_MODE`, `INTERNAL_API_SECRET_CURRENT`, `INTERNAL_API_SECRET_PREVIOUS`.
- Consumed by: health checks, internal event authentication, Web and Worker startup.

- [ ] **Step 1: Write failing environment tests**

Add cases that use `https://recall.righttoken.ai`, accept `AUTH_MODE=standalone`, require a 32-character current internal secret, accept an optional previous secret, reject `AUTH_MODE=righttoken` without issuer/audience/JWKS, and accept it only when all three are valid URLs/values.

```ts
const baseEnv = {
  DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
  JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
  SESSION_COOKIE_SECRET: "s".repeat(32),
  APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  APP_URL: "https://recall.righttoken.ai",
  AUTH_MODE: "standalone",
  INTERNAL_API_SECRET_CURRENT: "i".repeat(32)
};

expect(parseServerEnv(baseEnv).AUTH_MODE).toBe("standalone");
expect(() =>
  parseServerEnv({ ...baseEnv, INTERNAL_API_SECRET_CURRENT: "short" })
).toThrow();
expect(() =>
  parseServerEnv({ ...baseEnv, AUTH_MODE: "righttoken" })
).toThrow();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd recall-admin
npm test -- tests/unit/env/server.test.ts
```

Expected: FAIL because `AUTH_MODE` and internal API secret fields are not returned or validated.

- [ ] **Step 3: Implement the conditional schema**

Extend `serverEnvSchema` with:

```ts
AUTH_MODE: z.enum(["standalone", "righttoken"]).default("standalone"),
INTERNAL_API_SECRET_CURRENT: z.string().min(32),
INTERNAL_API_SECRET_PREVIOUS: z.string().min(32).optional(),
RIGHTTOKEN_ISSUER: z.string().url().optional(),
RIGHTTOKEN_AUDIENCE: z.string().min(1).optional(),
RIGHTTOKEN_JWKS_URL: z.string().url().optional(),
RIGHTTOKEN_ROLE_MAP: z.string().optional(),
RIGHTTOKEN_API_BASE_URL: z.string().url().optional(),
RIGHTTOKEN_API_TOKEN: z.string().min(32).optional(),
RECONCILE_ENABLED: z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default(false),
RECONCILE_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(15),
FULL_RECONCILE_CRON: z.string().default("0 2 * * *"),
SMTP_HOST: z.string().min(1).optional(),
SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
SMTP_SECURE: z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional(),
SMTP_USER: z.string().min(1).optional(),
SMTP_PASSWORD: z.string().min(1).optional(),
IMAP_HOST: z.string().min(1).optional(),
IMAP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
IMAP_SECURE: z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional(),
IMAP_USER: z.string().min(1).optional(),
IMAP_PASSWORD: z.string().min(1).optional(),
WECHAT_WEBHOOK_URL: z.string().url().optional(),
NOTIFICATION_FROM: z.string().email().optional()
```

Use `.superRefine()` to require `RIGHTTOKEN_ISSUER`, `RIGHTTOKEN_AUDIENCE`, and `RIGHTTOKEN_JWKS_URL` when `AUTH_MODE === "righttoken"`. Do not add `none`, `disabled`, or fallback authentication modes.

- [ ] **Step 4: Expand both example environment files**

`recall-admin/.env.example` must contain only local-safe values. `deploy/recall.env.example` must use `RECALL_*` names and blank secret placeholders. Include comments showing that Compose maps `RECALL_DATABASE_URL` to `DATABASE_URL`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cd recall-admin
npm test -- tests/unit/env/server.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add recall-admin/src/lib/env/server.ts recall-admin/tests/unit/env/server.test.ts recall-admin/.env.example deploy/recall.env.example
git commit -m "feat: validate recall deployment environment"
```

---

### Task 2: Add Idempotent Primary Administrator Bootstrap

**Files:**
- Create: `recall-admin/src/modules/auth/bootstrap-primary-admin.ts`
- Create: `recall-admin/scripts/bootstrap-primary-admin.ts`
- Create: `recall-admin/tests/unit/auth/bootstrap-primary-admin.test.ts`
- Modify: `recall-admin/prisma/seed.ts`
- Modify: `recall-admin/package.json`

**Interfaces:**
- Produces: `bootstrapPrimaryAdmin(input: { email; password; displayName? }, dependencies?): Promise<{ id; created }>`
- Produces: `npm run db:bootstrap-admin`.
- Consumed by: local seed and production one-shot bootstrap service.

- [ ] **Step 1: Write the failing unit tests**

Cover:

1. Creates one `PRIMARY_ADMIN`.
2. Re-running with the same email updates password/display name without creating a second record.
3. Refuses to replace a different existing primary administrator.

```ts
const first = await bootstrapPrimaryAdmin({
  email,
  password: "bootstrap-test-password-123",
  displayName: "测试主管理员"
}, fakeDependencies);
const second = await bootstrapPrimaryAdmin({
  email,
  password: "bootstrap-test-password-456",
  displayName: "测试主管理员"
}, fakeDependencies);
expect(first.created).toBe(true);
expect(second.created).toBe(false);
expect(fakeDependencies.store.primaryAdmins).toHaveLength(1);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd recall-admin
npm test -- tests/unit/auth/bootstrap-primary-admin.test.ts
```

Expected: FAIL because the bootstrap service does not exist.

- [ ] **Step 3: Implement the service**

Normalize the email, require a password length of at least 12, query all primary admins, refuse conflicting ownership, hash with existing `hashPassword()`, and use `upsert`. Return whether the target email existed before the call. Never log the password. Inject a minimal store and password hasher in tests; production defaults use Prisma and `hashPassword()`.

- [ ] **Step 4: Add the CLI and seed reuse**

The CLI reads:

```text
BOOTSTRAP_PRIMARY_ADMIN_EMAIL
BOOTSTRAP_PRIMARY_ADMIN_PASSWORD
BOOTSTRAP_PRIMARY_ADMIN_NAME
```

It prints only the member ID and whether it was created. Refactor `prisma/seed.ts` to call the same service before creating synthetic users and tasks.

Add:

```json
"db:bootstrap-admin": "tsx scripts/bootstrap-primary-admin.ts"
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd recall-admin
npm test -- tests/unit/auth/bootstrap-primary-admin.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add recall-admin/src/modules/auth/bootstrap-primary-admin.ts recall-admin/scripts/bootstrap-primary-admin.ts recall-admin/tests/unit/auth/bootstrap-primary-admin.test.ts recall-admin/prisma/seed.ts recall-admin/package.json recall-admin/package-lock.json
git commit -m "feat: bootstrap the recall primary admin"
```

---

### Task 3: Add Safe Liveness and Readiness Endpoints

**Files:**
- Create: `recall-admin/src/modules/health/readiness.ts`
- Create: `recall-admin/src/app/api/health/live/route.ts`
- Create: `recall-admin/src/app/api/health/ready/route.ts`
- Create: `recall-admin/tests/unit/health/readiness.test.ts`
- Create: `recall-admin/tests/unit/health/routes.test.ts`

**Interfaces:**
- Produces: `checkReadiness(probe): Promise<ReadinessResult>`.
- Produces: `GET /api/health/live`.
- Produces: `GET /api/health/ready`.
- Consumed by: Docker and Caddy health checks.

- [ ] **Step 1: Write failing tests**

Test that liveness always returns `{ status: "ok" }`, readiness returns 200 when the probe succeeds, and readiness returns 503 with `{ status: "unavailable" }` when the probe throws. Assert the response never includes exception text, `DATABASE_URL`, or a stack.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd recall-admin
npm test -- tests/unit/health
```

Expected: FAIL because the health modules and routes do not exist.

- [ ] **Step 3: Implement minimal probes**

Use:

```ts
export async function checkReadiness(
  probe: () => Promise<unknown>
): Promise<{ ready: boolean }> {
  try {
    await probe();
    return { ready: true };
  } catch {
    return { ready: false };
  }
}
```

The ready route calls `prisma.$queryRaw\`SELECT 1\`` and returns only status plus a timestamp. Both routes set `Cache-Control: no-store`.

- [ ] **Step 4: Verify and commit**

Run:

```bash
cd recall-admin
npm test -- tests/unit/health
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add recall-admin/src/modules/health recall-admin/src/app/api/health recall-admin/tests/unit/health
git commit -m "feat: expose recall health checks"
```

---

### Task 4: Expose the Authenticated RightToken Event Endpoint

**Files:**
- Create: `recall-admin/src/modules/integrations/internal-api-auth.ts`
- Create: `recall-admin/src/modules/tasks/runtime-scheduler.ts`
- Create: `recall-admin/src/app/api/internal/righttoken/events/route.ts`
- Create: `recall-admin/tests/unit/integrations/internal-api-auth.test.ts`
- Create: `recall-admin/tests/integration/users/event-route.test.ts`
- Modify: `recall-admin/src/worker/boss.ts`

**Interfaces:**
- Produces: `isValidInternalBearer(header, current, previous?): boolean`.
- Produces: `getRuntimeTaskScheduler(): Promise<TaskScheduler>`.
- Produces: `POST /api/internal/righttoken/events`.
- Consumes: `ingestUserEvent(input, scheduler)`.

- [ ] **Step 1: Write the failing authentication tests**

Test missing/malformed bearer headers, wrong secrets, the current secret, and the optional previous secret. Use equal-length and different-length wrong inputs to verify no exception leaks.

- [ ] **Step 2: Implement constant-time secret comparison**

Parse exactly one `Bearer <token>` value. Hash both candidate and configured secrets with SHA-256, then use `timingSafeEqual()` on the digests. Never compare raw secret strings and never log them.

- [ ] **Step 3: Write the failing route integration tests**

Cover:

1. Missing token returns 401.
2. Invalid event returns 400 with `INVALID_EVENT`.
3. Valid registration returns 202.
4. Replaying the same `event_id` returns 200 with `duplicate: true`.
5. The database contains one event and one user.

Build the route handler so tests can inject a `TaskScheduler`; the exported Next.js `POST` uses the runtime scheduler.

- [ ] **Step 4: Implement a Web-side pg-boss producer singleton**

Reuse `createBoss()` and `ensureQueues()` and construct `PgTaskScheduler`. Cache the started boss and scheduler on `globalThis` in development to prevent duplicate connections during hot reload.

- [ ] **Step 5: Implement the event route**

The route:

```ts
const body = await request.json().catch(() => null);
if (!isValidInternalBearer(
  request.headers.get("authorization"),
  env.INTERNAL_API_SECRET_CURRENT,
  env.INTERNAL_API_SECRET_PREVIOUS
)) {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}
const parsed = rightTokenEventSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });
}
const result = await ingestUserEvent(
  parsed.data,
  await getRuntimeTaskScheduler()
);
return NextResponse.json(result, {
  status: result.duplicate ? 200 : 202
});
```

Unexpected failures return 503 with `EVENT_INGESTION_UNAVAILABLE`; no raw exception is returned.

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd recall-admin
npm test -- tests/unit/integrations/internal-api-auth.test.ts
npm run test:integration -- tests/integration/users/event-route.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add recall-admin/src/modules/integrations recall-admin/src/modules/tasks/runtime-scheduler.ts recall-admin/src/app/api/internal/righttoken/events recall-admin/tests/unit/integrations recall-admin/tests/integration/users/event-route.test.ts recall-admin/src/worker/boss.ts
git commit -m "feat: accept authenticated RightToken events"
```

---

### Task 5: Build One Production Image for Web and Worker

**Files:**
- Create: `recall-admin/Dockerfile`
- Create: `recall-admin/.dockerignore`
- Create: `recall-admin/scripts/worker-health.mjs`
- Create: `recall-admin/tests/unit/config/container-files.test.ts`
- Modify: `recall-admin/package.json`
- Modify: `recall-admin/package-lock.json`

**Interfaces:**
- Produces: image command `node server.js` for Web.
- Produces: image command `node dist/worker/index.mjs` for Worker.
- Produces: `npm run worker:build` and `npm run worker:health`.

- [ ] **Step 1: Write a failing container configuration test**

Read `Dockerfile` and `.dockerignore` and assert:

- Node base is `node:24.18-bookworm-slim`.
- runtime contains `USER nextjs`.
- Web healthcheck targets `/api/health/ready`.
- `.env`, `.git`, `.next`, `node_modules`, `coverage`, `tests`, and `*.log` are excluded.

- [ ] **Step 2: Add deterministic Worker bundling**

Install `esbuild` as a direct dev dependency and add:

```json
"worker:build": "esbuild src/worker/index.ts --bundle --platform=node --format=esm --target=node24 --packages=external --outfile=dist/worker/index.mjs",
"worker:prod": "node dist/worker/index.mjs",
"worker:health": "node scripts/worker-health.mjs"
```

The health script uses `pg` with `JOB_DATABASE_URL`, executes `SELECT 1`, closes the connection, and exits nonzero on failure without printing the connection string.

- [ ] **Step 3: Create the multi-stage Dockerfile**

Stages:

1. `deps`: `npm ci`.
2. `builder`: `npm run build` and `npm run worker:build`.
3. `prod-deps`: `npm ci --omit=dev`.
4. `runner`: copy Next standalone output, static assets, public files when present, production dependencies, bundled Worker, Prisma migrations, scripts, and package metadata.

Create UID/GID 1001, chown runtime files, set `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`, switch to `USER nextjs`, expose 3000, and use a Node-based HTTP healthcheck.

- [ ] **Step 4: Run source verification**

Run:

```bash
cd recall-admin
npm test -- tests/unit/config/container-files.test.ts
npm run worker:build
npm run build
```

Expected: PASS and both `.next/standalone/server.js` and `dist/worker/index.mjs` exist.

- [ ] **Step 5: Build and inspect the image**

Run:

```bash
docker build -t righttoken-recall-admin:test recall-admin
docker image inspect righttoken-recall-admin:test --format '{{.Config.User}}'
```

Expected: build succeeds and inspection prints `nextjs`.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/Dockerfile recall-admin/.dockerignore recall-admin/scripts/worker-health.mjs recall-admin/tests/unit/config/container-files.test.ts recall-admin/package.json recall-admin/package-lock.json
git commit -m "build: containerize recall web and worker"
```

---

### Task 6: Assemble Local and Production Compose Environments

**Files:**
- Modify: `recall-admin/compose.yaml`
- Modify: `recall-admin/.env.example`
- Create: `deploy/docker-compose.recall.yml`
- Create: `deploy/Caddyfile.recall`
- Create: `deploy/backup-recall.sh`
- Create: `recall-admin/tests/unit/config/compose-files.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: local services `recall-db`, `recall-migrate`, `recall-seed`, `recall-web`, `recall-worker`.
- Produces: production services `recall-db`, `recall-migrate`, `recall-bootstrap`, `recall-web`, `recall-worker`.
- Produces: host ingress at `127.0.0.1:${RECALL_SERVER_PORT:-3000}`.

- [ ] **Step 1: Write failing Compose policy tests**

Parse both YAML files as text and assert:

- PostgreSQL is version 16.
- production DB has no `ports`.
- production Worker and migration have no `ports`.
- production Web binds `127.0.0.1`.
- Web and Worker use the same image reference.
- Web/Worker depend on a successful migration.
- no default secret contains a real domain account or production credential.

- [ ] **Step 2: Replace local Compose with the complete stack**

Use `build: .` for Web and reuse the image via an anchor. `recall-db` publishes only `127.0.0.1:55432:5432`. `recall-migrate` runs `npm run db:deploy`; `recall-seed` runs `npm run db:seed`; Web and Worker start only after seed succeeds. Add health checks and the named volume `recall_postgres_data`.

- [ ] **Step 3: Create the production Compose override**

Map deployment variables:

```yaml
environment:
  DATABASE_URL: ${RECALL_DATABASE_URL:?RECALL_DATABASE_URL is required}
  JOB_DATABASE_URL: ${RECALL_JOB_DATABASE_URL:?RECALL_JOB_DATABASE_URL is required}
  SESSION_COOKIE_SECRET: ${RECALL_SESSION_COOKIE_SECRET:?RECALL_SESSION_COOKIE_SECRET is required}
  APP_ENCRYPTION_KEY: ${RECALL_APP_ENCRYPTION_KEY:?RECALL_APP_ENCRYPTION_KEY is required}
  APP_URL: ${RECALL_APP_URL:-https://recall.righttoken.ai}
  AUTH_MODE: ${RECALL_AUTH_MODE:-standalone}
  INTERNAL_API_SECRET_CURRENT: ${RECALL_INTERNAL_API_SECRET_CURRENT:?RECALL_INTERNAL_API_SECRET_CURRENT is required}
  INTERNAL_API_SECRET_PREVIOUS: ${RECALL_INTERNAL_API_SECRET_PREVIOUS:-}
```

Use image `${RECALL_IMAGE:?RECALL_IMAGE is required}` for Web, Worker, migration, and bootstrap. Bind Web to `127.0.0.1:${RECALL_SERVER_PORT:-3000}:3000`. Add `sub2api-network` and an internal `recall-network`; only Web joins both.

- [ ] **Step 4: Add Caddy and backup files**

`deploy/Caddyfile.recall` proxies `recall.righttoken.ai` to `127.0.0.1:3000`, performs `/api/health/ready` checks, enables gzip/zstd, security headers, JSON access logging, and a 10 MB request-body limit.

`backup-recall.sh` requires an explicit backup directory, runs `pg_dump` through the `recall-db` service, writes a timestamped custom-format dump with `umask 077`, and removes daily files older than 14 days. It must never print the database password.

- [ ] **Step 5: Verify Compose rendering**

Run:

```bash
cd recall-admin
docker compose --env-file .env.example config
cd ../deploy
docker compose --env-file .env.example --env-file recall.env.example -f docker-compose.yml -f docker-compose.recall.yml config
```

Expected: both commands exit 0; rendered production config has no host port for recall DB or Worker.

- [ ] **Step 6: Run local smoke test**

Run:

```bash
cd recall-admin
docker compose --env-file .env.example up --build -d
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
docker compose ps
```

Expected: both health requests return 200; DB, Web, and Worker are healthy; migration and seed exited 0.

- [ ] **Step 7: Commit**

```bash
git add .gitignore recall-admin/compose.yaml recall-admin/.env.example recall-admin/tests/unit/config/compose-files.test.ts deploy/docker-compose.recall.yml deploy/Caddyfile.recall deploy/backup-recall.sh deploy/recall.env.example
git commit -m "build: add recall deployment stack"
```

---

### Task 7: Add Recall CI and Deployment Documentation

**Files:**
- Create: `.github/workflows/recall-admin-ci.yml`
- Modify: `recall-admin/README.md`
- Create: `recall-admin/docs/deployment.md`
- Create: `recall-admin/tests/unit/config/ci-workflow.test.ts`

**Interfaces:**
- Produces: path-filtered CI for recall source and deployment files.
- Produces: developer and operator runbooks.

- [ ] **Step 1: Write a failing workflow policy test**

Assert the workflow:

- triggers for `recall-admin/**`, `deploy/docker-compose.recall.yml`, `deploy/Caddyfile.recall`, and itself;
- uses Node 24.18;
- runs `npm ci`, unit tests, typecheck, lint, build, Docker build, and Compose config;
- grants only `contents: read`.

- [ ] **Step 2: Create the workflow**

Use separate `quality` and `container` jobs. Add a PostgreSQL 16 service for integration tests, but do not inject production or repository secrets. Use deterministic test secrets and `example.test` addresses.

- [ ] **Step 3: Write the runbooks**

Document:

- local one-command startup and test credentials;
- independent primary-admin bootstrap;
- production secret generation;
- image-SHA requirement;
- migration/start/health order;
- Caddy validation and reload;
- event API curl using a synthetic `example.test` user;
- backup and restore rehearsal;
- rollback decision points;
- how `AUTH_MODE=righttoken` remains disabled until the identity adapter is implemented.

- [ ] **Step 4: Verify and commit**

Run:

```bash
cd recall-admin
npm test -- tests/unit/config/ci-workflow.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add .github/workflows/recall-admin-ci.yml recall-admin/README.md recall-admin/docs/deployment.md recall-admin/tests/unit/config/ci-workflow.test.ts
git commit -m "ci: verify recall deployment readiness"
```

---

### Task 8: Run the Release-readiness Verification Gate

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Produces: evidence that the branch is locally publishable without touching production.

- [ ] **Step 1: Run all application checks**

Run:

```bash
cd recall-admin
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
npm run worker:build
```

Expected: every command exits 0.

- [ ] **Step 2: Run container checks**

Run:

```bash
docker build -t righttoken-recall-admin:test recall-admin
docker image inspect righttoken-recall-admin:test --format '{{.Config.User}}'
docker compose --env-file recall-admin/.env.example -f recall-admin/compose.yaml config
docker compose --env-file deploy/.env.example --env-file deploy/recall.env.example -f deploy/docker-compose.yml -f deploy/docker-compose.recall.yml config
```

Expected: image user is `nextjs`; both Compose configurations render successfully.

- [ ] **Step 3: Run the full local smoke path**

Run:

```bash
docker compose --env-file recall-admin/.env.example -f recall-admin/compose.yaml up --build -d
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
curl --fail -c /tmp/recall-smoke.cookies \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://127.0.0.1:3000' \
  --data '{"email":"primary-admin@example.test","password":"DevelopmentOnlyPassword123!"}' \
  http://127.0.0.1:3000/api/auth/login
EVENT_ID="smoke-$(uuidgen)"
EVENT_BODY="{\"event_id\":\"${EVENT_ID}\",\"event_type\":\"user.registered\",\"occurred_at\":\"2026-07-23T12:00:00.000Z\",\"user_id\":\"${EVENT_ID}\",\"payload\":{\"email\":\"${EVENT_ID}@example.test\",\"country_code\":\"SG\"}}"
curl --fail \
  -H 'Authorization: Bearer development-only-internal-secret-32-chars' \
  -H 'Content-Type: application/json' \
  --data "${EVENT_BODY}" \
  http://127.0.0.1:3000/api/internal/righttoken/events
curl --fail \
  -H 'Authorization: Bearer development-only-internal-secret-32-chars' \
  -H 'Content-Type: application/json' \
  --data "${EVENT_BODY}" \
  http://127.0.0.1:3000/api/internal/righttoken/events
docker compose --env-file recall-admin/.env.example -f recall-admin/compose.yaml ps
```

Expected: both health endpoints return 200; login returns a primary-admin session and the expected 2FA next step; the first event returns `duplicate: false`; the second returns `duplicate: true`; DB, Web, and Worker are healthy.

- [ ] **Step 4: Inspect security boundaries**

Verify:

```bash
git grep -nE '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|sk-[A-Za-z0-9_-]{20,})' -- . ':!package-lock.json'
git ls-files '*.env' '*.pem' '*.key'
git status --short
```

Expected: no credential matches; only explicitly approved example files appear in the tracked-file query; no untracked environment, backup, database, or build artifacts appear in status.

- [ ] **Step 5: Stop local containers without deleting data**

Run:

```bash
docker compose --env-file recall-admin/.env.example -f recall-admin/compose.yaml down
```

Expected: containers stop; the named database volume remains available for later testing.

- [ ] **Step 6: Record the final verification commit**

If verification required fixes, commit only those fixes:

```bash
git add -u
git commit -m "fix: complete recall deployment verification"
```

If no files changed, do not create an empty commit.

- [ ] **Step 7: Push the branch**

Run:

```bash
git push origin codex/righttoken-user-recall-admin
```

Expected: remote branch points to the locally verified commit. Do not merge to `main` and do not deploy production.
