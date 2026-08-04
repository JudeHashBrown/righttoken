# Domain-Wide Bulk Mail Throttle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee a random 2–4 minute interval between every two bulk-mail delivery attempts from the same sender domain, across batches, mailboxes, workers, and restarts.

**Architecture:** Persist one throttle row per normalized sender domain. A PostgreSQL transaction-scoped advisory lock serializes slot reservation, then the worker claims at most one recipient and advances the domain clock before SMTP delivery. The durable task scheduler accepts an optional `runAt` and wakes blocked batches at the stored domain time.

**Tech Stack:** Next.js 16, TypeScript, Prisma 7, PostgreSQL, pg-boss, Vitest

## Global Constraints

- The delay for every bulk delivery attempt is a random integer from 120 through 240 seconds, inclusive.
- The first eligible attempt for a sender domain may run immediately.
- All bulk batches and all mailboxes with the same normalized sender domain share one throttle.
- Different sender domains are independent.
- A failed SMTP attempt consumes its reserved interval.
- Direct single-user sends and replies remain immediate and do not read or update the bulk throttle.
- Do not add an administrator-facing interval setting.
- Preserve existing audience, suppression, pause, duplicate-recipient, idempotency, audit, and manual-retry behavior.
- The pre-existing empty local directory `prisma/migrations/20260731085644_add_site_visits` must be moved to `/private/tmp/righttoken-empty-migration-20260731085644` before the first integration run and restored after the final integration run, including when a test fails. Do not commit, delete, or modify that unrelated directory.

---

### Task 1: Pure sender-domain and random-delay rules

**Files:**
- Create: `src/modules/mail/bulk-mail-throttle.ts`
- Create: `tests/unit/mail/bulk-mail-throttle.test.ts`

**Interfaces:**
- Produces: `senderDomainFromAddress(address: string): string`
- Produces: `randomBulkMailDelayMs(random?: () => number): number`
- Produces constants `BULK_MAIL_MIN_DELAY_SECONDS` and `BULK_MAIL_MAX_DELAY_SECONDS`

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from "vitest";
import {
  randomBulkMailDelayMs,
  senderDomainFromAddress
} from "@/modules/mail/bulk-mail-throttle";

describe("bulk mail throttle rules", () => {
  it("normalizes every mailbox on the same sender domain", () => {
    expect(senderDomainFromAddress(" Alisa@RightToken.AI ")).toBe(
      "righttoken.ai"
    );
    expect(senderDomainFromAddress("contact@righttoken.ai")).toBe(
      "righttoken.ai"
    );
  });

  it("rejects an address without a usable sender domain", () => {
    expect(() => senderDomainFromAddress("invalid-address")).toThrow(
      "INVALID_SENDER_ADDRESS"
    );
  });

  it("returns an inclusive random delay from 120 through 240 seconds", () => {
    expect(randomBulkMailDelayMs(() => 0)).toBe(120_000);
    expect(randomBulkMailDelayMs(() => 0.5)).toBe(180_000);
    expect(randomBulkMailDelayMs(() => 0.999_999)).toBe(240_000);
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run: `npm test -- tests/unit/mail/bulk-mail-throttle.test.ts`

Expected: FAIL because `@/modules/mail/bulk-mail-throttle` does not exist.

- [ ] **Step 3: Implement the pure rules**

```ts
export const BULK_MAIL_MIN_DELAY_SECONDS = 120;
export const BULK_MAIL_MAX_DELAY_SECONDS = 240;

export function senderDomainFromAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  const domain = normalized.slice(separator + 1);
  if (
    separator <= 0 ||
    !domain ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    !domain.includes(".")
  ) {
    throw new Error("INVALID_SENDER_ADDRESS");
  }
  return domain;
}

export function randomBulkMailDelayMs(
  random: () => number = Math.random
): number {
  const unit = Math.min(Math.max(random(), 0), 0.999_999_999_999);
  const seconds =
    BULK_MAIL_MIN_DELAY_SECONDS +
    Math.floor(
      unit *
        (BULK_MAIL_MAX_DELAY_SECONDS -
          BULK_MAIL_MIN_DELAY_SECONDS +
          1)
    );
  return seconds * 1_000;
}
```

- [ ] **Step 4: Run the focused unit test and verify GREEN**

Run: `npm test -- tests/unit/mail/bulk-mail-throttle.test.ts`

Expected: 1 file and 3 tests pass.

- [ ] **Step 5: Commit the pure rules**

```bash
git add src/modules/mail/bulk-mail-throttle.ts tests/unit/mail/bulk-mail-throttle.test.ts
git commit -m "feat(recall): define bulk mail throttle rules"
```

---

### Task 2: Durable sender-domain throttle schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260803190000_add_mail_domain_throttle/migration.sql`
- Create: `tests/integration/mail/mail-domain-throttle-migration.test.ts`
- Regenerate: `src/generated/prisma/**`

**Interfaces:**
- Produces Prisma model `MailDomainThrottle` keyed by `senderDomain`
- Produces database table `recall.MailDomainThrottle`

- [ ] **Step 1: Write a migration-contract integration test without generated model types**

```ts
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("mail domain throttle migration", () => {
  afterAll(async () => prisma.$disconnect());

  it("creates the durable sender-domain throttle columns", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT "column_name"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'recall'
        AND "table_name" = 'MailDomainThrottle'
      ORDER BY "column_name" ASC
    `;
    expect(columns.map((row) => row.column_name)).toEqual([
      "createdAt",
      "nextAvailableAt",
      "senderDomain",
      "updatedAt"
    ]);
  });
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npm run test:integration`

Expected: FAIL because the table is absent and the returned column list is empty.

- [ ] **Step 3: Add the Prisma model**

```prisma
model MailDomainThrottle {
  senderDomain    String   @id
  nextAvailableAt DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([nextAvailableAt])
  @@schema("recall")
}
```

- [ ] **Step 4: Add the SQL migration**

```sql
CREATE TABLE "recall"."MailDomainThrottle" (
  "senderDomain" TEXT NOT NULL,
  "nextAvailableAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailDomainThrottle_pkey" PRIMARY KEY ("senderDomain")
);

CREATE INDEX "MailDomainThrottle_nextAvailableAt_idx"
ON "recall"."MailDomainThrottle"("nextAvailableAt");
```

- [ ] **Step 5: Regenerate the Prisma client and rerun the contract test**

Run: `npx prisma generate`

Run: `npm run test:integration`

Expected: the focused integration test passes after the migration is deployed by the integration runner.

- [ ] **Step 6: Commit the durable schema**

```bash
git add prisma/schema.prisma prisma/migrations/20260803190000_add_mail_domain_throttle/migration.sql tests/integration/mail/mail-domain-throttle-migration.test.ts src/generated/prisma
git commit -m "feat(recall): persist bulk mail domain throttle"
```

---

### Task 3: Delayed durable mail-batch scheduling

**Files:**
- Modify: `src/modules/tasks/scheduler.ts`
- Modify: `src/modules/tasks/pg-task-scheduler.ts`
- Create: `tests/unit/tasks/pg-task-scheduler.test.ts`
- Modify: scheduler fakes in `tests/integration/mail/create-mail-batch.test.ts`
- Modify: scheduler fakes in `tests/integration/mail/retry-mail-batch.test.ts`
- Modify: scheduler fakes in `tests/integration/mail/mail-batch-delivery.test.ts`

**Interfaces:**
- Produces: `MailBatchSchedule = { batchId: string; runAt?: Date }`
- Changes: `TaskScheduler.scheduleMailBatch?(input: MailBatchSchedule): Promise<void>`
- `PgTaskScheduler` maps `runAt` to pg-boss `startAfter`

- [ ] **Step 1: Write the failing scheduler unit test**

```ts
import { describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { PgTaskScheduler } from "@/modules/tasks/pg-task-scheduler";
import { JOBS } from "@/worker/job-names";

describe("PgTaskScheduler mail batches", () => {
  it("persists the requested next bulk-mail run time", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const scheduler = new PgTaskScheduler(
      { upsert } as unknown as PgBoss
    );
    const runAt = new Date("2026-08-03T12:03:00.000Z");

    await scheduler.scheduleMailBatch({
      batchId: "batch-1",
      runAt
    });

    expect(upsert).toHaveBeenCalledWith(
      JOBS.MAIL_BATCH,
      { batchId: "batch-1", runAt },
      { singletonKey: "batch-1", startAfter: runAt }
    );
  });
});
```

- [ ] **Step 2: Run the scheduler test and verify RED**

Run: `npm test -- tests/unit/tasks/pg-task-scheduler.test.ts`

Expected: FAIL because `runAt` is not accepted or passed as `startAfter`.

- [ ] **Step 3: Extend the scheduler contract and implementation**

```ts
export type MailBatchSchedule = {
  batchId: string;
  runAt?: Date;
};

// In TaskScheduler:
scheduleMailBatch?(input: MailBatchSchedule): Promise<void>;

// In PgTaskScheduler:
async scheduleMailBatch(input: MailBatchSchedule): Promise<void> {
  await this.boss.upsert(JOBS.MAIL_BATCH, input, {
    singletonKey: input.batchId,
    ...(input.runAt ? { startAfter: input.runAt } : {})
  });
}
```

- [ ] **Step 4: Update typed scheduler fakes to accept the extended input**

Keep existing assertions on `batchId`; where a fake captures scheduling, also capture `runAt` as `Date | undefined` without changing create/retry behavior.

- [ ] **Step 5: Run scheduler and affected API tests**

Run: `npm test -- tests/unit/tasks/pg-task-scheduler.test.ts tests/unit/api/mail-batch-routes.test.ts tests/unit/api/mail-batches-route.test.ts`

Expected: all focused unit tests pass.

- [ ] **Step 6: Commit delayed scheduling**

```bash
git add src/modules/tasks/scheduler.ts src/modules/tasks/pg-task-scheduler.ts tests/unit/tasks/pg-task-scheduler.test.ts tests/integration/mail/create-mail-batch.test.ts tests/integration/mail/retry-mail-batch.test.ts tests/integration/mail/mail-batch-delivery.test.ts
git commit -m "feat(recall): schedule delayed bulk mail jobs"
```

---

### Task 4: Atomic global domain slot reservation

**Files:**
- Modify: `src/modules/mail/bulk-mail-throttle.ts`
- Create: `tests/integration/mail/mail-domain-throttle.test.ts`

**Interfaces:**
- Produces `reserveBulkMailRecipient(tx, input): Promise<BulkMailReservation>`
- `BulkMailReservation` is one of `WAIT`, `EMPTY`, or `CLAIMED`
- Consumes generated Prisma `TransactionClient` and `MailBatchRecipient`

- [ ] **Step 1: Write the failing integration tests**

Create a unique `sharedSenderDomain` and `otherSenderDomain` with `randomUUID()` so Vitest files cannot share throttle state. Create two active mailboxes on `sharedSenderDomain`, one active mailbox on `otherSenderDomain`, and one pending-recipient batch for each mailbox. Use `prisma.$transaction` to call `reserveBulkMailRecipient` with a fixed clock and fixed random source. Delete both throttle rows in `afterAll`.

```ts
const first = await prisma.$transaction((tx) =>
  reserveBulkMailRecipient(tx, {
    batchId: firstBatchId,
    senderDomain: sharedSenderDomain,
    now,
    random: () => 0
  })
);
expect(first).toMatchObject({
  status: "CLAIMED",
  runAt: new Date(now.getTime() + 120_000)
});

const sameDomain = await prisma.$transaction((tx) =>
  reserveBulkMailRecipient(tx, {
    batchId: secondBatchId,
    senderDomain: sharedSenderDomain,
    now,
    random: () => 0.999_999
  })
);
expect(sameDomain).toEqual({
  status: "WAIT",
  runAt: new Date(now.getTime() + 120_000)
});

const otherDomain = await prisma.$transaction((tx) =>
  reserveBulkMailRecipient(tx, {
    batchId: otherDomainBatchId,
    senderDomain: otherSenderDomain,
    now,
    random: () => 0.999_999
  })
);
expect(otherDomain).toMatchObject({
  status: "CLAIMED",
  runAt: new Date(now.getTime() + 240_000)
});
```

For the concurrency assertion, create a fresh unique `concurrentSenderDomain` and two additional one-recipient batches, start both reservations with `Promise.all`, and assert exactly one is `CLAIMED` and one is `WAIT`. Do not reuse the domain whose throttle was advanced by the boundary assertions.

- [ ] **Step 2: Run the focused integration test and verify RED**

Run: `npm run test:integration`

Expected: FAIL because `reserveBulkMailRecipient` does not exist.

- [ ] **Step 3: Implement the atomic reservation**

Add these types and logic to `bulk-mail-throttle.ts`:

```ts
import type { Prisma } from "@/generated/prisma/client";

export type BulkMailReservation =
  | { status: "WAIT"; runAt: Date }
  | { status: "EMPTY" }
  | { status: "CLAIMED"; recipientId: string; runAt: Date };

export async function reserveBulkMailRecipient(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    senderDomain: string;
    now: Date;
    random?: () => number;
  }
): Promise<BulkMailReservation> {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${input.senderDomain}, 0)
    )
  `;
  const throttle = await tx.mailDomainThrottle.upsert({
    where: { senderDomain: input.senderDomain },
    create: {
      senderDomain: input.senderDomain,
      nextAvailableAt: input.now
    },
    update: {}
  });
  if (throttle.nextAvailableAt > input.now) {
    return { status: "WAIT", runAt: throttle.nextAvailableAt };
  }
  const recipient = await tx.mailBatchRecipient.findFirst({
    where: { batchId: input.batchId, status: "PENDING" },
    orderBy: { id: "asc" },
    select: { id: true }
  });
  if (!recipient) return { status: "EMPTY" };

  const claimed = await tx.mailBatchRecipient.updateMany({
    where: { id: recipient.id, status: "PENDING" },
    data: {
      status: "SENDING",
      claimedAt: input.now,
      lastAttemptAt: input.now,
      attempts: { increment: 1 }
    }
  });
  if (claimed.count !== 1) return { status: "EMPTY" };

  const runAt = new Date(
    input.now.getTime() + randomBulkMailDelayMs(input.random)
  );
  await tx.mailDomainThrottle.update({
    where: { senderDomain: input.senderDomain },
    data: { nextAvailableAt: runAt }
  });
  return { status: "CLAIMED", recipientId: recipient.id, runAt };
}
```

- [ ] **Step 4: Run the focused integration test and verify GREEN**

Run: `npm run test:integration`

Expected: same-domain serialization, cross-domain independence, and 120/240-second boundaries pass.

- [ ] **Step 5: Commit atomic reservation**

```bash
git add src/modules/mail/bulk-mail-throttle.ts tests/integration/mail/mail-domain-throttle.test.ts
git commit -m "feat(recall): reserve global bulk mail domain slots"
```

---

### Task 5: Send one recipient per reserved domain slot

**Files:**
- Modify: `src/modules/mail/process-mail-batch.ts`
- Modify: `src/worker/handlers/mail-batch.ts`
- Modify: `tests/integration/mail/mail-batch-delivery.test.ts`
- Modify: `tests/integration/mail/reviewed-send.test.ts`
- Modify: `tests/integration/mail/thread-reply.test.ts`
- Modify: `tests/unit/worker/mail-batch.test.ts`

**Interfaces:**
- Changes `MailBatchDeliveryDependencies` to include optional `random?: () => number`
- Removes the `batchSize` argument from `processMailBatch` and `handleMailBatch`
- Consumes `senderDomainFromAddress` and `reserveBulkMailRecipient`
- Schedules unfinished or blocked batches with `{ batchId, runAt }`

- [ ] **Step 1: Rewrite the delivery integration expectation for one recipient per run**

Use two pending recipients in one batch and a scheduler spy. At `10:00`, fixed random `0` must send only the first recipient and schedule the batch for `10:02`. A direct call at `10:01` must send nothing and preserve the `10:02` schedule. A call at `10:02` with a rejecting adapter must attempt only the second recipient, mark it failed, and still advance the domain throttle to `10:04`.

```ts
expect(adapter.send).toHaveBeenCalledTimes(1);
expect(scheduled.at(-1)).toEqual({
  batchId,
  runAt: new Date("2026-07-30T10:02:00.000Z")
});

await handleMailBatch(
  { batchId },
  new Date("2026-07-30T10:01:00.000Z"),
  scheduler,
  { adapter, random: () => 0 }
);
expect(adapter.send).toHaveBeenCalledTimes(1);

await handleMailBatch(
  { batchId },
  new Date("2026-07-30T10:02:00.000Z"),
  scheduler,
  { adapter: rejectingAdapter, random: () => 0 }
);
expect(rejectingAdapter.send).toHaveBeenCalledTimes(1);
await expect(
  prisma.mailDomainThrottle.findUniqueOrThrow({
    where: { senderDomain }
  })
).resolves.toMatchObject({
  nextAvailableAt: new Date("2026-07-30T10:04:00.000Z")
});
```

- [ ] **Step 2: Update the worker unit test to expect the dependency object without `batchSize`**

```ts
expect(mocks.processMailBatch).toHaveBeenCalledWith(
  { batchId: "batch-1" },
  now,
  scheduler,
  { adapter }
);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm test -- tests/unit/worker/mail-batch.test.ts`

Run: `npm run test:integration`

Expected: FAIL because the current processor sends up to 25 recipients immediately and does not schedule `runAt`.

- [ ] **Step 4: Refactor delivery to consume an already-claimed recipient**

In `process-mail-batch.ts`, replace the initial `PENDING` claim inside `processMailBatchRecipient` with a private `deliverClaimedMailBatchRecipient` that requires the row to already be `SENDING`. Keep all current suppression, source-deletion, reviewed-send, success, skipped, failed, message-linking, and task-linking logic unchanged.

- [ ] **Step 5: Reserve one slot and schedule the next durable run**

In `processMailBatch`:

```ts
const batch = await prisma.mailBatch.findUniqueOrThrow({
  where: { id: input.batchId },
  select: {
    mailbox: { select: { emailAddress: true } }
  }
});
const senderDomain = senderDomainFromAddress(
  batch.mailbox.emailAddress
);
const reservation = await prisma.$transaction((tx) =>
  reserveBulkMailRecipient(tx, {
    batchId: input.batchId,
    senderDomain,
    now,
    random: dependencies.random
  })
);

if (reservation.status === "CLAIMED") {
  await deliverClaimedMailBatchRecipient(
    reservation.recipientId,
    now,
    dependencies
  );
}

// Recalculate counts and persist the existing aggregate batch status.
// WAIT never claims a recipient. CLAIMED advances the throttle before SMTP.
if (!completed) {
  await scheduler.scheduleMailBatch?.({
    batchId: input.batchId,
    runAt: nextRunAt
  });
}
```

Set `nextRunAt` to `reservation.runAt` for `WAIT` and `CLAIMED`. For the crash-recovery case where the reservation is `EMPTY` but counts still contain `SENDING` rows, query the earliest `claimedAt` and schedule at `claimedAt + 30 minutes`; this preserves the existing stale-claim recovery without creating an immediate hot loop. When `EMPTY` has no `SENDING` rows, counts resolve the batch as completed and no follow-up job is created. Remove `batchSize` from the processor and handler signatures so no caller can restore multi-recipient runs accidentally.

- [ ] **Step 6: Prove direct sends and replies do not touch the throttle**

In `reviewed-send.test.ts` and `thread-reply.test.ts`, give each describe block a unique sender domain, use it in the mailbox fixture, execute the existing direct send or reply, and assert:

```ts
await expect(
  prisma.mailDomainThrottle.findUnique({
    where: { senderDomain }
  })
).resolves.toBeNull();
```

The production direct-send and reply modules remain unchanged.

- [ ] **Step 7: Run focused unit tests and the integration suite and verify GREEN**

Run: `npm test -- tests/unit/mail/bulk-mail-throttle.test.ts tests/unit/worker/mail-batch.test.ts tests/unit/tasks/pg-task-scheduler.test.ts`

Run: `npm run test:integration`

Expected: one recipient per slot, delayed scheduling, failure consumption, manual retry, and worker delegation all pass.

- [ ] **Step 8: Commit paced batch delivery**

```bash
git add src/modules/mail/process-mail-batch.ts src/worker/handlers/mail-batch.ts tests/integration/mail/mail-batch-delivery.test.ts tests/integration/mail/reviewed-send.test.ts tests/integration/mail/thread-reply.test.ts tests/unit/worker/mail-batch.test.ts
git commit -m "feat(recall): pace bulk mail by sender domain"
```

---

### Task 6: Full regression and production verification

**Files:**
- Modify only files required to fix regressions found by verification

**Interfaces:**
- Verifies all prior task interfaces and the unchanged direct-send/reply paths

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: all unit test files pass, including the new delay and scheduler tests.

- [ ] **Step 2: Run all integration tests**

Run: `npm run test:integration`

Expected: all migrations deploy from an empty integration database and all integration tests pass.

- [ ] **Step 3: Run static checks sequentially**

Run: `npm run lint`

Run: `npm run build`

Run: `npm run typecheck`

Expected: lint, production build, and TypeScript checking each exit successfully. Do not run `build` and `typecheck` concurrently because both read generated Next.js types.

- [ ] **Step 4: Verify direct sends and replies remain outside the throttle**

Run: `npm run test:integration`

Expected: direct reviewed send and reply tests pass without creating or reading `MailDomainThrottle` rows.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors and only intentional task files remain.

- [ ] **Step 6: Commit any verification fixes**

If verification required a fix, stage the exact modified files listed by `git status --short` and commit them with `git commit -m "fix(recall): complete bulk mail throttle verification"`. Skip this commit when verification required no code changes.
