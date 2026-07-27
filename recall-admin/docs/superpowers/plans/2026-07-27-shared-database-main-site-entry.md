# RightToken Shared-Database User Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make “用户运营管理” a permission-gated RightToken sidebar entry and run the recall application against the RightToken PostgreSQL database without a separate recall database or HTTP user-export dependency.

**Architecture:** The existing Vue main site keeps the permission check and short-lived SSO handoff. Recall Web, Worker and pg-boss connect to the existing RightToken PostgreSQL service; recall-owned tables live in the `recall` schema while a direct read-only adapter reads user facts from `public`. The initial cut keeps the existing `UserProfile` operational projection for compatibility, then replaces persisted source-fact reads with a live facts repository before the obsolete HTTP export path is removed.

**Tech Stack:** Vue 3, TypeScript, Vitest, Go/Gin, Next.js 16, Prisma 7, PostgreSQL 18, pg-boss, Docker Compose.

## Global Constraints

- Production authentication uses the existing RightToken SSO handoff; development bypass must remain impossible in production.
- Only authorized recall members see or enter “用户运营管理”.
- The main-site admin role does not automatically grant recall access.
- Only `PRIMARY_ADMIN` can export CSV, manage administrators and publish global rules.
- Recall database credentials may read required `public` tables but may only write inside `recall` and `pgboss`.
- No browser code receives a database URL, database password, SSO secret or internal API secret.
- Money is normalized to USD minor units using the existing fixed 7.0 CNY/USD convention.
- `usage_logs` are successful calls; `ops_error_logs` are not counted as successful calls.
- Use test-first development for every behavior change.

---

### Task 1: Place the permission-gated entry after “个人资料”

**Files:**
- Create: `frontend/src/components/layout/nav-items.ts`
- Create: `frontend/src/components/layout/__tests__/nav-items.spec.ts`
- Modify: `frontend/src/components/layout/AppSidebar.vue`

**Interfaces:**
- Consumes: `recallAccess.allowed: Readonly<Ref<boolean>>`
- Produces: `appendUserOperationsAfterProfile(items, allowed, operationItem): NavItem[]`

- [ ] **Step 1: Write the failing navigation-order test**

```ts
import { describe, expect, it } from 'vitest'
import { appendUserOperationsAfterProfile } from '../nav-items'

describe('appendUserOperationsAfterProfile', () => {
  const items = [
    { path: '/dashboard', label: '仪表盘' },
    { path: '/profile', label: '个人资料' }
  ]
  const operations = { path: '/user-operations', label: '用户运营管理' }

  it('adds the entry immediately after profile for an authorized member', () => {
    expect(appendUserOperationsAfterProfile(items, true, operations).map(item => item.path))
      .toEqual(['/dashboard', '/profile', '/user-operations'])
  })

  it('does not add the entry for an unauthorized member', () => {
    expect(appendUserOperationsAfterProfile(items, false, operations)).toEqual(items)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npm test -- src/components/layout/__tests__/nav-items.spec.ts`

Expected: FAIL because `../nav-items` does not exist.

- [ ] **Step 3: Add the pure navigation helper**

```ts
export type SidebarNavItem = {
  path: string
  label: string
  [key: string]: unknown
}

export function appendUserOperationsAfterProfile<T extends SidebarNavItem>(
  items: T[],
  allowed: boolean,
  operationItem: T
): T[] {
  if (!allowed) return items
  const profileIndex = items.findIndex(item => item.path === '/profile')
  if (profileIndex < 0) return [...items, operationItem]
  return [
    ...items.slice(0, profileIndex + 1),
    operationItem,
    ...items.slice(profileIndex + 1)
  ]
}
```

- [x] **Step 4: Use the helper in user and personal-admin navigation**

Remove the existing entry immediately after `/dashboard`. Build the normal arrays first, then call:

```ts
return appendUserOperationsAfterProfile(
  items,
  recallAccess.allowed.value,
  { path: '/user-operations', label: t('nav.userOperations'), icon: UsersIcon }
)
```

For administrators, place the entry in the personal-account section immediately
after `/profile`; do not duplicate it in the administrator system section.

- [ ] **Step 5: Run focused and frontend tests**

Run:

```bash
cd frontend
npm test -- src/components/layout/__tests__/nav-items.spec.ts src/components/layout/__tests__/AppSidebar.spec.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/AppSidebar.vue frontend/src/components/layout/nav-items.ts frontend/src/components/layout/__tests__/nav-items.spec.ts
git commit -m "feat: place user operations entry in account navigation"
```

### Task 2: Add the direct RightToken database adapter

**Files:**
- Create: `recall-admin/src/modules/integrations/righttoken/database-adapter.ts`
- Create: `recall-admin/tests/unit/integrations/righttoken-database-adapter.test.ts`
- Modify: `recall-admin/src/modules/integrations/righttoken/runtime-adapter.ts`
- Modify: `recall-admin/tests/unit/integrations/righttoken-runtime-adapter.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`
- Produces: `createRightTokenDatabaseAdapter(query): RightTokenAdapter`
- Produces: database cursor `{ updatedAt: string; userId: string }`, base64url encoded

- [ ] **Step 1: Write failing adapter contract tests**

Test that:

```ts
it('returns normalized live RightToken facts', async () => {
  const adapter = createRightTokenDatabaseAdapter(async () => ({
    rows: [{
      id: 42n,
      email: 'operator@example.com',
      display_name: 'Operator',
      registered_at: new Date('2026-07-01T00:00:00Z'),
      effective_updated_at: new Date('2026-07-02T00:00:00Z'),
      registration_ip: '203.0.113.9',
      checkout_started_at: null,
      first_paid_at: null,
      total_paid_minor: 0n,
      successful_call_count: 3n,
      last_call_at: new Date('2026-07-02T00:00:00Z'),
      balance_minor: 250n,
      anomaly_active: false
    }]
  }))
  const page = await adapter.listUsers({ limit: 10 })
  expect(page.users[0]).toMatchObject({
    externalUserId: '42',
    balanceMinor: 250,
    balanceCurrency: 'USD',
    successfulCallCount: 3
  })
})
```

Also test malformed cursors, integer overflow rejection, empty pages and `verifyConnection`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd recall-admin && npm test -- tests/unit/integrations/righttoken-database-adapter.test.ts`

Expected: FAIL because `database-adapter.ts` does not exist.

- [ ] **Step 3: Implement a static parameterized SQL adapter**

Use `pg.QueryResult` as the injected boundary:

```ts
export type RightTokenDatabaseQuery = (
  text: string,
  values: readonly unknown[]
) => Promise<{ rows: RightTokenUserFactRow[] }>

export function createRightTokenDatabaseAdapter(
  query: RightTokenDatabaseQuery
): RightTokenAdapter
```

The SQL must:

- read `public.users`;
- aggregate `public.payment_orders`;
- aggregate successful calls from `public.usage_logs`;
- aggregate active P0/P1 incidents from `public.ops_error_logs`;
- ignore soft-deleted users;
- use `(effective_updated_at, id)` keyset pagination;
- use `$1`, `$2`, `$3` parameters only;
- return at most `limit + 1` rows so `nextCursor` is deterministic.

Convert `bigint` to JavaScript numbers only after checking `Number.isSafeInteger`.

- [ ] **Step 4: Add the production query provider**

Expose a lazily created `pg.Pool` configured from `DATABASE_URL`, and pass:

```ts
(text, values) => pool.query(text, [...values])
```

Do not log the connection string.

- [ ] **Step 5: Make the runtime adapter prefer database mode**

Extend `resolveRuntimeRightTokenConfig`:

```ts
type RuntimeRightTokenEnv = {
  RIGHTTOKEN_SOURCE_MODE?: 'database' | 'http' | 'simulator'
  RIGHTTOKEN_API_BASE_URL?: string
  RIGHTTOKEN_API_TOKEN?: string
}
```

When `RIGHTTOKEN_SOURCE_MODE=database`, return `{ mode: 'database' }`. Keep HTTP and simulator available only for local testing and rollback.

- [ ] **Step 6: Run focused tests, typecheck and lint**

Run:

```bash
cd recall-admin
npm test -- tests/unit/integrations/righttoken-database-adapter.test.ts tests/unit/integrations/righttoken-runtime-adapter.test.ts
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add recall-admin/src/modules/integrations/righttoken recall-admin/tests/unit/integrations
git commit -m "feat: read RightToken users directly from the shared database"
```

### Task 3: Move recall-owned tables into the `recall` schema

**Files:**
- Modify: `recall-admin/prisma/schema.prisma`
- Create: `recall-admin/prisma/migrations/20260727090000_move_recall_tables_to_schema/migration.sql`
- Modify: `recall-admin/prisma.config.ts`
- Create: `recall-admin/tests/unit/database/schema-boundary.test.ts`

**Interfaces:**
- Consumes: existing recall tables in `public`
- Produces: all Prisma-managed tables and enums in `recall`

- [ ] **Step 1: Write the failing schema-boundary test**

Read `prisma/schema.prisma` and assert:

```ts
expect(schema).toContain('schemas = ["recall"]')
expect(schema.match(/@@schema\\("recall"\\)/g)?.length).toBeGreaterThan(20)
expect(schema).not.toContain('@@schema("public")')
```

Read the migration and assert it starts with `CREATE SCHEMA IF NOT EXISTS "recall"` and never contains `DROP TABLE "public".`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd recall-admin && npm test -- tests/unit/database/schema-boundary.test.ts`

Expected: FAIL because schema isolation is not configured.

- [ ] **Step 3: Configure Prisma multi-schema**

Add:

```prisma
datasource db {
  provider = "postgresql"
  schemas  = ["recall"]
}
```

Add `@@schema("recall")` to every model and enum.

- [ ] **Step 4: Write the safe table-move migration**

The migration must:

```sql
CREATE SCHEMA IF NOT EXISTS "recall";
ALTER TABLE IF EXISTS "Member" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "Session" SET SCHEMA "recall";
```

Repeat explicitly for every recall table, sequence and enum. Use `ALTER TYPE ... SET SCHEMA` for enums. Do not use wildcard dynamic SQL and do not alter a `public` RightToken business table.

- [ ] **Step 5: Generate Prisma client and run tests**

Run:

```bash
cd recall-admin
npx prisma generate
npm test -- tests/unit/database/schema-boundary.test.ts
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/prisma recall-admin/tests/unit/database/schema-boundary.test.ts
git commit -m "feat: isolate recall tables in the shared database"
```

### Task 4: Share the RightToken PostgreSQL service in deployment

**Files:**
- Modify: `deploy/docker-compose.recall.yml`
- Modify: `deploy/recall.env.example`
- Modify: `recall-admin/compose.yaml`
- Create: `recall-admin/scripts/grant-shared-database-access.sql`
- Modify: `recall-admin/tests/unit/deployment/production-compose.test.ts`
- Create: `recall-admin/tests/unit/deployment/shared-database-grants.test.ts`

**Interfaces:**
- Consumes: main Compose network `sub2api-network` and PostgreSQL host `postgres`
- Produces: `righttoken_recall_app` role with `SELECT` on required `public` tables and DML on `recall`

- [ ] **Step 1: Write failing Compose and grants tests**

Assert production Compose:

- has no `recall-db`;
- has no `recall_postgres_data`;
- connects Web, Worker and migrate to `sub2api-network`;
- configures `RIGHTTOKEN_SOURCE_MODE=database`;
- does not expose `RIGHTTOKEN_API_TOKEN`.

Assert grant SQL contains:

```sql
GRANT USAGE ON SCHEMA public TO righttoken_recall_app;
GRANT SELECT ON public.users, public.payment_orders, public.usage_logs, public.ops_error_logs TO righttoken_recall_app;
GRANT USAGE, CREATE ON SCHEMA recall TO righttoken_recall_app;
```

and contains no `GRANT ALL ON SCHEMA public`.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd recall-admin
npm test -- tests/unit/deployment/production-compose.test.ts tests/unit/deployment/shared-database-grants.test.ts
```

Expected: FAIL because production still defines `recall-db`.

- [ ] **Step 3: Remove the independent database service**

Set:

```yaml
DATABASE_URL: ${RECALL_DATABASE_URL:?RECALL_DATABASE_URL is required}
JOB_DATABASE_URL: ${RECALL_JOB_DATABASE_URL:?RECALL_JOB_DATABASE_URL is required}
RIGHTTOKEN_SOURCE_MODE: database
```

Remove `recall-db`, its volume and dependencies. Mark `sub2api-network` as external so the recall stack joins the existing main stack.

- [ ] **Step 4: Add least-privilege grants**

The SQL script must be run by a database owner and use a psql variable for the password:

```sql
\set ON_ERROR_STOP on
CREATE ROLE righttoken_recall_app LOGIN PASSWORD :'recall_password';
```

Use a guarded `DO` block so reruns alter the existing role rather than fail.

- [ ] **Step 5: Update local Compose**

Local development may retain a standalone database profile, but add a `shared-db` profile that connects to `host.docker.internal:5432/sub2api` and does not start `recall-db`.

- [ ] **Step 6: Run deployment tests and parse Compose**

Run:

```bash
cd recall-admin
npm test -- tests/unit/deployment/production-compose.test.ts tests/unit/deployment/shared-database-grants.test.ts
docker compose -f ../deploy/docker-compose.recall.yml --env-file ../deploy/recall.env.example config
```

Expected: tests PASS and Compose configuration parses without a `recall-db` service.

- [ ] **Step 7: Commit**

```bash
git add deploy recall-admin/compose.yaml recall-admin/scripts/grant-shared-database-access.sql recall-admin/tests/unit/deployment
git commit -m "deploy: run recall services on the RightToken database"
```

### Task 5: Replace persisted source facts with live shared-database facts

**Files:**
- Create: `recall-admin/src/modules/users/righttoken-facts.ts`
- Create: `recall-admin/src/modules/users/managed-user.ts`
- Modify: `recall-admin/src/modules/users/user-queries.ts`
- Modify: `recall-admin/src/modules/segmentation/evaluate-rule-set.ts`
- Modify: `recall-admin/src/modules/segmentation/preview-rule-set.ts`
- Modify: `recall-admin/src/modules/segmentation/resegment-user.ts`
- Modify: `recall-admin/src/modules/reports/dashboard-query.ts`
- Modify: `recall-admin/src/modules/users/export-users.ts`
- Create: `recall-admin/tests/unit/users/live-facts.test.ts`

**Interfaces:**
- Produces: `RightTokenUserFacts`
- Produces: `getRightTokenUserFactsByIds(ids: string[]): Promise<Map<string, RightTokenUserFacts>>`
- Produces: `ManagedUser = UserProfile operational fields & RightTokenUserFacts`

- [ ] **Step 1: Write failing live-facts merge tests**

Cover:

- missing operational state defaults to segment A;
- current facts override stale persisted email, balance, payment and call fields;
- operator scope is applied before facts are returned;
- CSV export uses live email and IP;
- rule evaluation uses live balance and call timestamps.

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `cd recall-admin && npm test -- tests/unit/users/live-facts.test.ts`

Expected: FAIL because the live facts repository does not exist.

- [ ] **Step 3: Add the typed live facts repository**

Define:

```ts
export type RightTokenUserFacts = {
  externalUserId: string
  email: string
  displayName: string | null
  registeredAt: Date
  registrationIp: string | null
  checkoutStartedAt: Date | null
  firstPaidAt: Date | null
  totalPaidMinor: number
  successfulCallCount: number
  lastCallAt: Date | null
  balanceUsdMinor: number
  anomalyActive: boolean
  updatedAt: Date
}
```

Reuse the static SQL and row parser from Task 2. Do not duplicate the SQL text.

- [ ] **Step 4: Introduce the merged domain type**

```ts
export type ManagedUser = RecallUserState & RightTokenUserFacts
```

Keep operational fields such as `id`, `currentSegment`, `ownerId`, `reasonLabel`, `pausedAt`, `unsubscribedAt`, location attribution and rule version in the recall table.

- [ ] **Step 5: Convert read paths**

Update list, detail, dashboard, rule preview, rule execution and CSV export to fetch permitted operational rows first, batch-load current facts by `externalUserId`, then merge them. Never perform one facts query per user.

- [ ] **Step 6: Run affected unit tests**

Run:

```bash
cd recall-admin
npm test -- tests/unit/users tests/unit/segmentation tests/unit/reports tests/unit/export
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add recall-admin/src/modules/users recall-admin/src/modules/segmentation recall-admin/src/modules/reports recall-admin/tests/unit
git commit -m "refactor: evaluate recall workflows from live RightToken facts"
```

### Task 6: Remove the obsolete HTTP export and user synchronization path

**Files:**
- Delete: `recall-admin/src/modules/integrations/righttoken/http-adapter.ts`
- Delete: `recall-admin/src/modules/integrations/righttoken/reconcile.ts`
- Delete: `recall-admin/src/worker/handlers/user-reconciliation.ts`
- Modify: `recall-admin/src/worker/index.ts`
- Modify: `recall-admin/src/worker/register-handlers.ts`
- Modify: `recall-admin/src/worker/job-names.ts`
- Modify: `recall-admin/src/lib/env/server.ts`
- Modify: `backend/internal/server/routes/admin.go`
- Delete: `backend/internal/server/middleware/recall_export_auth.go`
- Delete: `backend/internal/handler/admin/recall_user_handler.go`
- Modify: deployment documentation and environment examples

**Interfaces:**
- Consumes: live facts repository from Task 5
- Produces: no `/api/v1/admin/recall/users` route and no reconciliation schedule

- [ ] **Step 1: Write failing absence tests**

Assert:

- worker schedules contain no `USER_RECONCILIATION`;
- production env parser accepts no `RIGHTTOKEN_API_TOKEN`;
- main route source does not register `/admin/recall/users`;
- Compose contains no `RECALL_EXPORT_SECRET`.

- [ ] **Step 2: Run tests and verify they fail**

Run both frontend/recall unit tests and:

```bash
cd backend
go test -tags=unit ./internal/server/routes ./internal/config
```

Expected: FAIL because the obsolete path still exists.

- [ ] **Step 3: Remove HTTP synchronization**

Delete the adapter, reconciliation handler, schedules and env variables. Keep a five-minute `RECALL_STATE_RECALCULATION` job that queries user IDs whose live `effective_updated_at` exceeds the last processed watermark and recalculates only recall state.

- [ ] **Step 4: Remove the main-site export endpoint**

Remove its route, middleware, handler, config and tests. Do not alter main user tables or registration IP capture.

- [ ] **Step 5: Run all affected tests**

Run:

```bash
cd recall-admin
npm test
npm run typecheck
npm run lint

cd ../backend
go test -tags=unit ./internal/server/... ./internal/handler/... ./internal/config/...
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A recall-admin backend deploy
git commit -m "refactor: remove duplicated RightToken user synchronization"
```

### Task 7: Production hardening and end-to-end verification

**Files:**
- Modify: `recall-admin/docs/deployment.md`
- Modify: `recall-admin/docs/runbooks/deployment.md`
- Create: `recall-admin/scripts/verify-shared-database.sql`
- Modify: `recall-admin/tests/e2e/righttoken-sso.spec.ts`
- Modify: `frontend/src/components/layout/__tests__/AppSidebar.spec.ts`

**Interfaces:**
- Produces: repeatable deployment and verification runbook

- [ ] **Step 1: Add failing acceptance assertions**

Cover:

- unauthorized main user sees no entry;
- authorized member sees the entry after profile;
- main admin without recall membership sees no entry;
- click completes SSO and lands on recall dashboard;
- revoked member’s existing recall session is rejected;
- primary-admin-only CSV and member-management permissions remain enforced.

- [ ] **Step 2: Add database permission verification**

`verify-shared-database.sql` must:

- prove `current_user` can `SELECT` the four allowed main tables;
- prove `has_table_privilege(current_user, 'public.users', 'UPDATE')` is false;
- prove the `recall` and `pgboss` schemas exist;
- count orphaned `rightTokenUserId` references;
- compare active main users with recall operational-state coverage.

- [ ] **Step 3: Update the deployment runbook**

Document:

1. database backup;
2. create/grant recall role;
3. apply schema migration;
4. run dry-run identity and count checks;
5. deploy migrate/Web/Worker;
6. test SSO with primary admin, admin, operator and unauthorized user;
7. disable old export secret;
8. rollback application first and restore schema only from an isolated tested backup.

- [ ] **Step 4: Run complete verification**

Run:

```bash
cd frontend
npm test
npm run typecheck
npm run build

cd ../recall-admin
npm test
npm run typecheck
npm run lint
npm run build

cd ../backend
go test -tags=unit ./internal/server/... ./internal/handler/... ./internal/service/... ./internal/config/...
```

Expected: all tests, type checks, lints and builds exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend recall-admin backend deploy
git commit -m "test: verify shared-database user operations integration"
```
