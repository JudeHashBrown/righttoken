# Strict F Segment Anomaly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broad unresolved-error F-group flag with a 30-minute request-state machine, three-success recovery, and a 24-hour maximum lifetime.

**Architecture:** RightToken reconstructs a per-user request timeline from final successes in `usage_logs` and eligible final failures in `ops_error_logs`. Both the Go export endpoint and the TypeScript shared-database adapter expose `anomalyActive` plus `anomalyChangedAt`; the recall application then uses the timestamp to schedule a deterministic 24-hour F-group exit.

**Tech Stack:** Go 1.26, PostgreSQL 16 window queries, TypeScript 5.9, Next.js 16, Prisma 7, Vitest 4.

## Global Constraints

- Count only final client failures; rows whose final `status_code` is below 400 never count.
- Exclude balance, authentication, invalid request, subscription, inactive-user, and user-side throttling failures.
- Trigger on three consecutive eligible failures, or at least three effective requests with a 30-minute failure rate of at least 50%.
- Clear after three consecutive successes.
- Ignore one or two isolated failures.
- Expire 24 hours after the last trigger; a later trigger refreshes the 24-hour lifetime.
- Keep the Go endpoint and TypeScript database adapter semantically identical.
- Do not move the export cursor into the future to represent expiry.

---

### Task 1: RightToken export anomaly state machine

**Files:**
- Modify: `backend/internal/handler/admin/recall_user_handler.go`
- Modify: `backend/internal/handler/admin/recall_user_handler_test.go`
- Modify: `backend/internal/handler/admin/recall_user_contract_test.go`

**Interfaces:**
- Consumes: final successes from `usage_logs` and final failures from `ops_error_logs`.
- Produces: `recallUserSnapshot.AnomalyActive bool` and `recallUserSnapshot.AnomalyChangedAt *time.Time`, serialized as `anomalyActive` and `anomalyChangedAt`.

- [ ] **Step 1: Replace the old query-contract assertion with failing strict-rule assertions**

```go
func TestRecallUserQueryUsesStrictAnomalyStateMachine(t *testing.T) {
	require.Contains(t, listRecallUsersQuery, "final_request_events AS")
	require.Contains(t, listRecallUsersQuery, "error_log.status_code >= 400")
	require.Contains(t, listRecallUsersQuery, "INTERVAL '30 minutes'")
	require.Contains(t, listRecallUsersQuery, "consecutive_failures >= 3")
	require.Contains(t, listRecallUsersQuery, "failure_count * 2 >= request_count")
	require.Contains(t, listRecallUsersQuery, "consecutive_successes >= 3")
	require.Contains(t, listRecallUsersQuery, "INTERVAL '24 hours'")
	require.Contains(t, listRecallUsersQuery, "anomaly_changed_at")
	require.NotContains(t, listRecallUsersQuery, "COALESCE(error_log.resolved, false) = false")
}
```

- [ ] **Step 2: Run the focused Go unit test and verify RED**

Run:

```bash
go test -tags=unit ./internal/handler/admin -run TestRecallUserQueryUsesStrictAnomalyStateMachine -count=1
```

Expected: FAIL because the current query still uses the unresolved P0/P1 boolean aggregate.

- [ ] **Step 3: Add the timestamp contract and SQL event-state machine**

Add the snapshot field:

```go
AnomalyChangedAt *time.Time `json:"anomalyChangedAt"`
```

Replace `anomaly_stats` with CTEs that:

```sql
final_request_events AS (
    SELECT ul.user_id, ul.created_at, ul.id, 0 AS source_order, false AS failed
    FROM usage_logs ul
    JOIN changed_user_ids changed ON changed.user_id = ul.user_id
    WHERE ul.created_at >= NOW() - INTERVAL '24 hours 30 minutes'
    UNION ALL
    SELECT error_log.user_id, error_log.created_at, error_log.id,
           1 AS source_order, true AS failed
    FROM ops_error_logs error_log
    JOIN changed_user_ids changed ON changed.user_id = error_log.user_id
    WHERE error_log.user_id IS NOT NULL
      AND error_log.created_at >= NOW() - INTERVAL '24 hours 30 minutes'
      AND error_log.status_code >= 400
      AND COALESCE(error_log.is_business_limited, false) = false
      AND COALESCE(error_log.error_owner, 'platform') <> 'client'
      AND COALESCE(error_log.error_phase, 'internal') NOT IN ('request', 'auth')
      AND COALESCE(error_log.error_type, '') NOT IN (
          'invalid_request_error', 'authentication_error', 'billing_error',
          'subscription_error'
      )
)
```

Use `LAG`, a run identifier, rolling 30-minute counts, and state markers. A failure marker is emitted when `consecutive_failures >= 3` or when `request_count >= 3 AND failure_count * 2 >= request_count`. A recovery marker is emitted when `consecutive_successes >= 3`. Select the latest marker within 24 hours per user.

- [ ] **Step 4: Extend the migrated-Postgres fixture with behavior cases**

Create table-driven fixture helpers that insert ordered success or failure events and assert:

```go
cases := []struct {
	name              string
	events            []contractRequestEvent
	wantActive        bool
	wantChangedOffset time.Duration
}{
	{"three consecutive failures", failures(3), true, 2 * time.Minute},
	{"two isolated failures", failures(2), false, 0},
	{"two failures out of three", failureSuccessFailure(), true, 2 * time.Minute},
	{"three successes recover", append(failures(3), successes(3)...), false, 5 * time.Minute},
	{"recovered upstream row excluded", recoveredUpstreamFailure(), false, 0},
	{"business and client errors excluded", excludedFailures(), false, 0},
	{"trigger older than 24 hours expires", oldFailures(3), false, 0},
}
```

Each failure fixture must set the real final `status_code`, `error_owner`, `error_phase`, and `error_type`.

- [ ] **Step 5: Run Go unit tests and the contract test when the database URL is available**

Run:

```bash
gofmt -w internal/handler/admin/recall_user_handler.go internal/handler/admin/recall_user_handler_test.go internal/handler/admin/recall_user_contract_test.go
go test -tags=unit ./internal/handler/admin -run 'TestRecallUser|TestMinorUnits' -count=1
```

Expected: PASS.

Run when `RECALL_CONTRACT_DATABASE_URL` is configured:

```bash
go test -tags=recallcontract ./internal/handler/admin -run TestRecallUserExportAgainstMigratedPostgres -count=1
```

Expected: PASS with all state-machine cases.

- [ ] **Step 6: Commit the RightToken export change**

```bash
git add backend/internal/handler/admin/recall_user_handler.go \
  backend/internal/handler/admin/recall_user_handler_test.go \
  backend/internal/handler/admin/recall_user_contract_test.go
git commit -m "feat: tighten recall service anomaly export"
```

---

### Task 2: TypeScript database adapter parity and snapshot contract

**Files:**
- Modify: `recall-admin/src/modules/integrations/righttoken/adapter.ts`
- Modify: `recall-admin/src/modules/integrations/righttoken/database-adapter.ts`
- Modify: `recall-admin/src/modules/integrations/righttoken/simulator.ts`
- Modify: `recall-admin/tests/unit/integrations/righttoken-database-adapter.test.ts`
- Modify: `recall-admin/tests/unit/integrations/righttoken-adapter.test.ts`

**Interfaces:**
- Consumes: the SQL semantics from Task 1.
- Produces: `RightTokenUserSnapshot.anomalyChangedAt: Date | null`.

- [ ] **Step 1: Add failing adapter-contract expectations**

Extend `firstRow`:

```ts
anomaly_active: true,
anomaly_changed_at: new Date("2026-07-02T00:15:00.000Z")
```

Assert:

```ts
expect(page.users[0]).toMatchObject({
  anomalyActive: true,
  anomalyChangedAt: new Date("2026-07-02T00:15:00.000Z")
});
expect(query.mock.calls[0]?.[0]).toContain("final_request_events AS");
expect(query.mock.calls[0]?.[0]).toContain("consecutive_successes >= 3");
expect(query.mock.calls[0]?.[0]).not.toContain(
  "COALESCE(error_log.resolved, false) = false"
);
```

- [ ] **Step 2: Run the focused Vitest file and verify RED**

Run:

```bash
npx vitest run tests/unit/integrations/righttoken-database-adapter.test.ts
```

Expected: FAIL because the row type and snapshot do not contain `anomaly_changed_at`.

- [ ] **Step 3: Extend the snapshot schema**

```ts
export type RightTokenUserSnapshot = {
  // existing fields
  anomalyActive: boolean;
  anomalyChangedAt: Date | null;
};

anomalyChangedAt: z.coerce.date().nullable()
```

- [ ] **Step 4: Port the SQL state machine and row conversion**

Add `anomaly_changed_at` to `RightTokenUserFactRow`, select it from the latest state marker, and map it with:

```ts
anomalyActive: row.anomaly_active,
anomalyChangedAt: nullableDateValue(row.anomaly_changed_at)
```

The SQL filters and trigger/recovery expressions must match Task 1 exactly.

- [ ] **Step 5: Update simulator snapshots**

Use a deterministic timestamp for simulated F users and `null` for other users:

```ts
anomalyActive: scenario === "F",
anomalyChangedAt:
  scenario === "F" ? new Date(baseNow.getTime() - hour) : null
```

- [ ] **Step 6: Run adapter tests and type checking**

Run:

```bash
npx vitest run \
  tests/unit/integrations/righttoken-database-adapter.test.ts \
  tests/unit/integrations/righttoken-adapter.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the adapter parity change**

```bash
git add recall-admin/src/modules/integrations/righttoken/adapter.ts \
  recall-admin/src/modules/integrations/righttoken/database-adapter.ts \
  recall-admin/src/modules/integrations/righttoken/simulator.ts \
  recall-admin/tests/unit/integrations/righttoken-database-adapter.test.ts \
  recall-admin/tests/unit/integrations/righttoken-adapter.test.ts
git commit -m "feat: sync strict anomaly timestamps"
```

---

### Task 3: Preserve anomaly timestamps during reconciliation

**Files:**
- Modify: `recall-admin/src/modules/integrations/righttoken/reconcile.ts`
- Modify: `recall-admin/src/modules/users/righttoken-facts.ts`
- Modify: `recall-admin/tests/integration/integrations/reconciliation.test.ts`
- Modify: `recall-admin/tests/unit/users/live-facts.test.ts`

**Interfaces:**
- Consumes: `RightTokenUserSnapshot.anomalyChangedAt`.
- Produces: stable `UserProfile.anomalyChangedAt` that changes only when the upstream anomaly state changes.

- [ ] **Step 1: Write failing reconciliation tests**

Add assertions for an active snapshot:

```ts
expect(saved.anomalyActive).toBe(true);
expect(saved.anomalyChangedAt).toEqual(
  new Date("2026-07-28T15:53:00.000Z")
);
```

Then reconcile a later profile-only update with the same anomaly timestamp:

```ts
expect(updated.anomalyChangedAt).toEqual(
  new Date("2026-07-28T15:53:00.000Z")
);
```

- [ ] **Step 2: Run reconciliation and live-facts tests and verify RED**

Run:

```bash
npx vitest run \
  tests/integration/integrations/reconciliation.test.ts \
  tests/unit/users/live-facts.test.ts
```

Expected: FAIL because reconciliation currently writes the generic snapshot update time.

- [ ] **Step 3: Preserve the upstream anomaly time**

Change source facts to:

```ts
anomalyActive: snapshot.anomalyActive,
anomalyChangedAt: snapshot.anomalyChangedAt
```

Extend `RightTokenUserFacts` and its mapping with:

```ts
anomalyChangedAt: snapshot.anomalyChangedAt
```

- [ ] **Step 4: Run the same tests and the integration suite**

Run:

```bash
npx vitest run \
  tests/integration/integrations/reconciliation.test.ts \
  tests/unit/users/live-facts.test.ts
npm run test:integration
```

Expected: PASS.

- [ ] **Step 5: Commit timestamp preservation**

```bash
git add recall-admin/src/modules/integrations/righttoken/reconcile.ts \
  recall-admin/src/modules/users/righttoken-facts.ts \
  recall-admin/tests/integration/integrations/reconciliation.test.ts \
  recall-admin/tests/unit/users/live-facts.test.ts
git commit -m "fix: preserve service anomaly trigger time"
```

---

### Task 4: Enforce the 24-hour F-group lifetime

**Files:**
- Modify: `recall-admin/src/modules/segmentation/field-registry.ts`
- Modify: `recall-admin/src/modules/segmentation/segment-facts.ts`
- Modify: `recall-admin/src/modules/segmentation/default-rule-set.ts`
- Modify: `recall-admin/src/modules/segmentation/next-rule-boundary.ts`
- Modify: `recall-admin/src/modules/segmentation/classify-user.ts`
- Modify: `recall-admin/tests/unit/segmentation/classify-user.test.ts`
- Modify: `recall-admin/tests/unit/segmentation/evaluate-rule-set.test.ts`
- Modify: `recall-admin/tests/unit/segmentation/next-rule-boundary.test.ts`
- Modify: `recall-admin/tests/unit/segmentation/field-registry.test.ts`

**Interfaces:**
- Consumes: `UserProfile.anomalyActive` and `UserProfile.anomalyChangedAt`.
- Produces: `anomalyElapsed` in minutes and a rule boundary at `anomalyChangedAt + 24 hours`.

- [ ] **Step 1: Write failing segmentation tests**

Assert an active recent anomaly enters F:

```ts
expect(classifyUser({
  ...healthy,
  anomalyActive: true,
  anomalyChangedAt: new Date(now.getTime() - 23 * 60 * 60 * 1000)
}, now, defaultSegmentRuleSet).segment).toBe("F");
```

Assert the same anomaly exits at 24 hours:

```ts
expect(classifyUser({
  ...healthy,
  anomalyActive: true,
  anomalyChangedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000)
}, now, defaultSegmentRuleSet).segment).toBe("G");
```

Assert the next rule boundary:

```ts
expect(getNextRuleBoundary(
  activeAnomaly,
  defaultSegmentRuleSet,
  4,
  now,
  { includeTask: false }
))
  .toMatchObject({
    runAt: new Date(activeAnomaly.anomalyChangedAt!.getTime() + 86_400_000),
    purpose: "RULE",
    boundaryKey: expect.stringContaining("anomalyElapsed")
  });
```

- [ ] **Step 2: Run segmentation tests and verify RED**

Run:

```bash
npx vitest run \
  tests/unit/segmentation/classify-user.test.ts \
  tests/unit/segmentation/evaluate-rule-set.test.ts \
  tests/unit/segmentation/next-rule-boundary.test.ts \
  tests/unit/segmentation/field-registry.test.ts
```

Expected: FAIL because `anomalyElapsed` is not registered or evaluated.

- [ ] **Step 3: Add the elapsed fact**

Add `"anomalyElapsed"` as a duration field and compute it:

```ts
anomalyElapsed: elapsedMinutes(source.anomalyChangedAt, now)
```

Map it to `anomalyChangedAt` in `relativeSource`.

- [ ] **Step 4: Tighten the default F rule**

```ts
branches: [
  branch(
    clause("anomalyActive", "eq", true),
    clause("anomalyChangedAt", "is_not_null"),
    clause("anomalyElapsed", "lt", 24, "hours")
  )
]
```

Update the legacy classifier so an active flag without a valid recent timestamp does not force F.

- [ ] **Step 5: Run focused and full unit tests**

Run:

```bash
npx vitest run \
  tests/unit/segmentation/classify-user.test.ts \
  tests/unit/segmentation/evaluate-rule-set.test.ts \
  tests/unit/segmentation/next-rule-boundary.test.ts \
  tests/unit/segmentation/field-registry.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit the lifetime rule**

```bash
git add recall-admin/src/modules/segmentation \
  recall-admin/tests/unit/segmentation
git commit -m "feat: expire F segment anomalies after 24 hours"
```

---

### Task 5: End-to-end verification and recalculation readiness

**Files:**
- Modify: `backend/scripts/verify-recall-users.sql`

**Interfaces:**
- Consumes: completed Tasks 1 through 4.
- Produces: a verified release candidate ready for full synchronization and recalculation.

- [ ] **Step 1: Verify the Go backend**

Extend `verify-recall-users.sql` with aggregate checks that report:

```sql
SELECT
  COUNT(*) FILTER (WHERE anomaly_active) AS active_anomalies,
  COUNT(*) FILTER (
    WHERE anomaly_active AND anomaly_changed_at < NOW() - INTERVAL '24 hours'
  ) AS expired_but_active
FROM recall_user_preview;
```

The verification query must return `expired_but_active = 0`.

Run:

```bash
gofmt -w internal/handler/admin
go test -tags=unit ./internal/handler/admin ./internal/handler ./internal/repository -count=1
```

Expected: PASS.

- [ ] **Step 2: Verify the recall application**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

Expected: every command exits with status 0.

- [ ] **Step 3: Run database-backed contract verification**

Against a migrated RightToken database copy:

```bash
RECALL_CONTRACT_DATABASE_URL="$TEST_DATABASE_URL" \
  go test -tags=recallcontract ./internal/handler/admin \
  -run TestRecallUserExportAgainstMigratedPostgres -count=1
```

Expected: PASS.

- [ ] **Step 4: Review the final diff against the approved design**

Run:

```bash
git diff --check
git status --short
git log --oneline -6
```

Confirm every approved exclusion, threshold, recovery rule, and 24-hour boundary has a corresponding test.

- [ ] **Step 5: Commit the verification query**

```bash
git add backend/scripts/verify-recall-users.sql
git commit -m "test: verify strict F segment lifecycle"
```
