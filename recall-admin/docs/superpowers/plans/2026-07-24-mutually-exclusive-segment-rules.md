# A–G Mutually Exclusive Segment Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the numeric segment settings form with a safe A–G rule builder that previews impact, publishes immutable versions, reclassifies every user, migrates eligible automation tasks, and supports history and rollback.

**Architecture:** Store a versioned, structured rule set in the existing `AutomationRuleVersion` table, compile it through a server-owned field registry, and evaluate F first, ordered A–E next, and G as the unconditional fallback. Preview runs are signed with the application secret; publication creates a durable recalculation run that a pg-boss worker processes in idempotent batches. The page edits rules locally, previews server-calculated impact, publishes the exact previewed draft, and polls the recalculation result.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Zod 4, Prisma 7/PostgreSQL, pg-boss, Vitest, Testing Library, Playwright.

## Global Constraints

- A–G codes are fixed; annotations are editable.
- Conditions are structured only: branches are OR, clauses inside a branch are AND.
- F is always first and must have conditions; G is always last and has no conditions; A–E are reorderable.
- Only fields and operators exposed by the server field registry are accepted.
- `rules:publish` remains available to primary administrators and administrators; operators are read-only.
- Publishing reclassifies every stored user.
- Only untouched `UNASSIGNED` and `TODO` automation tasks may be cancelled for a rule change; in-progress, waiting, manual, and email-reply tasks remain.
- F creates an immediate urgent task; G never creates an individual recall task.
- E defaults to less than USD 0.50, represented as `balanceUsdMinor < 50`.
- RightToken supplies `balanceUsdMinor`; the recall service stores raw amount and currency but does not fetch exchange rates.
- Registration IP remains encrypted and is never returned in preview samples or audit metadata.
- Rule versions are immutable; rollback publishes a new version and triggers another full recalculation.
- No arbitrary code, SQL, regex, custom fields, H+ groups, or rule conditions based on current segment, owner, task state, or rule version.

---

### Task 1: Structured Rule Schema, Field Registry, and Legacy Compatibility

**Files:**
- Create: `src/modules/segmentation/rule-definition.ts`
- Create: `src/modules/segmentation/field-registry.ts`
- Create: `src/modules/segmentation/default-rule-set.ts`
- Modify: `src/modules/segmentation/types.ts`
- Modify: `src/modules/segmentation/rule-config.ts`
- Test: `tests/unit/segmentation/rule-definition.test.ts`
- Test: `tests/unit/segmentation/field-registry.test.ts`

**Interfaces:**
- Produces: `SegmentRuleSet`, `SegmentGroupRule`, `SegmentClause`, `SegmentTaskPolicy`, `segmentRuleSetSchema`.
- Produces: `SEGMENT_FIELD_REGISTRY`, `validateClauseForField(clause)`.
- Produces: `defaultSegmentRuleSet`, `parseSegmentRuleConfig(value)`.
- Preserves: `loadActiveSegmentRule(tx)` but changes its `config` result to `SegmentRuleSet`.

- [ ] **Step 1: Write failing schema and registry tests**

```ts
it("accepts fixed F/A-E/G order and rejects a conditional G", () => {
  expect(segmentRuleSetSchema.parse(defaultSegmentRuleSet).groups.map((g) => g.code))
    .toEqual(["F", "B", "A", "C", "E", "D", "G"]);
  expect(() => segmentRuleSetSchema.parse({
    ...defaultSegmentRuleSet,
    groups: defaultSegmentRuleSet.groups.map((group) =>
      group.code === "G" ? { ...group, branches: [{ clauses: [booleanClause] }] } : group
    )
  })).toThrow();
});

it("rejects a numeric operator for a boolean field", () => {
  expect(() => validateClauseForField({
    field: "anomalyActive",
    operator: "gte",
    value: 1
  })).toThrow("operator");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/unit/segmentation/rule-definition.test.ts tests/unit/segmentation/field-registry.test.ts`

Expected: FAIL because the rule schema and field registry do not exist.

- [ ] **Step 3: Implement the typed rule schema**

Define these stable shapes in `rule-definition.ts`:

```ts
export const segmentCodes = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const conditionOperators = [
  "eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte",
  "between", "before", "before_or_equal", "after", "after_or_equal",
  "is_null", "is_not_null"
] as const;

export type SegmentClause = {
  field: SegmentFieldKey;
  operator: ConditionOperator;
  value?: boolean | number | string | string[] | [number, number];
  unit?: "minutes" | "hours" | "days";
};

export type SegmentRuleSet = {
  schemaVersion: 2;
  groups: SegmentGroupRule[];
  changeSummary: string;
};
```

Use Zod `superRefine` to enforce exactly seven unique codes, F at index 0, G last, A–E exactly once, F with at least one branch, G with zero branches, annotation length 1–500, branch/condition maximums of 10/20, F policy immediate and urgent, and G policy disabled.

- [ ] **Step 4: Implement the field registry**

The registry must expose labels and allowed operators for:

```ts
registeredAt, registrationElapsed, source, registrationIp, countryCode,
checkoutStarted, paymentStatus, firstPaidAt, totalPaidMinor,
successfulCallCount, firstCallAt, lastCallAt, lastCallElapsed,
balanceUsdMinor, balanceChangedAt, emptyBalanceElapsed,
anomalyActive, anomalyChangedAt, unsubscribed, paused,
externalUserId, emailDomain
```

Keep the registry server-owned and export only display-safe metadata to the UI. Validate ISO country codes, normalized domains, dates, finite integer amounts, IP literals, list length, and time units.

- [ ] **Step 5: Add the default v2 rule set and legacy adapter**

Default conditions must preserve existing behavior except for the approved E threshold:

```ts
F: anomalyActive eq true
B: firstPaidAt is_null AND checkoutStarted eq true
A: firstPaidAt is_null AND checkoutStarted eq false
C: firstPaidAt is_not_null AND successfulCallCount eq 0
E: firstPaidAt is_not_null AND successfulCallCount gt 0 AND balanceUsdMinor lt 50
D: successfulCallCount gt 0 AND balanceUsdMinor gte 50 AND lastCallElapsed gte 7 days
G: fallback
```

Convert legacy `{ emptyBalanceMinor, inactiveMs, ... }` configs to the equivalent v2 structure during reads without publishing or recalculating.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm test -- tests/unit/segmentation/rule-definition.test.ts tests/unit/segmentation/field-registry.test.ts`

Expected: both files PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/segmentation tests/unit/segmentation
git commit -m "feat: define structured segment rules"
```

---

### Task 2: Rule Evaluator and Natural-Language Explanation

**Files:**
- Create: `src/modules/segmentation/segment-facts.ts`
- Create: `src/modules/segmentation/evaluate-clause.ts`
- Create: `src/modules/segmentation/evaluate-rule-set.ts`
- Create: `src/modules/segmentation/describe-rule.ts`
- Modify: `src/modules/segmentation/classify-user.ts`
- Modify: `src/modules/segmentation/resegment-user.ts`
- Test: `tests/unit/segmentation/evaluate-rule-set.test.ts`
- Test: `tests/unit/segmentation/describe-rule.test.ts`
- Modify: `tests/unit/segmentation/classify-user.test.ts`

**Interfaces:**
- Consumes: `SegmentRuleSet` and the field registry from Task 1.
- Produces: `buildSegmentFacts(user, now, registrationIp?)`.
- Produces: `evaluateRuleSet(facts, ruleSet): SegmentEvaluation`.
- Produces: `describeGroupRule(group): string`.
- Preserves: `classifyUser(facts, now, config)` as a compatibility wrapper.

- [ ] **Step 1: Write evaluator tests for AND, OR, priority, and fallback**

```ts
it("uses OR between branches and AND inside a branch", () => {
  const evaluation = evaluateRuleSet(facts({ anomalyActive: true }), defaultSegmentRuleSet);
  expect(evaluation).toMatchObject({
    segment: "F",
    matchedGroups: ["F"],
    reason: expect.stringContaining("服务异常")
  });
});

it("changes the result when overlapping D and E rules are reordered", () => {
  const overlap = facts({ successfulCallCount: 4, balanceUsdMinor: 0, lastCallElapsedMinutes: 20_000 });
  expect(evaluateRuleSet(overlap, withOrder(["E", "D"])).segment).toBe("E");
  expect(evaluateRuleSet(overlap, withOrder(["D", "E"])).segment).toBe("D");
});

it("falls back to G when no configured branch matches", () => {
  expect(evaluateRuleSet(healthyFacts, defaultSegmentRuleSet).segment).toBe("G");
});
```

- [ ] **Step 2: Run evaluator tests and verify RED**

Run: `npm test -- tests/unit/segmentation/evaluate-rule-set.test.ts tests/unit/segmentation/describe-rule.test.ts`

Expected: FAIL because the evaluator and description functions do not exist.

- [ ] **Step 3: Implement normalized fact extraction**

Build a plain `SegmentEvaluationFacts` object from `UserProfile`. Relative values must be computed in whole minutes from the supplied `now`; missing source timestamps stay `null`. Normalize email domain and uppercase country code. Decrypt IP only when a rule actually references `registrationIp`.

- [ ] **Step 4: Implement clause and rule evaluation**

```ts
export type SegmentEvaluation = SegmentDecision & {
  matchedGroups: SegmentCode[];
  matchedBranchByGroup: Partial<Record<SegmentCode, number>>;
};
```

Evaluate every non-G group once to collect overlap metadata, then choose the first match in configured order. Use G if none match. Return a stable reason containing the group code, matched branch, and human description; do not include raw IP or email.

- [ ] **Step 5: Implement Chinese rule descriptions**

Map every field and operator to consistent copy, for example:

```text
如果成功调用次数大于 0，并且当前美元等值余额低于 50 美分，则进入 E 组。
```

Descriptions must be generated from the same parsed structure used by the evaluator.

- [ ] **Step 6: Switch resegmentation to the new evaluator**

`resegmentUser` loads `SegmentRuleSet`, evaluates the user, preserves the existing manual override rule except that automatic F still wins, and stores the new rule version and stable reason.

- [ ] **Step 7: Run focused and legacy tests**

Run: `npm test -- tests/unit/segmentation`

Expected: all segmentation unit tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/segmentation tests/unit/segmentation
git commit -m "feat: evaluate mutually exclusive segment rules"
```

---

### Task 3: RightToken Currency Facts and IP-Derived Country Contract

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260724140000_add_segment_rule_runtime/migration.sql`
- Modify: `src/modules/integrations/righttoken/adapter.ts`
- Modify: `src/modules/integrations/righttoken/reconcile.ts`
- Modify: `src/modules/integrations/righttoken/simulator.ts`
- Modify: `src/app/api/internal/righttoken/events/route.ts`
- Modify: `tests/contract/righttoken-adapter.test.ts`
- Modify: `tests/integration/integrations/reconciliation.test.ts`
- Modify: `tests/integration/users/ingest-event.test.ts`

**Interfaces:**
- Adds to `UserProfile`: `balanceCurrency String @default("USD")`, `balanceUsdMinor Int @default(0)`.
- Adds to `RightTokenUserSnapshot`: `balanceCurrency`, `balanceUsdMinor`.
- Treats `countryCode` as the ISO result derived by RightToken from registration IP.

- [ ] **Step 1: Write failing contract and reconciliation tests**

```ts
expect(user).toMatchObject({
  balanceCurrency: "EUR",
  balanceMinor: 44,
  balanceUsdMinor: 49,
  countryCode: "DE"
});
```

Verify legacy snapshots without the two new balance fields normalize to USD and reuse `balanceMinor`, while formal snapshots preserve raw currency and USD equivalent.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:integration -- tests/contract/righttoken-adapter.test.ts tests/integration/integrations/reconciliation.test.ts`

Expected: FAIL because the adapter and database do not have currency-normalized balance fields.

- [ ] **Step 3: Add the database migration**

Migration SQL:

```sql
ALTER TABLE "UserProfile"
  ADD COLUMN "balanceCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "balanceUsdMinor" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserProfile"
SET "balanceUsdMinor" = "balanceMinor";
```

Regenerate Prisma client with `npx prisma generate`.

- [ ] **Step 4: Update snapshot, event, reconciliation, and simulator mappings**

The adapter schema defaults `balanceCurrency` to `USD` and transforms a missing `balanceUsdMinor` to `balanceMinor`. Reconciliation writes all three balance fields. `balance.changed` accepts and persists the normalized USD amount. Country is consumed as an uppercase ISO result already derived from registration IP; no browser or worker calls an external geolocation service.

- [ ] **Step 5: Run contract and integration tests**

Run: `npm run test:integration -- tests/contract/righttoken-adapter.test.ts tests/integration/integrations/reconciliation.test.ts tests/integration/users/ingest-event.test.ts`

Expected: all selected files PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma src/modules/integrations src/app/api/internal/righttoken tests/contract tests/integration
git commit -m "feat: store normalized RightToken balance facts"
```

---

### Task 4: Dynamic Task Policy and Future Re-evaluation

**Files:**
- Create: `src/modules/segmentation/next-rule-boundary.ts`
- Modify: `src/modules/tasks/trigger-policy.ts`
- Modify: `src/modules/tasks/create-triggered-task.ts`
- Modify: `src/modules/tasks/scheduler.ts`
- Modify: `src/modules/tasks/pg-task-scheduler.ts`
- Modify: `src/worker/handlers/segment-check.ts`
- Test: `tests/unit/segmentation/next-rule-boundary.test.ts`
- Modify: `tests/unit/tasks/trigger-policy.test.ts`
- Modify: `tests/integration/worker/segment-check.test.ts`

**Interfaces:**
- Produces: `getTaskPolicy(ruleSet, segment)`.
- Produces: `getNextRuleBoundary(user, ruleSet, now): Date | null`.
- Changes scheduled segment checks to carry `userId`, `ruleVersion`, `runAt`, and a deterministic `boundaryKey`.

- [ ] **Step 1: Write failing policy and boundary tests**

Test that A–E policies come from the active rule, F cannot be delayed or downgraded, G remains disabled, and a `registrationElapsed gte 120 minutes` clause schedules exactly at `registeredAt + 120 minutes`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/unit/segmentation/next-rule-boundary.test.ts tests/unit/tasks/trigger-policy.test.ts`

Expected: FAIL because task policy and time boundaries are hard-coded.

- [ ] **Step 3: Implement policy lookup and boundary calculation**

Scan relative-time and relative-date clauses for their next transition. Return the earliest future instant, deduplicate using `${userId}:${ruleVersion}:${runAt.toISOString()}`, and return `null` when no time-based condition can change without a new event.

- [ ] **Step 4: Update scheduled checks**

At execution, reload the user and active rule. Skip if the active version differs from the job version. Otherwise resegment, create or schedule the configured task, and schedule the next boundary. Do not trust an expected segment from the old job payload.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/unit/segmentation/next-rule-boundary.test.ts tests/unit/tasks/trigger-policy.test.ts`

Run: `npm run test:integration -- tests/integration/worker/segment-check.test.ts`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/segmentation src/modules/tasks src/worker/handlers/segment-check.ts tests
git commit -m "feat: schedule dynamic segment rule boundaries"
```

---

### Task 5: Read-Only Full Preview and Signed Draft Token

**Files:**
- Create: `src/modules/segmentation/preview-token.ts`
- Create: `src/modules/segmentation/preview-rule-set.ts`
- Create: `src/app/api/automation/segment-rules/preview/route.ts`
- Test: `tests/unit/segmentation/preview-token.test.ts`
- Test: `tests/integration/segmentation/rule-preview.test.ts`

**Interfaces:**
- Produces: `previewSegmentRuleSet(actorId, draft, now): Promise<SegmentRulePreview>`.
- Produces: `signSegmentPreview(payload)` and `verifySegmentPreview(token, actorId, draftHash)`.
- Preview result contains distributions, moves, overlaps, G fallback count, task cancellations, task creations, F urgent creations, samples without PII, draft hash, expiry, and signed token.

- [ ] **Step 1: Write failing preview tests**

Create A, overlapping D/E, F, and G users. Assert that preview:

```ts
expect(result).toMatchObject({
  totalUsers: 4,
  migrations: expect.any(Number),
  overlapUsers: 1,
  fallbackUsers: 1,
  token: expect.any(String)
});
expect(await prisma.segmentHistory.count()).toBe(beforeHistory);
expect(await prisma.recallTask.count()).toBe(beforeTasks);
```

Also assert that an operator receives 403 and that no sample contains email, IP, or encrypted IP.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/unit/segmentation/preview-token.test.ts`

Run: `npm run test:integration -- tests/integration/segmentation/rule-preview.test.ts`

Expected: FAIL because preview services and route do not exist.

- [ ] **Step 3: Implement canonical hashing and signed tokens**

Canonicalize the parsed draft, hash with SHA-256, and HMAC-sign:

```ts
type PreviewTokenPayload = {
  actorId: string;
  draftHash: string;
  expiresAt: string;
};
```

Use `SESSION_COOKIE_SECRET`, constant-time signature comparison, and a 30-minute expiry.

- [ ] **Step 4: Implement paginated shadow evaluation**

Read users in deterministic ID order in batches of 500. Evaluate without writes, count all result categories, inspect only `UNASSIGNED`/`TODO` automation tasks for cancellation impact, and cap overlap/migration samples at 20 PII-free records containing external ID, old group, new group, and matched group codes.

- [ ] **Step 5: Implement the preview route**

Require same origin and `rules:publish`, parse the v2 draft, execute preview, audit only draft hash and aggregate counts, and return stable codes for schema errors.

- [ ] **Step 6: Run tests and verify GREEN**

Run the two commands from Step 2.

Expected: all preview tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/segmentation src/app/api/automation/segment-rules/preview tests
git commit -m "feat: preview segment rule impact"
```

---

### Task 6: Version Publication and Durable Recalculation Runs

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260724140000_add_segment_rule_runtime/migration.sql`
- Create: `src/modules/segmentation/publish-rule-set.ts`
- Modify: `src/app/api/automation/segment-rules/route.ts`
- Modify: `src/modules/tasks/scheduler.ts`
- Modify: `src/modules/tasks/pg-task-scheduler.ts`
- Modify: `src/worker/job-names.ts`
- Test: `tests/integration/segmentation/rule-publication.test.ts`

**Interfaces:**
- Adds enum `RecalculationStatus`: `PENDING`, `RUNNING`, `COMPLETED`, `PARTIAL_FAILURE`, `FAILED`.
- Adds model `SegmentRecalculationRun` with version, actor, idempotency key, counters, cursor, preview summary, timestamps, and error summary.
- Produces: `publishSegmentRuleSet({ actorId, draft, previewToken, idempotencyKey, now })`.
- Adds: `TaskScheduler.scheduleSegmentRecalculation({ runId })`.

- [ ] **Step 1: Write failing publication tests**

Assert exact draft/token binding, one active immutable version, one run, audit creation, operator rejection, stale/tampered preview rejection, and identical results for duplicate idempotency keys.

- [ ] **Step 2: Run test and verify RED**

Run: `npm run test:integration -- tests/integration/segmentation/rule-publication.test.ts`

Expected: FAIL because publication runs and preview-bound publishing do not exist.

- [ ] **Step 3: Add the recalculation model and migration**

Use a unique `idempotencyKey`, unique `ruleVersionId`, indexed status/created time, integer counters defaulting to zero, nullable cursor/timestamps, and JSON preview/error summaries. Add relations to `AutomationRuleVersion` and publishing `Member`.

- [ ] **Step 4: Implement atomic publication**

Within a serializable transaction and advisory lock:

1. verify active actor and `rules:publish`;
2. parse the draft and verify the preview token;
3. return the existing run/version for a repeated idempotency key;
4. deactivate the current version;
5. create the next immutable version and recalculation run;
6. write audit metadata containing only version, hash, change summary, and aggregate preview counts.

After commit, enqueue the recalculation run.

- [ ] **Step 5: Update the publish route**

Require JSON `{ draft, previewToken, changeSummary }` and `Idempotency-Key`. Return `{ version, runId, status }`; return stable 400/401/403/409 codes.

- [ ] **Step 6: Run test and verify GREEN**

Run the command from Step 2.

Expected: publication test PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma src/modules/segmentation src/app/api/automation/segment-rules src/modules/tasks src/worker/job-names.ts tests/integration/segmentation
git commit -m "feat: publish versioned segment rules"
```

---

### Task 7: Batched Full Recalculation and Safe Task Migration

**Files:**
- Create: `src/modules/segmentation/recalculate-users.ts`
- Create: `src/modules/tasks/migrate-rule-change-tasks.ts`
- Create: `src/worker/handlers/segment-recalculation.ts`
- Modify: `src/worker/register-handlers.ts`
- Modify: `src/modules/tasks/create-triggered-task.ts`
- Test: `tests/integration/segmentation/full-recalculation.test.ts`
- Test: `tests/integration/tasks/rule-change-migration.test.ts`
- Test: `tests/integration/worker/segment-recalculation.test.ts`

**Interfaces:**
- Produces: `recalculateUserBatch(runId, batchSize, now)`.
- Produces: `migrateTasksForRuleChange(tx, input)`.
- Worker processes at most 200 users per job and re-enqueues until complete.

- [ ] **Step 1: Write failing recalculation and migration tests**

Cover:

```ts
UNASSIGNED/TODO old automation task -> CANCELLED with "segment_rule_changed"
IN_PROGRESS/WAITING_USER automation task -> unchanged
MANUAL/EMAIL_REPLY task -> unchanged
new F result -> urgent task + notification intents
new G result -> no individual task
same batch executed twice -> no duplicate history/tasks/counters
one malformed user -> run PARTIAL_FAILURE, other users complete
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:integration -- tests/integration/segmentation/full-recalculation.test.ts tests/integration/tasks/rule-change-migration.test.ts tests/integration/worker/segment-recalculation.test.ts`

Expected: FAIL because the recalculation worker does not exist.

- [ ] **Step 3: Implement safe task migration**

Cancel only old `AUTOMATION` tasks in `UNASSIGNED` or `TODO`; set `cancelledAt`, `cancelReason: "segment_rule_changed"`, and create `task.auto_cancelled` activities. Preserve all other tasks. Create a new task using the new rule version and dynamic policy only when no equivalent new-version task exists.

- [ ] **Step 4: Implement idempotent user batches**

Lock the run, select users after the stored cursor, then process each user in its own transaction. Reload current facts, evaluate the run's immutable rule version, honor active manual overrides except F, update `segmentRuleVersion`, append history only on actual segment change, migrate tasks, and collect counter deltas. Store stable error codes without PII.

- [ ] **Step 5: Implement and register the worker**

Change run status from PENDING to RUNNING, process 200 users, update progress, re-enqueue when a cursor remains, and finalize as COMPLETED or PARTIAL_FAILURE. A fatal configuration error sets FAILED. Register the queue in `JOBS`, `ensureQueues`, and `registerHandlers`.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 2.

Expected: all recalculation tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/segmentation src/modules/tasks src/worker tests/integration
git commit -m "feat: recalculate all users after rule publication"
```

---

### Task 8: Run Status, History, Diff, Retry, and Rollback APIs

**Files:**
- Create: `src/modules/segmentation/rule-history.ts`
- Create: `src/app/api/automation/segment-rules/runs/[id]/route.ts`
- Create: `src/app/api/automation/segment-rules/runs/[id]/retry/route.ts`
- Create: `src/app/api/automation/segment-rules/versions/route.ts`
- Create: `src/app/api/automation/segment-rules/versions/[version]/rollback-preview/route.ts`
- Create: `src/app/api/automation/segment-rules/versions/[version]/rollback/route.ts`
- Test: `tests/integration/segmentation/rule-history-routes.test.ts`

**Interfaces:**
- Produces PII-free run status and immutable version summaries.
- Produces structural group/order/annotation/condition/policy diffs.
- Rollback preview reuses Task 5; rollback publication reuses Task 6 and creates a new version.

- [ ] **Step 1: Write failing route tests**

Test administrator access, operator read-only history access, operator write rejection, PII-free status, retry only for PARTIAL_FAILURE/FAILED, rollback creating `vN+1`, and rollback requiring a fresh matching preview token.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:integration -- tests/integration/segmentation/rule-history-routes.test.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement history and diff queries**

Return version, creator display name, created time, change summary, safe rule config, recalculation summary, and differences from the active version. Never mutate old versions.

- [ ] **Step 4: Implement status and retry routes**

GET run status requires an authenticated administrator page viewer. Retry requires `rules:publish`, resets only failed-user work for the same run, audits the request, and enqueues the same run id.

- [ ] **Step 5: Implement rollback preview and publication**

Copy the selected old config into a new draft with a generated change summary prefix, preview against current users, then publish as a new version through the same token/idempotency path.

- [ ] **Step 6: Run tests and verify GREEN**

Run the command from Step 2.

Expected: route tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/segmentation src/app/api/automation/segment-rules tests/integration/segmentation
git commit -m "feat: add segment rule history and rollback"
```

---

### Task 9: Non-Technical A–G Rule Builder UI

**Files:**
- Create: `src/components/automation/segment-rule-workspace.tsx`
- Create: `src/components/automation/segment-group-editor.tsx`
- Create: `src/components/automation/segment-condition-editor.tsx`
- Create: `src/components/automation/segment-rule-preview.tsx`
- Create: `src/components/automation/segment-rule-history.tsx`
- Replace: `src/components/automation/segment-rule-editor.tsx`
- Modify: `src/app/(dashboard)/automation/segments/page.tsx`
- Modify: `src/modules/admin/workspace-queries.ts`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `tests/unit/components/segment-rule-editor.test.tsx`
- Create: `tests/unit/components/segment-condition-editor.test.tsx`
- Create: `tests/unit/components/segment-rule-workspace.test.tsx`

**Interfaces:**
- Page passes active rule, field metadata, distribution, latest run, history, and `canPublish`.
- Workspace owns draft, dirty state, preview token/result, publication state, polling, and history selection.
- Child editors receive typed value/update callbacks and contain no network logic.

- [ ] **Step 1: Write failing component tests**

Verify:

- seven groups appear with editable annotations;
- F says “固定最高优先级” and G says “未命中前面规则时自动进入”;
- A–E move up/down with keyboard-accessible buttons;
- adding an OR branch and AND clause updates the Chinese summary;
- changing a field replaces incompatible operator/value controls;
- only registry fields are selectable;
- dirty state says “草稿未发布”;
- preview renders migrations, overlaps, task effects, and blocking errors;
- publish requires a change summary and valid preview;
- operator view has no editable controls or publish action.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/unit/components/segment-rule-editor.test.tsx tests/unit/components/segment-condition-editor.test.tsx tests/unit/components/segment-rule-workspace.test.tsx`

Expected: FAIL because the structured editor does not exist.

- [ ] **Step 3: Implement the editor state and condition controls**

Render field, operator, typed value, and unit controls with persistent labels. Add buttons named “添加并且条件”, “添加或者条件组”, “复制条件组”, and “删除条件”. Keep F and G lock explanations visible. Use native controls and existing product styles.

- [ ] **Step 4: Implement ordering and natural-language summaries**

Provide explicit “上移” and “下移” buttons for A–E and optional pointer drag enhancement. The buttons are the accessible source of truth. Show the evaluator-generated Chinese sentence above each group's conditions.

- [ ] **Step 5: Implement preview, publish, progress, history, and rollback**

Preview calls the preview route. Publish sends the exact draft, token, required change summary, and `crypto.randomUUID()` idempotency key. Poll run status every two seconds while pending/running and stop on terminal state. History shows versions and differences; rollback follows preview then confirmation.

- [ ] **Step 6: Update page copy and remove the ambiguous parameter cards**

Replace the current numeric summary/form with:

```text
系统从上到下判断。用户命中第一个分组后停止，因此每个用户只进入一个组。
F 始终优先，G 接收所有未命中的用户。
```

Keep user distribution and recent migration records below the editor. All layouts must remain usable at 360px, 768px, and desktop widths.

- [ ] **Step 7: Run component tests and verify GREEN**

Run the command from Step 2.

Expected: all three component test files PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/automation src/app/'(dashboard)'/automation/segments src/modules/admin/workspace-queries.ts src/components/workspaces/workspace.module.css tests/unit/components
git commit -m "feat: add non-technical segment rule builder"
```

---

### Task 10: End-to-End Workflow, Regression, and Operational Documentation

**Files:**
- Create: `tests/e2e/segment-rule-workflow.spec.ts`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `.env.example`

**Interfaces:**
- Exercises the complete administrator workflow against the real local database and worker.
- Documents required worker queue, migration, currency contract, and rollback behavior.

- [ ] **Step 1: Write the failing end-to-end test**

The test must log in as an administrator, open `/automation/segments`, edit the E annotation and threshold, move E above D, preview, publish, observe progress completion, confirm a known overlapping user moved to E, inspect history, and rollback through a newly published version.

- [ ] **Step 2: Run E2E and verify RED**

Run: `npm run test:e2e -- tests/e2e/segment-rule-workflow.spec.ts`

Expected: FAIL before the complete UI/worker workflow is connected.

- [ ] **Step 3: Complete only missing workflow wiring**

Fix integration gaps exposed by the E2E test without expanding scope. Add runbook instructions for:

```text
npm run db:deploy
npm run worker
APP_URL=http://127.0.0.1:3101 npm run dev -- --hostname 127.0.0.1 --port 3101
```

Document `balanceCurrency`, `balanceMinor`, `balanceUsdMinor`, IP-derived `countryCode`, publication impact, retry, and rollback.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run worker:build
npm run build
npm run test:e2e
git diff --check -- ':!src/generated/**'
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e docs .env.example
git commit -m "test: verify segment rule publishing workflow"
```

