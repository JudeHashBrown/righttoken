# Mailbox Lifecycle and Domain Throttle Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mailbox credential deletion/re-addition concurrency-safe, prevent stale async mailbox status writes, and measure domain throttle reservations from post-lock PostgreSQL time.

**Architecture:** Keep `Mailbox` as the immutable history anchor while advancing a durable `configurationVersion` for every credential lifecycle mutation. Serialize deletion with a PostgreSQL row lock and reject version-stale requests, then carry the adapter's captured configuration version through test/sync status writes. Keep deterministic throttle tests injectable, but make production reservations read `clock_timestamp()` only after acquiring the domain advisory lock and return the effective claim time.

**Tech Stack:** Next.js route handlers and React, TypeScript, Prisma 7.9, PostgreSQL, Vitest, pg-boss.

## Global Constraints

- Credential deletion removes only encrypted credentials and preserves mailbox identity, threads, messages, batches, recipients, and audits.
- Same-domain bulk attempts retain an inclusive random interval of 120–240 seconds across workers and lock contention.
- Direct sends and replies remain outside the domain throttle.
- Every behavior change follows RED → minimal implementation → GREEN.
- Integration migrations deploy from an empty test database.
- Temporarily move `prisma/migrations/20260731085644_add_site_visits` to `/private/tmp/righttoken-empty-migration-20260731085644` only around integration runner commands, and restore it with an exit trap.
- Do not amend existing commits.

---

### Task 1: Version and serialize mailbox configuration lifecycle

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260804090000_version_mailbox_configuration/migration.sql`
- Regenerate: `src/generated/prisma/**`
- Modify: `src/modules/mail/mailbox-credentials.ts`
- Modify: `src/app/api/integrations/mailboxes/[id]/route.ts`
- Modify: `src/app/api/integrations/mailboxes/route.ts`
- Modify: `src/modules/admin/workspace-queries.ts`
- Modify: `src/modules/mail/workspace-query.ts`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/components/mail/mailbox-status-detail.tsx`
- Modify: `src/components/settings/mailbox-actions.tsx`
- Test: `tests/integration/mail/schema.test.ts`
- Test: `tests/integration/mail/mailbox-credentials.test.ts`
- Test: `tests/integration/mail/mailbox-configuration-delete.test.ts`
- Test: `tests/unit/components/mailbox-actions.test.tsx`

**Interfaces:**
- `Mailbox.configurationVersion: number`, defaulting to `1` for initial and migrated configurations.
- `removeMailboxConfiguration(actorId, mailboxId, expectedConfigurationVersion)` returns `{ id, configurationVersion }`.
- A stale request throws `MailboxConfigurationVersionConflictError` and maps to HTTP 409 code `MAILBOX_CONFIGURATION_VERSION_CONFLICT`.
- `MailboxActions` receives `configurationVersion` and sends JSON `{ configurationVersion }` with DELETE.

- [ ] **Step 1: Add the migration/schema contract test and verify RED**

Query `information_schema.columns` for `Mailbox.configurationVersion` and assert that a newly inserted mailbox reports version `1` after migration. Run the focused integration test against the current database; expect the missing-column assertion to fail.

- [ ] **Step 2: Add schema, SQL migration, regenerate Prisma, and verify GREEN**

Add:

```prisma
configurationVersion Int @default(1)
```

and SQL:

```sql
ALTER TABLE "recall"."Mailbox"
  ADD COLUMN "configurationVersion" INTEGER NOT NULL DEFAULT 1;
```

Deploy through the empty-database integration runner, then rerun the focused schema test.

- [ ] **Step 3: Add lifecycle/concurrency and UI request tests and verify RED**

Cover save increment, re-add increment, two concurrent deletes of one displayed version, and delete-vs-readd stale conflict. Assert exactly one successful deletion audit and preserved history. Update the component expectation to require:

```ts
{
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ configurationVersion: 1 })
}
```

Expect failures because lifecycle mutations and DELETE currently ignore versions.

- [ ] **Step 4: Implement row serialization and optimistic conflict minimally**

Initial save creates version `1`; every existing-row upsert uses `{ increment: 1 }`. Deletion starts an interactive transaction, selects the mailbox by ID with `FOR UPDATE`, rejects a mismatched expected version, conditionally clears credentials with an `updateMany` matching ID, version, non-null config, and null deletion marker, increments the version, then records exactly one audit in the same transaction.

- [ ] **Step 5: Thread the version through API and UI and verify GREEN**

Select/return `configurationVersion` from settings and mailbox endpoints, pass it through both mailbox action renderers, parse the DELETE JSON body strictly, map conflict to 409, and refresh with a stale-state message. Run the focused integration/component tests.

- [ ] **Step 6: Commit**

Commit only Task 1 schema, generated client, lifecycle/API/UI, and tests with `fix(recall): serialize mailbox configuration lifecycle`.

---

### Task 2: Condition async mailbox status writes on captured configuration

**Files:**
- Modify: `src/modules/mail/mailbox-credentials.ts`
- Modify: `src/app/api/integrations/mailboxes/[id]/test/route.ts`
- Modify: `src/app/api/mail/sync/route.ts`
- Modify: `src/modules/mail/sync-mailbox.ts`
- Modify: `src/worker/handlers/mail-sync.ts`
- Test: `tests/integration/worker/mail-sync.test.ts`
- Create: `tests/unit/api/mailbox-connection-test-route.test.ts`

**Interfaces:**
- `getMailboxRuntimeConfiguration(mailboxId)` returns `{ config: SmtpImapConfig, configurationVersion: number }` from one configured-row read.
- `syncMailbox(..., dependencies)` receives `configurationVersion` captured with the adapter.
- Status predicates always include mailbox ID, captured version, `encryptedConfig: { not: null }`, and `configurationDeletedAt: null`; sync operations also require `enabled: true`.

- [ ] **Step 1: Add deleted/re-added stale-write regressions and verify RED**

Use deferred adapter calls to mutate the mailbox after adapter/version capture but before success/error persistence. Assert deleted credentials keep all status fields cleared and a re-added version keeps its new status rather than receiving the older operation's result.

- [ ] **Step 2: Capture runtime version and condition all affected writes**

Read encrypted config and version together, pass the version into sync, replace connection-test/manual-sync/worker error and sync-success `update` calls with `updateMany` predicates matching the captured lifecycle state, and ignore a zero-row stale write.

- [ ] **Step 3: Verify GREEN and commit**

Run focused test/sync worker suites and route tests, then commit only Task 2 files with `fix(recall): ignore stale mailbox status writes`.

---

### Task 3: Use post-lock PostgreSQL time for domain reservations

**Files:**
- Modify: `src/modules/mail/bulk-mail-throttle.ts`
- Modify: `src/modules/mail/process-mail-batch.ts`
- Test: `tests/integration/mail/mail-domain-throttle.test.ts`
- Test: `tests/integration/mail/mail-batch-delivery.test.ts`

**Interfaces:**
- Reservation input accepts an optional deterministic `now`; absence means query PostgreSQL `clock_timestamp()` after the advisory lock.
- `CLAIMED` returns `{ status, recipientId, claimedAt, runAt }`.
- Production `processMailBatch` does not pass worker-entry `now`; a test-only dependency may provide a deterministic reservation time.

- [ ] **Step 1: Add post-lock clock and delivery-time regressions and verify RED**

Hold the same-domain advisory lock, start a production-clock reservation, wait until PostgreSQL reports advisory-lock contention, retain the lock for a bounded interval, then release it. Assert `claimedAt` is at/after release and `runAt - claimedAt` is 120 seconds. Assert delivery timestamps use returned `claimedAt`, not worker-entry time.

- [ ] **Step 2: Implement post-lock effective time minimally**

Immediately after advisory lock acquisition, use injected `now` when explicitly supplied; otherwise run:

```sql
SELECT clock_timestamp() AS "now"
```

Use that value for throttle availability comparison, recipient claim/attempt timestamps, and `nextAvailableAt`. Return it as `claimedAt`, omit worker `now` in production reservations, and pass `claimedAt` to delivery.

- [ ] **Step 3: Verify GREEN and commit**

Run focused throttle and delivery integration tests, then commit only Task 3 files with `fix(recall): measure throttle slots after domain lock`.

---

### Task 4: Practical minor coverage and base-range hygiene

**Files:**
- Modify: `tests/unit/tasks/pg-task-scheduler.test.ts`
- Modify: `tests/integration/mail/mailbox-configuration-delete.test.ts`
- Modify: `tests/integration/mail/mailbox-credentials.test.ts`
- Modify: `.gitattributes`
- Modify: authored historical docs only where `git diff 5ce91163..HEAD --check` identifies whitespace.

- [ ] **Step 1: Cover omitted `runAt` directly**

Assert `scheduleMailBatch({ batchId })` passes only `{ singletonKey }`, with no `startAfter`. This adds direct coverage for existing behavior and requires no production change.

- [ ] **Step 2: Add practical deletion boundary coverage**

Use current integration route/session patterns for 401, 403, and cross-site handling; rely on Task 1 re-add/concurrency tests for operational lifecycle coverage. Record evidence for any impractical rollback or live pg-boss coverage rather than adding brittle test hooks.

- [ ] **Step 3: Make the base-range whitespace check clean**

Use a narrowly scoped generated-Prisma whitespace attribute and remove whitespace only from the authored files reported by the base-range check. Verify `git diff 5ce91163..HEAD --check` has no output.

- [ ] **Step 4: Commit**

Commit only minor tests and whitespace metadata/doc cleanup with a scoped subject.

---

### Task 5: Complete verification, review, and evidence report

**Files:**
- Create/update outside the application diff: `../.superpowers/sdd/final-fix-report.md`

- [ ] **Step 1: Run focused tests for each finding**
- [ ] **Step 2: Run `npm test`**
- [ ] **Step 3: Protect the unrelated empty migration directory and run `npm run test:integration`**
- [ ] **Step 4: Run `npm run lint`**
- [ ] **Step 5: Run `npm run build`**
- [ ] **Step 6: Run `npm run typecheck` only after build finishes**
- [ ] **Step 7: Run `git diff 5ce91163..HEAD --check`, `git diff 7bee83f4..HEAD --stat`, and inspect the complete base-range diff**
- [ ] **Step 8: Request code review and resolve all Critical/Important findings**
- [ ] **Step 9: Write the final finding-to-fix, RED/GREEN, migration, test, commit, and concern report; commit any tracked report artifact only if it is not ignored**
