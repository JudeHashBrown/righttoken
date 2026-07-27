# RightToken 用户运营管理上线集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让获授权的 RightToken 用户从主站进入“用户运营管理”并自动建立召回后台会话，同时修正真实用户快照口径并启用生产同步。

**Architecture:** RightToken 主站通过受 JWT 保护的接口向召回后台查询访问资格，并签发 60 秒有效的一次性 HMAC 票据。召回后台以本地 `Member` 为权限来源，兑换票据后创建现有 HttpOnly 会话；用户数据通过独立 Bearer 密钥每 15 分钟增量同步并每日全量校准。

**Tech Stack:** Go 1.26、Gin、Ent/PostgreSQL、Vue 3/Pinia、Next.js、TypeScript、Prisma/PostgreSQL、Vitest、Go testing。

## Global Constraints

- 主站菜单文案固定为“用户运营管理”。
- 生产入口固定为 `https://recall.righttoken.ai/dashboard`。
- 登录票据有效期不超过 60 秒并且只能兑换一次。
- 召回后台 `Member` 角色是权限唯一来源。
- 生产环境禁止 `AUTH_MODE=development`。
- 增量同步间隔固定为 15 分钟，每日全量校准为北京时间 02:00。
- 企业微信不属于本轮上线阻塞项。
- 不提交真实邮箱、IP、数据库副本或任何密钥到 Git。

---

### Task 1: 召回成员身份绑定与一次性票据

**Files:**
- Modify: `recall-admin/prisma/schema.prisma`
- Create: `recall-admin/prisma/migrations/20260726180000_righttoken_sso/migration.sql`
- Create: `recall-admin/src/modules/auth/righttoken-ticket.ts`
- Create: `recall-admin/src/modules/auth/righttoken-member.ts`
- Create: `recall-admin/tests/unit/auth/righttoken-ticket.test.ts`
- Create: `recall-admin/tests/integration/auth/righttoken-member.test.ts`

**Interfaces:**
- Produces: `verifyRightTokenTicket(ticket: string, secret: string, now?: Date): RightTokenIdentity`
- Produces: `resolveRightTokenMember(identity: RightTokenIdentity): Promise<Member | null>`
- Produces: `redeemRightTokenJti(jti: string, expiresAt: Date): Promise<boolean>`

- [ ] Write tests proving valid tickets verify, expired/wrong-audience/wrong-signature tickets fail, and duplicate `jti` redemption fails.
- [ ] Run the focused unit and integration tests and confirm they fail because the SSO modules and schema do not exist.
- [ ] Add `Member.rightTokenUserId String? @unique` and `SsoTicketRedemption(jti, expiresAt, redeemedAt)`.
- [ ] Implement strict base64url JSON parsing, constant-time HMAC verification and claim validation.
- [ ] Implement stable-ID lookup, one-time email binding and active-member enforcement.
- [ ] Regenerate Prisma client and rerun focused tests until green.

### Task 2: 召回后台授权检查与登录回调

**Files:**
- Create: `recall-admin/src/app/api/internal/righttoken/access-check/route.ts`
- Create: `recall-admin/src/app/api/auth/righttoken/callback/route.ts`
- Modify: `recall-admin/src/proxy.ts`
- Modify: `recall-admin/src/app/(auth)/login/page.tsx`
- Modify: `recall-admin/src/lib/env/server.ts`
- Create: `recall-admin/tests/integration/auth/righttoken-sso-routes.test.ts`
- Modify: `recall-admin/tests/unit/auth/proxy.test.ts`
- Modify: `recall-admin/tests/unit/env/server.test.ts`

**Interfaces:**
- Consumes: `verifyRightTokenTicket`, `resolveRightTokenMember`, `redeemRightTokenJti`, `createSession`
- Produces: `POST /api/internal/righttoken/access-check`
- Produces: `GET /api/auth/righttoken/callback`

- [ ] Write route tests for allowed, denied, bad internal secret, valid callback, replayed ticket and unsafe `next`.
- [ ] Write an environment test proving production rejects `AUTH_MODE=development`.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement the internal access check using current/previous internal Bearer secrets.
- [ ] Implement callback redemption, secure session cookie and allowlisted local redirect.
- [ ] Redirect `/login` to the configured RightToken admin URL in righttoken mode.
- [ ] Add production-mode environment validation and rerun tests.

### Task 3: RightToken 主站 SSO 签发接口

**Files:**
- Create: `backend/internal/service/recall_sso.go`
- Create: `backend/internal/service/recall_sso_test.go`
- Create: `backend/internal/handler/recall_sso_handler.go`
- Create: `backend/internal/handler/recall_sso_handler_test.go`
- Modify: `backend/internal/handler/handler.go`
- Modify: `backend/internal/handler/wire.go`
- Modify: `backend/internal/server/routes/user.go`
- Modify: `backend/internal/config/config.go`
- Modify: `backend/internal/config/config_test.go`
- Modify: `backend/cmd/server/wire_gen.go`

**Interfaces:**
- Produces: `GET /api/v1/user/recall/access`
- Produces: `POST /api/v1/user/recall/sso`
- Produces: signed claims `iss`, `aud`, `sub`, `email`, `name`, `iat`, `exp`, `jti`

- [ ] Write service tests for deterministic HMAC format, 60-second expiry, audience and random `jti`.
- [ ] Write handler tests for access proxying, denied access, SSO URL generation and fail-closed configuration.
- [ ] Run focused Go tests and confirm expected failures.
- [ ] Add recall SSO URL, shared secret and internal secret configuration with fail-closed validation.
- [ ] Implement access-check client and ticket signer without logging ticket contents.
- [ ] Register both endpoints under the existing authenticated user route group.
- [ ] Regenerate Wire output as needed and rerun focused tests.

### Task 4: 主站“用户运营管理”入口

**Files:**
- Create: `frontend/src/composables/useRecallAccess.ts`
- Create: `frontend/src/composables/useRecallAccess.test.ts`
- Modify: `frontend/src/components/layout/AppSidebar.vue`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en.ts`

**Interfaces:**
- Consumes: `GET /api/v1/user/recall/access`, `POST /api/v1/user/recall/sso`
- Produces: conditional sidebar item and `openRecallAdmin(): Promise<void>`

- [ ] Write Vue tests proving the entry is absent while denied, present while allowed, and uses the returned SSO URL on click.
- [ ] Run the focused frontend test and confirm it fails.
- [ ] Implement cached access lookup after authentication.
- [ ] Add “用户运营管理” to the admin navigation only when access is allowed.
- [ ] Implement click-to-SSO without exposing a ticket in application logs.
- [ ] Rerun focused tests and type checking.

### Task 5: 真实用户快照口径

**Files:**
- Modify: `backend/internal/handler/admin/recall_user_handler.go`
- Modify: `backend/internal/handler/admin/recall_user_handler_test.go`
- Modify: `backend/migrations/109_add_user_registration_ip.sql`
- Create: `backend/scripts/verify-recall-users.sql`

**Interfaces:**
- Produces: successful-only call facts and documented payment semantics in `GET /api/v1/admin/recall/users`

- [ ] Add tests for success-only usage aggregation, decimal-to-minor conversion, IP fallback and cursor ordering.
- [ ] Run focused Go tests and confirm the current all-usage query violates the success-only assertion.
- [ ] Change usage aggregation to the production schema’s explicit success predicate.
- [ ] Keep `anomalyActive=false` until a reliable anomaly fact is available and document that limitation.
- [ ] Add a read-only verification query that compares source facts with exported facts without selecting full email or IP.
- [ ] Run migration and query tests against the local schema.

### Task 6: 首次全量导入与生产同步

**Files:**
- Modify: `recall-admin/src/modules/integrations/righttoken/reconcile.ts`
- Modify: `recall-admin/src/worker/register-handlers.ts`
- Modify: `recall-admin/src/worker/job-names.ts`
- Create: `recall-admin/scripts/run-initial-reconcile.ts`
- Create: `recall-admin/tests/integration/integrations/initial-reconciliation.test.ts`
- Modify: `deploy/recall.env.example`
- Modify: `recall-admin/docs/runbooks/deployment.md`

**Interfaces:**
- Produces: idempotent initial full reconciliation summary
- Configures: 15-minute incrementals and `0 2 * * *` in the configured
  `Asia/Shanghai` timezone

- [ ] Write an integration test proving a full import reports source, processed, failed and skipped counts and triggers downstream recomputation.
- [ ] Run it and confirm the summary behavior is missing.
- [ ] Implement a resumable initial reconciliation command with redacted logs.
- [ ] Configure incremental and full schedules.
- [ ] Document dry-run, count comparison, activation and rollback steps.
- [ ] Run integration tests against the isolated `_test` database.

### Task 7: CSV 导出与权限强制

**Files:**
- Create: `recall-admin/src/app/api/users/export/route.ts`
- Create: `recall-admin/src/modules/users/export-users.ts`
- Modify: `recall-admin/src/app/(dashboard)/reports/page.tsx`
- Create: `recall-admin/tests/integration/users/export-users.test.ts`

**Interfaces:**
- Produces: `GET /api/users/export` returning UTF-8 BOM CSV
- Enforces: `requireRequestPermission(request, "users:export")`

- [ ] Write tests proving primary admin receives CSV while admin and operator receive 403.
- [ ] Run tests and confirm the route is missing.
- [ ] Implement bounded streaming CSV escaping formula cells and recording an audit entry.
- [ ] Replace the status-only label with a real download button for the primary admin.
- [ ] Rerun focused and authorization tests.

### Task 8: CI、生产保护与跨项目验收

**Files:**
- Modify: `.github/workflows/recall-admin-ci.yml`
- Modify: `deploy/docker-compose.recall.yml`
- Modify: `deploy/recall.env.example`
- Modify: `recall-admin/docs/deployment.md`

**Interfaces:**
- Enforces: production `AUTH_MODE=righttoken`
- Verifies: Go, Next.js and Vue test/build pipelines

- [ ] Change stale CI `AUTH_MODE=standalone` to a valid isolated test mode.
- [ ] Add SSO variables to deployment templates without real values.
- [ ] Run all focused tests, then full Go, recall-admin and frontend verification commands.
- [ ] Build the production recall image and verify `/api/health/ready`.
- [ ] Perform a requirements checklist review and record any item requiring production database or DNS credentials.
