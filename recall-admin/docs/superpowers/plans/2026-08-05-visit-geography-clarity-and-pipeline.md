# Visit Geography Clarity and Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate visit-IP geography from user-attribution geography and make the production visit pipeline verifiably collect real, resolvable client IPs.

**Architecture:** Keep `SiteVisit` as the immutable source for range-bound UV/PV geography, add an independent current-user country aggregation, and compose both on the visit dashboard with explicit labels. Add runtime GeoIP readiness, strict trusted-proxy environment parsing in the Go main site, privacy-safe forwarding diagnostics, and a one-off deployment verifier that checks the migrated table and GeoIP source before services are promoted.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/PostgreSQL, Vitest/Testing Library, Go 1.26, Gin, Viper, Docker Compose.

## Global Constraints

- Visit UV/PV geography must only use the IP observed for the visit event.
- User attribution geography may come from email rules, registration IP, main-site events, or manual confirmation and must never overwrite `SiteVisit.countryCode`.
- Current user country totals include only `UserProfile.sourceDeletedAt IS NULL` and do not change with the 7/30/90-day selector.
- Trusted proxy configuration must reject invalid entries and all-network ranges such as `0.0.0.0/0` and `::/0`.
- Visit tracking failures must not break browsing and logs must not include visitor IDs, IPs, cookies, authorization headers, or request bodies.
- Historical `ZZ` events are not rewritten.

---

### Task 1: Current user attribution country aggregation

**Files:**
- Create: `recall-admin/src/modules/users/country-summary.ts`
- Create: `recall-admin/tests/unit/users/country-summary.test.ts`

**Interfaces:**
- Consumes: `presentCountry(countryCode: string): string` from `@/modules/visits/geography` and the shared Prisma client.
- Produces: `getUserCountrySummary(source?: UserCountrySummarySource): Promise<UserCountrySummary>` where `UserCountrySummary` contains `total` and sorted `{ countryCode, name, users }[]` rows.

- [ ] **Step 1: Write the failing aggregation test**

```ts
import { describe, expect, it, vi } from "vitest";
import { getUserCountrySummary } from "@/modules/users/country-summary";

it("normalizes, merges and sorts active user attribution countries", async () => {
  const rows = vi.fn().mockResolvedValue([
    { countryCode: "GB", users: 1 },
    { countryCode: "sg", users: 3 },
    { countryCode: null, users: 2 },
    { countryCode: "invalid", users: 1 }
  ]);
  await expect(getUserCountrySummary({ rows })).resolves.toEqual({
    total: 7,
    countries: [
      { countryCode: "SG", name: "新加坡", users: 3 },
      { countryCode: "ZZ", name: "未知", users: 3 },
      { countryCode: "GB", name: "英国", users: 1 }
    ]
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd recall-admin && npm test -- tests/unit/users/country-summary.test.ts`

Expected: FAIL because `@/modules/users/country-summary` does not exist.

- [ ] **Step 3: Implement the minimal query and normalization**

```ts
export type UserCountrySummarySource = {
  rows(): Promise<Array<{ countryCode: string | null; users: number }>>;
};

export type UserCountrySummary = {
  total: number;
  countries: Array<{ countryCode: string; name: string; users: number }>;
};

function normalize(value: string | null): string {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/u.test(code) ? code : "ZZ";
}

export async function getUserCountrySummary(
  source: UserCountrySummarySource = prismaUserCountrySummarySource
): Promise<UserCountrySummary> {
  const merged = new Map<string, number>();
  for (const row of await source.rows()) {
    const code = normalize(row.countryCode);
    merged.set(code, (merged.get(code) ?? 0) + row.users);
  }
  const countries = [...merged].map(([countryCode, users]) => ({
    countryCode,
    name: presentCountry(countryCode),
    users
  })).sort((a, b) => b.users - a.users || a.countryCode.localeCompare(b.countryCode));
  return { total: countries.reduce((sum, row) => sum + row.users, 0), countries };
}
```

The production source must use `prisma.userProfile.groupBy` with `where: { sourceDeletedAt: null }`, `by: ["countryCode"]`, and `_count: { _all: true }`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `cd recall-admin && npm test -- tests/unit/users/country-summary.test.ts tests/unit/site-visit-queries.test.ts`

Expected: both test files PASS.

- [ ] **Step 5: Commit the task**

```bash
git add recall-admin/src/modules/users/country-summary.ts recall-admin/tests/unit/users/country-summary.test.ts
git commit -m "feat: aggregate user attribution countries"
```

### Task 2: GeoIP runtime readiness

**Files:**
- Create: `recall-admin/src/modules/geoip/runtime-status.ts`
- Create: `recall-admin/tests/unit/geoip/runtime-status.test.ts`

**Interfaces:**
- Consumes: `GEOIP_MMDB_PATH`, `GEOIP_RIR_PATH`, and `GEOIP_HTTP_URL` without reading tokens.
- Produces: `getGeoIpRuntimeStatus(environment?, readable?): Promise<GeoIpRuntimeStatus>` with kinds `city | country | remote | unavailable`.

- [ ] **Step 1: Write failing tests for all four readiness states**

```ts
expect(await getGeoIpRuntimeStatus(
  { GEOIP_MMDB_PATH: "/geo/city.mmdb" },
  async (path) => path.endsWith("city.mmdb")
)).toEqual({ kind: "city", provinceCapable: true });

expect(await getGeoIpRuntimeStatus(
  { GEOIP_RIR_PATH: "/geo/rir.txt" },
  async () => true
)).toEqual({ kind: "country", provinceCapable: false });

expect(await getGeoIpRuntimeStatus(
  { GEOIP_HTTP_URL: "https://geo.example/{ip}" },
  async () => false
)).toEqual({ kind: "remote", provinceCapable: false });

expect(await getGeoIpRuntimeStatus({}, async () => false)).toEqual({
  kind: "unavailable",
  provinceCapable: false
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd recall-admin && npm test -- tests/unit/geoip/runtime-status.test.ts`

Expected: FAIL because the runtime-status module does not exist.

- [ ] **Step 3: Implement a server-only status resolver**

Use `node:fs/promises.access` as the default readability check. Check MMDB first, then RIR, then a non-empty HTTP URL. Catch file errors and return only the status object; never return a token, path, or IP.

- [ ] **Step 4: Run the focused GeoIP tests and verify GREEN**

Run: `cd recall-admin && npm test -- tests/unit/geoip/runtime-status.test.ts tests/unit/geoip/http-resolver.test.ts`

Expected: both test files PASS.

- [ ] **Step 5: Commit the task**

```bash
git add recall-admin/src/modules/geoip/runtime-status.ts recall-admin/tests/unit/geoip/runtime-status.test.ts
git commit -m "feat: report geoip runtime readiness"
```

### Task 3: Clarify and extend the visit dashboard

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/visits/page.tsx`
- Modify: `recall-admin/src/app/(dashboard)/visits/visit-dashboard.module.css`
- Modify: `recall-admin/tests/unit/visit-dashboard-page.test.tsx`

**Interfaces:**
- Consumes: `getVisitDashboard(rangeDays)`, `getUserCountrySummary()`, and `getGeoIpRuntimeStatus()`.
- Produces: separate “访问 IP 国家或地区” and “注册用户运营归因国家” panels plus actionable unknown-IP status copy.

- [ ] **Step 1: Extend the page test and verify the desired copy**

Mock the new query modules and assert:

```ts
expect(screen.getByRole("heading", { name: "访问 IP 国家或地区" })).toBeInTheDocument();
expect(screen.getByText("该表按页面访问时的 IP 统计，不读取用户档案地区。")).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "注册用户运营归因国家" })).toBeInTheDocument();
expect(screen.getByText("新加坡")).toBeInTheDocument();
expect(screen.getByText("英国")).toBeInTheDocument();
expect(screen.getByText(/GeoIP 数据源不可用/)).toBeInTheDocument();
expect(getUserCountrySummary).toHaveBeenCalledTimes(1);
expect(getGeoIpRuntimeStatus).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `cd recall-admin && npm test -- tests/unit/visit-dashboard-page.test.tsx`

Expected: FAIL because the old heading remains and the user summary panel does not exist.

- [ ] **Step 3: Implement the dashboard composition**

Fetch all three sources with `Promise.all`. Keep the existing visit metrics and range-bound tables. Add a full-width user table with user count and `percentage(row.users, userSummary.total)`. Use GeoIP status only to choose between:

```ts
const unknownCopy = geoIpStatus.kind === "unavailable"
  ? "GeoIP 数据源不可用，当前未知访问无法解析；请检查部署配置和数据文件。"
  : "GeoIP 数据源已启用；剩余未知访问通常来自内网、保留地址或查询未命中。";
```

Add only the CSS required for a warning data note and the full-width user panel; reuse current table and panel classes.

- [ ] **Step 4: Run page, query, and navigation tests and verify GREEN**

Run: `cd recall-admin && npm test -- tests/unit/visit-dashboard-page.test.tsx tests/unit/site-visit-queries.test.ts tests/e2e/navigation.spec.ts`

Expected: unit files PASS. If Vitest does not collect the Playwright file, run `npm run test:e2e -- navigation.spec.ts` separately during final verification.

- [ ] **Step 5: Commit the task**

```bash
git add 'recall-admin/src/app/(dashboard)/visits/page.tsx' 'recall-admin/src/app/(dashboard)/visits/visit-dashboard.module.css' recall-admin/tests/unit/visit-dashboard-page.test.tsx
git commit -m "feat: separate visit and user geography"
```

### Task 4: Strict trusted-proxy environment configuration

**Files:**
- Modify: `backend/internal/config/config.go`
- Modify: `backend/internal/config/config_test.go`
- Modify: `backend/internal/handler/analytics_handler_test.go`
- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/.env.example`
- Modify: `deploy/config.example.yaml`

**Interfaces:**
- Consumes: comma-separated `SERVER_TRUSTED_PROXIES`.
- Produces: `ParseTrustedProxies(raw string) ([]string, error)` and `Config.Server.TrustedProxies` populated before Gin calls `SetTrustedProxies`.

- [ ] **Step 1: Write failing parser and proxy-chain tests**

```go
func TestParseTrustedProxies(t *testing.T) {
  got, err := ParseTrustedProxies("172.18.0.1, 10.20.0.0/16")
  require.NoError(t, err)
  require.Equal(t, []string{"172.18.0.1", "10.20.0.0/16"}, got)
}

func TestParseTrustedProxiesRejectsUnsafeOrInvalidValues(t *testing.T) {
  for _, raw := range []string{"bad-value", "0.0.0.0/0", "::/0"} {
    _, err := ParseTrustedProxies(raw)
    require.Error(t, err)
  }
}

func TestLoadReadsTrustedProxiesFromEnv(t *testing.T) {
  resetViperWithJWTSecret(t)
  t.Setenv("SERVER_TRUSTED_PROXIES", "172.18.0.1")
  cfg, err := Load()
  require.NoError(t, err)
  require.Equal(t, []string{"172.18.0.1"}, cfg.Server.TrustedProxies)
}
```

Extend the analytics router test with `router.SetTrustedProxies([]string{"192.0.2.10"})`, a request from that proxy, and `X-Forwarded-For: 198.51.100.24`; assert the tracked IP is `198.51.100.24`. Keep the existing no-proxy test to prove spoofed headers are ignored when trust is disabled.

- [ ] **Step 2: Run focused Go tests and verify RED**

Run: `cd backend && go test ./internal/config ./internal/handler -run 'Test(ParseTrustedProxies|LoadReadsTrustedProxiesFromEnv|AnalyticsVisit)' -count=1`

Expected: FAIL because the parser and environment binding do not exist.

- [ ] **Step 3: Implement strict parsing and binding**

Parse each trimmed entry with `net/netip.ParsePrefix` or `net/netip.ParseAddr`; reject empty members, invalid input, and any prefix with zero bits. In `load`, when `SERVER_TRUSTED_PROXIES` is present, parse it before `viper.Unmarshal` and call `viper.Set("server.trusted_proxies", parsed)`; return a contextual configuration error on failure.

Map the environment variable in Compose:

```yaml
- SERVER_TRUSTED_PROXIES=${SERVER_TRUSTED_PROXIES:?SERVER_TRUSTED_PROXIES is required}
```

Document a non-routable placeholder in `.env.example` and explain in `config.example.yaml` that production must replace it with the exact reverse-proxy or Docker gateway IP/CIDR.

- [ ] **Step 4: Run Go and Compose tests and verify GREEN**

Run: `cd backend && go test ./internal/config ./internal/handler -run 'Test(ParseTrustedProxies|LoadReadsTrustedProxiesFromEnv|AnalyticsVisit)' -count=1`

Run: `cd recall-admin && npm test -- tests/unit/config/compose-files.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the task**

```bash
git add backend/internal/config/config.go backend/internal/config/config_test.go backend/internal/handler/analytics_handler_test.go deploy/docker-compose.yml deploy/.env.example deploy/config.example.yaml recall-admin/tests/unit/config/compose-files.test.ts
git commit -m "fix: require safe trusted proxy configuration"
```

### Task 5: Privacy-safe visit forwarding diagnostics

**Files:**
- Modify: `backend/internal/handler/analytics_handler.go`
- Modify: `backend/internal/handler/analytics_handler_test.go`

**Interfaces:**
- Consumes: errors returned by `recallVisitTracker.Track`.
- Produces: at most one sanitized warning per minute with kinds `unconfigured`, `timeout`, or `forward_failed`, while retaining the 204 response.

- [ ] **Step 1: Write a failing throttled-warning test**

Construct the handler with an injected clock and warning sink, return an error from the tracker twice within one minute, and assert:

```go
require.Equal(t, http.StatusNoContent, first.Code)
require.Equal(t, http.StatusNoContent, second.Code)
require.Equal(t, []string{"forward_failed"}, warnings)
require.NotContains(t, warnings[0], tracker.event.IP)
require.NotContains(t, warnings[0], tracker.event.VisitorID)
```

Advance the clock beyond one minute, send a third request, and assert a second warning is emitted.

- [ ] **Step 2: Run the handler tests and verify RED**

Run: `cd backend && go test ./internal/handler -run TestAnalyticsVisit -count=1`

Expected: FAIL because the handler has no warning sink or throttle.

- [ ] **Step 3: Implement minimal classified throttling**

Add private handler fields for `now`, `warn`, `warningMu`, and `lastWarningAt`. The production constructor uses `time.Now` and `slog.Warn("recall_visit_tracking_failed", "kind", kind)`. Classify `ErrRecallVisitUnavailable` as `unconfigured`, context deadline/cancellation as `timeout`, and everything else as `forward_failed`. Do not pass the raw error to the logger.

- [ ] **Step 4: Run handler and service tests and verify GREEN**

Run: `cd backend && go test ./internal/handler ./internal/service -run 'TestAnalyticsVisit|TestRecallVisitService' -count=1`

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the task**

```bash
git add backend/internal/handler/analytics_handler.go backend/internal/handler/analytics_handler_test.go
git commit -m "fix: diagnose visit forwarding failures safely"
```

### Task 6: Deployment preflight for visits and GeoIP

**Files:**
- Create: `recall-admin/scripts/verify-visit-pipeline.ts`
- Create: `recall-admin/tests/unit/scripts/verify-visit-pipeline.test.ts`
- Modify: `recall-admin/package.json`
- Modify: `recall-admin/Dockerfile`
- Modify: `.github/workflows/recall-admin-ci.yml`
- Modify: `deploy/docker-compose.recall.yml`
- Modify: `deploy/recall.env.example`
- Modify: `recall-admin/tests/unit/config/compose-files.test.ts`
- Modify: `recall-admin/tests/unit/config/ci-workflow.test.ts`
- Modify: `recall-admin/docs/deployment.md`
- Modify: `recall-admin/docs/runbooks/deployment.md`

**Interfaces:**
- Consumes: migrated PostgreSQL database and the same GeoIP environment as recall Web.
- Produces: `verifyVisitPipeline(dependencies): Promise<void>`, bundled `dist/verify-visit-pipeline.mjs`, and a one-off `recall-visit-verify` Compose service.

- [ ] **Step 1: Write failing verifier tests**

```ts
it("fails when the SiteVisit table is missing", async () => {
  await expect(verifyVisitPipeline({
    siteVisitTableExists: async () => false,
    geoIpStatus: async () => ({ kind: "city", provinceCapable: true })
  })).rejects.toThrow("VISIT_PIPELINE_TABLE_MISSING");
});

it("fails when GeoIP has no usable source", async () => {
  await expect(verifyVisitPipeline({
    siteVisitTableExists: async () => true,
    geoIpStatus: async () => ({ kind: "unavailable", provinceCapable: false })
  })).rejects.toThrow("VISIT_PIPELINE_GEOIP_UNAVAILABLE");
});
```

- [ ] **Step 2: Run the verifier test and verify RED**

Run: `cd recall-admin && npm test -- tests/unit/scripts/verify-visit-pipeline.test.ts`

Expected: FAIL because the verifier module does not exist.

- [ ] **Step 3: Implement and bundle the verifier**

Use `SELECT to_regclass('recall."SiteVisit"')` through Prisma for the table check and `getGeoIpRuntimeStatus()` for source readiness. The CLI prints only `visit_pipeline_ready:<kind>` on success and a stable error code on failure, disconnects Prisma in `finally`, and exits nonzero on failure.

Add scripts:

```json
"visit:verify": "node --env-file-if-exists=.env --import tsx scripts/verify-visit-pipeline.ts",
"visit:verify:build": "esbuild scripts/verify-visit-pipeline.ts --bundle --platform=node --format=esm --target=node24 --packages=external --outfile=dist/verify-visit-pipeline.mjs",
"visit:verify:prod": "node dist/verify-visit-pipeline.mjs"
```

Include `npm run visit:verify:build` in the Docker builder and CI build job. Add a `recall-visit-verify` service using the recall environment, `npm run visit:verify:prod`, and a dependency on successful `recall-migrate`. Make recall Web and Worker depend on successful verifier completion.

- [ ] **Step 4: Add deployment contract tests and documentation**

Assert Compose contains `recall-visit-verify`, `condition: service_completed_successfully`, the verifier command, and required GeoIP environment mappings. Update deployment docs so the order is migrate → verify → Web/Worker, and include the post-deploy row-count smoke check without exposing visitor data.

- [ ] **Step 5: Run verifier, config, and environment tests and verify GREEN**

Run: `cd recall-admin && npm test -- tests/unit/scripts/verify-visit-pipeline.test.ts tests/unit/config/compose-files.test.ts tests/unit/config/ci-workflow.test.ts tests/unit/env/server.test.ts`

Run: `cd recall-admin && npm run visit:verify:build`

Expected: tests PASS and `dist/verify-visit-pipeline.mjs` builds successfully.

- [ ] **Step 6: Commit the task**

```bash
git add recall-admin/scripts/verify-visit-pipeline.ts recall-admin/tests/unit/scripts/verify-visit-pipeline.test.ts recall-admin/package.json recall-admin/Dockerfile .github/workflows/recall-admin-ci.yml deploy/docker-compose.recall.yml deploy/recall.env.example recall-admin/tests/unit/config/compose-files.test.ts recall-admin/tests/unit/config/ci-workflow.test.ts recall-admin/docs/deployment.md recall-admin/docs/runbooks/deployment.md
git commit -m "fix: gate deployment on visit pipeline readiness"
```

### Task 7: Full verification and branch handoff

**Files:**
- Verify all modified files from Tasks 1–6.

**Interfaces:**
- Consumes: completed implementation commits.
- Produces: a fully verified branch ready for push and developer deployment.

- [ ] **Step 1: Run recall unit and integration suites**

Run: `cd recall-admin && npm test`

Run: `cd recall-admin && npm run test:integration`

Expected: all Vitest unit and integration files PASS.

- [ ] **Step 2: Run recall static and production checks**

Run: `cd recall-admin && npm run typecheck`

Run: `cd recall-admin && npm run lint`

Run: `cd recall-admin && npm run build`

Run: `cd recall-admin && npm run worker:build && npm run visit:verify:build`

Expected: all commands exit 0.

- [ ] **Step 3: Run main-site checks**

Run: `cd backend && go test ./internal/config ./internal/handler ./internal/service -count=1`

Run: `cd frontend && npm run test -- --run src/api/__tests__/analytics.spec.ts`

Run: `cd frontend && npm run typecheck && npm run lint && npm run build`

Expected: all commands exit 0.

- [ ] **Step 4: Validate production Compose**

Run: `cd deploy && docker compose --env-file .env.example --env-file recall.env.example -f docker-compose.yml -f docker-compose.recall.yml config --quiet`

Expected: exit 0 with no unresolved required variables.

- [ ] **Step 5: Inspect the final diff and repository state**

Run: `git diff HEAD~6 --check`

Run: `git status --short --branch`

Expected: no whitespace errors and no unintended files.

- [ ] **Step 6: Push the current feature branch**

Run: `git push -u origin codex/admin-iteration-20260804`

Expected: the remote branch updates without non-fast-forward errors. Production deployment remains a separate developer-controlled action because the server must provide real S3 mail-asset credentials, exact trusted-proxy values, and GeoIP files.
