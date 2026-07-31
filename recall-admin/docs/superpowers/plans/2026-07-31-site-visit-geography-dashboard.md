# 主站访问地域统计看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 采集主站每次成功页面浏览，在管理台按北京时间展示每日 UV/PV、全球国家或地区分布，以及中国大陆省份分布。

**Architecture:** Vue 在首次加载和成功路由切换后调用同源 Go 接口；Go 维护匿名 HttpOnly Cookie、读取可信 IP，并通过现有内部密钥把事件发给管理台。Next.js 管理台在内存中解析 IP、匿名化访客 ID、写入幂等访问事实，并只向管理员展示聚合看板。

**Tech Stack:** Vue 3、Vue Router、Axios、Go 1.26、Gin、Next.js 16、TypeScript 5.9、Prisma 7、PostgreSQL、MaxMind GeoLite2 City、Vitest、Go testing。

## Global Constraints

- 所有日统计使用 `Asia/Shanghai` 自然日。
- 全球按 ISO 国家或地区统计；`CN` 细化到省份，`HK`、`MO`、`TW` 独立展示。
- 不保存或返回原始 IP、Cookie 原值、query、fragment。
- 原始 IP 仅在管理台请求处理内存中参与 GeoIP 解析。
- 主站采集或管理台暂时失败不得阻断页面导航和主站业务。
- 看板仅允许 `PRIMARY_ADMIN`、`ADMIN` 访问。
- 访问事实保留 180 天。
- 不新增第三方运行时依赖。

---

## 文件结构

- `prisma/schema.prisma`：定义最小访问事实。
- `prisma/migrations/20260731223000_add_site_visits/migration.sql`：创建表、唯一约束与聚合索引。
- `src/modules/visits/visit-date.ts`：北京时间自然日转换。
- `src/modules/visits/geography.ts`：国家、省份规范化和中文名称。
- `src/modules/visits/ingest.ts`：严格校验、HMAC、GeoIP、幂等写入、保留期清理。
- `src/modules/visits/queries.ts`：总量、趋势、国家和中国省份聚合。
- `src/modules/visits/internal-handler.ts`：内部 Bearer 接口边界。
- `src/app/api/internal/righttoken/visits/route.ts`：管理台接收入口。
- `src/app/(dashboard)/visits/page.tsx`：管理员访问看板。
- `src/app/(dashboard)/visits/visit-dashboard.module.css`：看板布局和原生条形趋势。
- `src/components/layout/app-sidebar.tsx`：管理员导航入口。
- `../backend/internal/service/recall_visit.go`：主站到管理台的访问事件客户端。
- `../backend/internal/handler/analytics_handler.go`：Cookie、pathname 和可信 IP 接收边界。
- `../backend/internal/server/routes/analytics.go`：公开同源采集路由。
- `../frontend/src/api/analytics.ts`：轻量访问上报。
- `../frontend/src/router/index.ts`：成功导航后触发上报。

---

### Task 1: 访问事实、日期和地域基础

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260731223000_add_site_visits/migration.sql`
- Create: `src/modules/visits/visit-date.ts`
- Create: `src/modules/visits/geography.ts`
- Create: `tests/unit/site-visit-foundations.test.ts`

**Interfaces:**
- Produces: `toShanghaiVisitDate(occurredAt: Date): Date`
- Produces: `normalizeVisitGeography(location: GeoIpLocation | null): { countryCode: string; region: string | null }`
- Produces: `presentCountry(countryCode: string): string`
- Produces: Prisma model `SiteVisit`

- [ ] **Step 1: Write failing foundation tests**

```ts
expect(toShanghaiVisitDate(new Date("2026-07-31T16:30:00Z")).toISOString())
  .toBe("2026-08-01T00:00:00.000Z");
expect(normalizeVisitGeography({ countryCode: "CN", region: "广东省" }))
  .toEqual({ countryCode: "CN", region: "广东" });
expect(normalizeVisitGeography({ countryCode: "HK", region: "Hong Kong" }))
  .toEqual({ countryCode: "HK", region: null });
expect(presentCountry("TW")).toBe("中国台湾");
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/unit/site-visit-foundations.test.ts`

Expected: FAIL because `visit-date` and `geography` do not exist.

- [ ] **Step 3: Add the model and migration**

```prisma
model SiteVisit {
  id          String   @id @default(cuid())
  eventId     String   @unique
  occurredAt  DateTime
  visitDate   DateTime @db.Date
  visitorHash String
  countryCode String   @default("ZZ")
  region      String?
  path        String
  createdAt   DateTime @default(now())

  @@index([visitDate, visitorHash])
  @@index([visitDate, countryCode])
  @@index([visitDate, countryCode, region])
  @@schema("recall")
}
```

The SQL migration must create the same columns in `recall."SiteVisit"`, a unique index on `eventId`, and the three declared aggregation indexes.

- [ ] **Step 4: Implement deterministic date and geography helpers**

`toShanghaiVisitDate` adds the Shanghai UTC offset when selecting date parts, then returns a UTC-midnight `Date` representing that local calendar date. `normalizeVisitGeography` uppercases valid two-letter codes, maps missing/invalid codes to `ZZ`, retains a normalized region only for `CN`, and removes Chinese province-level suffixes from longest to shortest. `presentCountry` uses `Intl.DisplayNames("zh-CN")` with explicit overrides for `CN/HK/MO/TW/ZZ`.

- [ ] **Step 5: Generate Prisma client and run GREEN**

Run: `npx prisma generate`

Run: `npm test -- tests/unit/site-visit-foundations.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260731223000_add_site_visits/migration.sql src/modules/visits tests/unit/site-visit-foundations.test.ts src/generated/prisma
git commit -m "feat: add site visit geography facts"
```

---

### Task 2: 管理台内部访问接收

**Files:**
- Create: `src/modules/visits/ingest.ts`
- Create: `src/modules/visits/internal-handler.ts`
- Create: `src/app/api/internal/righttoken/visits/route.ts`
- Modify: `src/lib/env/server.ts`
- Modify: `.env.example`
- Create: `tests/unit/site-visit-ingest.test.ts`
- Create: `tests/unit/site-visit-internal-handler.test.ts`

**Interfaces:**
- Consumes: `toShanghaiVisitDate`, `normalizeVisitGeography`, `createGeoIpResolver`
- Produces: `ingestSiteVisit(input, dependencies): Promise<"created" | "duplicate">`
- Produces: `createSiteVisitHandler(dependencies): (request: Request) => Promise<Response>`
- Consumes environment: `VISITOR_HASH_KEY` with minimum 32 characters

- [ ] **Step 1: Write failing ingestion and handler tests**

Tests must prove:

```ts
expect(saved.ip).toBeUndefined();
expect(saved.visitorHash).toMatch(/^[a-f0-9]{64}$/);
expect(saved.path).toBe("/pricing");
expect(saved.countryCode).toBe("CN");
expect(saved.region).toBe("广东");
expect(await ingestSameEventTwice()).toEqual(["created", "duplicate"]);
expect(await unauthenticatedRequest().then((r) => r.status)).toBe(401);
```

Also cover invalid event IDs, invalid IPs, paths containing query/fragment, events more than 7 days old, and events more than 5 minutes in the future.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- tests/unit/site-visit-ingest.test.ts tests/unit/site-visit-internal-handler.test.ts`

Expected: FAIL because ingestion and route handler do not exist.

- [ ] **Step 3: Implement strict request validation and privacy boundary**

Use a Zod schema equivalent to:

```ts
z.object({
  eventId: z.string().uuid(),
  occurredAt: z.coerce.date(),
  visitorId: z.string().min(32).max(128),
  ip: z.string().ip(),
  path: z.string().startsWith("/").max(500)
}).strict();
```

Strip query and fragment defensively, resolve GeoIP before persistence, compute `createHmac("sha256", VISITOR_HASH_KEY).update(visitorId).digest("hex")`, and never include the raw IP or visitor ID in errors.

- [ ] **Step 4: Implement idempotent persistence and retention**

Create by unique `eventId`; translate Prisma `P2002` to `"duplicate"`. After a successful insert, delete visits with `occurredAt < now - 180 days` at most once per process hour using a module-local timestamp. Cleanup failure must not fail the accepted visit.

- [ ] **Step 5: Add route authentication**

The route uses `INTERNAL_API_SECRET_CURRENT` and `INTERNAL_API_SECRET_PREVIOUS` with `isValidInternalBearer`, returns `202` for created events and `200` for duplicates, and returns generic `400/401/500` responses without reflecting sensitive input.

- [ ] **Step 6: Run GREEN and typecheck**

Run: `npm test -- tests/unit/site-visit-ingest.test.ts tests/unit/site-visit-internal-handler.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .env.example src/lib/env/server.ts src/modules/visits src/app/api/internal/righttoken/visits tests/unit
git commit -m "feat: ingest private site visits"
```

---

### Task 3: 主站 Go 同源采集接口

**Files:**
- Create: `../backend/internal/service/recall_visit.go`
- Create: `../backend/internal/service/recall_visit_test.go`
- Create: `../backend/internal/handler/analytics_handler.go`
- Create: `../backend/internal/handler/analytics_handler_test.go`
- Create: `../backend/internal/server/routes/analytics.go`
- Modify: `../backend/internal/handler/handler.go`
- Modify: `../backend/internal/handler/wire.go`
- Modify: `../backend/internal/service/wire.go`
- Modify: `../backend/internal/server/router.go`
- Modify: `../backend/cmd/server/wire_gen.go`

**Interfaces:**
- Produces: `RecallVisitService.Track(ctx context.Context, event RecallVisitEvent) error`
- Produces: `AnalyticsHandler.Visit(c *gin.Context)`
- Consumes existing `config.RecallSSO.BaseURL` and `config.RecallSSO.InternalSecret`

- [ ] **Step 1: Write failing Go tests**

Handler tests must assert:

```go
require.Equal(t, http.StatusNoContent, recorder.Code)
require.NotEmpty(t, recorder.Header().Get("Set-Cookie"))
require.Equal(t, "203.0.113.8", tracker.event.IP)
require.Equal(t, "/pricing", tracker.event.Path)
```

A second request with the returned cookie must reuse the same visitor ID. Invalid/non-path payloads return `204` without forwarding. Tracker failure still returns `204`.

Service tests must assert the target URL `/api/internal/righttoken/visits`, Bearer header, JSON fields, UUID event ID, and a short HTTP timeout.

- [ ] **Step 2: Run focused Go tests and confirm RED**

Run: `go test ./internal/handler ./internal/service -run 'RecallVisit|AnalyticsVisit'`

Expected: FAIL because the types do not exist.

- [ ] **Step 3: Implement the recall client**

`Track` posts:

```json
{
  "eventId": "uuid",
  "occurredAt": "RFC3339Nano",
  "visitorId": "cookie random value",
  "ip": "trusted client IP",
  "path": "/pathname"
}
```

Treat any `2xx` as success, cap response reads, use a 2-second client timeout, and return an unavailable error without logging payload fields.

- [ ] **Step 4: Implement Cookie and handler boundary**

Use a 32-byte `crypto/rand` value encoded with base64url. Cookie name: `rt_vid`; `HttpOnly`, `SameSite=Lax`, `Path=/`, `MaxAge=31536000`, and `Secure` when the request is HTTPS or production headers indicate HTTPS. Read IP using `ip.GetTrustedClientIP(c)`. Accept JSON `{ "path": "/..." }`, remove query/fragment, cap at 500 characters, and call the tracker with a request timeout. Always respond `204`.

- [ ] **Step 5: Wire the public route**

Register `POST /api/v1/analytics/visit` before authenticated route groups. Add the handler and service to the existing Wire provider graph and regenerate or update `wire_gen.go` consistently.

- [ ] **Step 6: Run GREEN**

Run: `gofmt -w internal/service/recall_visit.go internal/service/recall_visit_test.go internal/handler/analytics_handler.go internal/handler/analytics_handler_test.go internal/server/routes/analytics.go internal/handler/handler.go internal/handler/wire.go internal/service/wire.go internal/server/router.go cmd/server/wire_gen.go`

Run: `go test ./internal/handler ./internal/service ./internal/server/routes`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ../backend/internal ../backend/cmd/server/wire_gen.go
git commit -m "feat: forward main site visits privately"
```

---

### Task 4: Vue 路由访问上报

**Files:**
- Create: `../frontend/src/api/analytics.ts`
- Create: `../frontend/src/api/__tests__/analytics.spec.ts`
- Modify: `../frontend/src/router/index.ts`
- Modify: `../frontend/src/__tests__/integration/navigation.spec.ts`

**Interfaces:**
- Produces: `trackPageVisit(path: string): void`
- Consumes: `POST /api/v1/analytics/visit`

- [ ] **Step 1: Write failing frontend tests**

Tests must verify:

```ts
trackPageVisit("/pricing?coupon=secret#checkout")
expect(post).toHaveBeenCalledWith("/analytics/visit", { path: "/pricing" })
```

Navigation integration must prove the initial successful navigation and one later successful navigation each call `trackPageVisit` once, while aborted/failed navigation does not.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:run -- src/api/__tests__/analytics.spec.ts src/__tests__/integration/navigation.spec.ts`

Expected: FAIL because `trackPageVisit` does not exist.

- [ ] **Step 3: Implement fire-and-forget tracking**

```ts
export function trackPageVisit(rawPath: string): void {
  const path = rawPath.split(/[?#]/, 1)[0] || "/"
  void apiClient.post("/analytics/visit", { path }).catch(() => undefined)
}
```

Call it from the existing global `router.afterEach((to, failure) => ...)` only when `failure` is absent, using `to.path`; do not create a second competing route hook.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npm run test:run -- src/api/__tests__/analytics.spec.ts src/__tests__/integration/navigation.spec.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ../frontend/src/api/analytics.ts ../frontend/src/api/__tests__/analytics.spec.ts ../frontend/src/router/index.ts ../frontend/src/__tests__/integration/navigation.spec.ts
git commit -m "feat: track main site page visits"
```

---

### Task 5: 访问聚合查询

**Files:**
- Create: `src/modules/visits/queries.ts`
- Create: `tests/unit/site-visit-queries.test.ts`

**Interfaces:**
- Produces: `getVisitDashboard(rangeDays: 7 | 30 | 90, now?: Date): Promise<VisitDashboard>`
- Produces: `VisitDashboard` containing `today`, `period`, `daily`, `countries`, `chinaRegions`

- [ ] **Step 1: Write failing aggregation tests**

Use a query adapter or mocked Prisma `$queryRaw` results to verify:

```ts
expect(result.today).toEqual({ uv: 2, pv: 3 });
expect(result.period).toEqual({ uv: 3, pv: 7 });
expect(result.daily.map((row) => row.date)).toEqual(expectedAscendingDates);
expect(result.countries[0]).toMatchObject({ countryCode: "CN", uv: 2, pv: 4 });
expect(result.chinaRegions[0]).toMatchObject({ region: "广东", uv: 2, pv: 3 });
```

Include a visitor who appears in two countries to ensure period total UV is distinct globally while each country counts a local distinct UV.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- tests/unit/site-visit-queries.test.ts`

Expected: FAIL because `queries.ts` does not exist.

- [ ] **Step 3: Implement bounded aggregation**

Use parameterized Prisma SQL over `[startDate, endExclusive)`:

```sql
COUNT(*)::int AS pv,
COUNT(DISTINCT "visitorHash")::int AS uv
```

Return every date in the selected range, filling missing days with zero. Sort daily ascending and country/province rows by `pv DESC, uv DESC, name ASC`. Limit each geography list to 100 rows.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/unit/site-visit-queries.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/visits/queries.ts tests/unit/site-visit-queries.test.ts
git commit -m "feat: aggregate visit geography metrics"
```

---

### Task 6: 管理员访问看板

**Files:**
- Create: `src/app/(dashboard)/visits/page.tsx`
- Create: `src/app/(dashboard)/visits/visit-dashboard.module.css`
- Modify: `src/components/layout/app-sidebar.tsx`
- Create: `tests/unit/visit-dashboard-page.test.tsx`
- Modify: `tests/unit/app-sidebar-navigation.test.tsx`

**Interfaces:**
- Consumes: `requireAdministrator("/visits")`
- Consumes: `getVisitDashboard(rangeDays)`

- [ ] **Step 1: Write failing page and navigation tests**

Assert the page renders `访问看板`, `今日访客`, `今日访问`, `全球国家或地区`, `中国大陆省份`, and links for 7/30/90 days. Assert `访问看板` appears in admin sidebar and is absent for operator.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- tests/unit/visit-dashboard-page.test.tsx tests/unit/app-sidebar-navigation.test.tsx`

Expected: FAIL because `/visits` does not exist.

- [ ] **Step 3: Implement the server-rendered dashboard**

Parse `searchParams.days`, allow only `7 | 30 | 90`, default to `30`, and call `requireAdministrator` before querying. Render four statistic cards, a CSS two-series daily bar trend with accessible numeric labels, and two ranked tables with UV/PV/占比. Add empty-state and GeoIP unknown copy.

- [ ] **Step 4: Add administrator-only navigation**

Add:

```ts
{
  label: "访问看板",
  href: "/visits",
  icon: Globe2,
  administratorOnly: true
}
```

- [ ] **Step 5: Run GREEN and typecheck**

Run: `npm test -- tests/unit/visit-dashboard-page.test.tsx tests/unit/app-sidebar-navigation.test.tsx`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(dashboard)'/visits src/components/layout/app-sidebar.tsx tests/unit
git commit -m "feat: add visit geography dashboard"
```

---

### Task 7: 全量验证和浏览器验收

**Files:**
- Modify: `docs/runbooks/deployment.md`
- Modify: `.env.example`

**Interfaces:**
- Validates the end-to-end contracts from Tasks 1–6.

- [ ] **Step 1: Document production requirements**

Document `VISITOR_HASH_KEY`, `GEOIP_MMDB_PATH`, trusted proxy configuration, the 180-day retention rule, and the main-site dependency on existing `RECALL_SSO_BASE_URL` / `RECALL_SSO_INTERNAL_SECRET`.

- [ ] **Step 2: Run complete management-console verification**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm test`

Run: `npm run build`

Expected: all exit 0.

- [ ] **Step 3: Run complete main-site verification**

Run in `../backend`: `go test ./...`

Run in `../frontend`: `npm run lint:check`

Run in `../frontend`: `npm run typecheck`

Run in `../frontend`: `npm run test:run`

Run in `../frontend`: `npm run build`

Expected: all exit 0.

- [ ] **Step 4: Apply the local migration and seed representative visits**

Run: `npm run db:migrate`

Insert only documentation-range test IP-derived aggregate fixtures or call the internal route with a test resolver; never insert a real IP into the database.

- [ ] **Step 5: Browser acceptance**

Start the main site and management console, browse at least two main-site routes, then open `/visits`. Confirm:

- the first route creates the visitor Cookie;
- the next route reuses it;
- today PV increases by two while today UV increases by one;
- the date selector changes the trend range;
- country and China province tables render;
- an operator cannot see or open the page;
- database rows contain no raw IP or visitor Cookie.

- [ ] **Step 6: Final diff and commit**

Run: `git diff --check`

Run: `git status --short`

Commit any verification-only documentation:

```bash
git add docs/runbooks/deployment.md .env.example
git commit -m "docs: deploy visit geography tracking"
```
