# 邮件分组与全员独立投递实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在邮件中心增加指定用户、指定分组和全部用户三种发送对象，并通过后台批次为每位收件人单独发送邮件。

**Architecture:** 单人发送继续使用现有 `/api/mail/send` 与 `sendReviewedMail`。分组和全员发送创建不可变 `MailBatchRecipient` 快照，通过 pg-boss 分批处理，每位用户仍调用单收件人发送核心，确保每次 SMTP 调用只有一个 `to`，并保留独立邮件、会话、任务和审计记录。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、Prisma 7/PostgreSQL、pg-boss 12、Zod 4、Vitest、Testing Library。

## Global Constraints

- 每封群发邮件的 `to` 数组必须只有当前收件人一个邮箱，不设置 `cc` 或 `bcc`。
- 分组一次只允许选择 F、A、B、C、D、E、G 中的一个分组。
- 全员只覆盖当前操作者权限范围内、`sourceDeletedAt` 为空的用户。
- 已退订、抑制名单、暂停联系、频率受限、无效邮箱和同批次重复邮箱必须逐人跳过，不能中断整批发送。
- 单人发送必须保持现有最终邮箱人工确认、关联任务、模板和图片能力。
- 浏览器不能提交或读取整批邮箱列表；服务端自行解析受众。
- 按用户要求，本轮只修改工作区，不执行 `git add`、`git commit` 或 `git push`。

---

### Task 1: 建立群发批次持久化模型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730190000_add_mail_batches/migration.sql`
- Generated: `src/generated/prisma/**`
- Test: `tests/integration/mail/mail-batch-schema.test.ts`

**Interfaces:**
- Produces enums `MailAudienceMode`, `MailBatchStatus`, `MailBatchRecipientStatus`.
- Produces models `MailBatch`, `MailBatchRecipient`, `MailBatchAsset`.
- `MailBatchRecipient.messageId` and `taskId` link a successful recipient to its individual send records.

- [x] **Step 1: Write the failing schema integration test**

```ts
it("stores one immutable recipient row per batch user", async () => {
  const batch = await prisma.mailBatch.create({
    data: {
      mailboxId,
      createdById: memberId,
      audienceMode: "SEGMENT",
      segment: "F",
      subject: "服务恢复说明",
      bodyText: "我们正在协助处理。",
      bodyHtml: "<p>我们正在协助处理。</p>",
      idempotencyKey: "schema-test-batch-1",
      recipients: {
        create: {
          userId,
          emailNormalized: userEmail
        }
      }
    },
    include: { recipients: true }
  });

  expect(batch).toMatchObject({
    audienceMode: "SEGMENT",
    status: "PENDING",
    totalRecipients: 0
  });
  expect(batch.recipients).toHaveLength(1);
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mail-batch-schema.test.ts`

Expected: FAIL because `prisma.mailBatch` and the generated batch types do not exist.

- [x] **Step 3: Add enums, models, relations and migration**

```prisma
enum MailAudienceMode {
  USER
  SEGMENT
  ALL
  @@schema("recall")
}

enum MailBatchStatus {
  PENDING
  RUNNING
  COMPLETED
  PARTIAL_FAILURE
  FAILED
  @@schema("recall")
}

enum MailBatchRecipientStatus {
  PENDING
  SENDING
  SENT
  SKIPPED
  FAILED
  @@schema("recall")
}

model MailBatch {
  id                String            @id @default(cuid())
  mailboxId         String
  createdById       String
  audienceMode      MailAudienceMode
  segment           SegmentCode?
  subject           String
  bodyText          String
  bodyHtml          String
  idempotencyKey    String            @unique
  status            MailBatchStatus   @default(PENDING)
  totalRecipients   Int               @default(0)
  pendingRecipients Int               @default(0)
  sentRecipients    Int               @default(0)
  skippedRecipients Int               @default(0)
  failedRecipients  Int               @default(0)
  startedAt         DateTime?
  completedAt       DateTime?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  mailbox           Mailbox           @relation(fields: [mailboxId], references: [id], onDelete: Restrict)
  createdBy         Member            @relation(fields: [createdById], references: [id], onDelete: Restrict)
  recipients        MailBatchRecipient[]
  assets            MailBatchAsset[]
  @@index([createdById, createdAt])
  @@index([status, createdAt])
  @@schema("recall")
}

model MailBatchRecipient {
  id              String                   @id @default(cuid())
  batchId         String
  userId          String
  emailNormalized String
  status          MailBatchRecipientStatus @default(PENDING)
  reasonCode      String?
  messageId       String?                  @unique
  taskId          String?
  attempts        Int                      @default(0)
  claimedAt       DateTime?
  lastAttemptAt   DateTime?
  completedAt     DateTime?
  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt
  batch           MailBatch                @relation(fields: [batchId], references: [id], onDelete: Cascade)
  user            UserProfile              @relation(fields: [userId], references: [id], onDelete: Restrict)
  message         MailMessage?             @relation(fields: [messageId], references: [id], onDelete: SetNull)
  task            RecallTask?              @relation(fields: [taskId], references: [id], onDelete: SetNull)
  @@unique([batchId, userId])
  @@index([batchId, status, id])
  @@schema("recall")
}

model MailBatchAsset {
  id          String               @id @default(cuid())
  batchId     String
  assetId     String
  disposition MailAssetDisposition
  sortOrder   Int                  @default(0)
  batch       MailBatch            @relation(fields: [batchId], references: [id], onDelete: Cascade)
  asset       MailAsset            @relation(fields: [assetId], references: [id], onDelete: Restrict)
  @@unique([batchId, assetId])
  @@schema("recall")
}
```

Add matching relation arrays to `Member`, `Mailbox`, `UserProfile`, `MailMessage`, `RecallTask`, and `MailAsset`, then write SQL that creates the three enums, three tables, foreign keys, unique constraints and indexes.

- [x] **Step 4: Regenerate Prisma and apply the local migration**

Run: `npx prisma generate`

Expected: generated client exposes `prisma.mailBatch`, `prisma.mailBatchRecipient`, and `prisma.mailBatchAsset`.

Run: `npm run db:migrate`

Expected: migration `20260730190000_add_mail_batches` is applied successfully.

- [x] **Step 5: Run the schema test and verify GREEN**

Run: `npm run test:integration -- tests/integration/mail/mail-batch-schema.test.ts`

Expected: PASS with recipient defaults and relations persisted.

---

### Task 2: 实现受众校验、权限范围和安全预览

**Files:**
- Create: `src/modules/mail/batch-schema.ts`
- Create: `src/modules/mail/mail-audience.ts`
- Create: `src/app/api/mail/audience-preview/route.ts`
- Test: `tests/unit/mail/batch-schema.test.ts`
- Test: `tests/integration/mail/mail-audience.test.ts`
- Test: `tests/unit/api/mail-audience-preview-route.test.ts`

**Interfaces:**
- Produces `mailBatchRequestSchema`.
- Produces `MailBatchAudience = { mode: "SEGMENT"; segment: SegmentCode } | { mode: "ALL" }`.
- Produces `previewMailAudience(viewer, audience): Promise<{ label: string; total: number; estimatedSkipped: number }>` without email addresses.
- Produces `findMailAudienceUsers(tx, viewer, audience)` for snapshot creation.

- [x] **Step 1: Write failing request-schema tests**

```ts
expect(mailBatchRequestSchema.safeParse({
  mode: "SEGMENT",
  segment: "F",
  mailboxId: "mailbox-1",
  subject: "主题",
  bodyText: "正文",
  bodyHtml: "<p>正文</p>",
  assets: []
}).success).toBe(true);

expect(mailBatchRequestSchema.safeParse({
  mode: "ALL",
  segment: "F",
  mailboxId: "mailbox-1",
  subject: "主题",
  bodyText: "正文"
}).success).toBe(false);
```

- [x] **Step 2: Run the unit test and verify RED**

Run: `npx vitest run tests/unit/mail/batch-schema.test.ts`

Expected: FAIL because `mailBatchRequestSchema` does not exist.

- [x] **Step 3: Implement the discriminated request schema**

```ts
const content = z.object({
  mailboxId: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  bodyText: z.string().trim().min(1).max(100_000),
  bodyHtml: z.string().trim().max(200_000).default(""),
  assets: z.array(mailAssetReferenceSchema).max(10).default([])
});

export const mailBatchRequestSchema = z.discriminatedUnion("mode", [
  content.extend({
    mode: z.literal("SEGMENT"),
    segment: z.enum(["F", "A", "B", "C", "D", "E", "G"])
  }).strict(),
  content.extend({ mode: z.literal("ALL") }).strict()
]);
```

- [x] **Step 4: Write failing audience integration tests**

Create users owned by the operator, unowned, owned by another operator, source-deleted, and in different segments. Assert that:

```ts
const preview = await previewMailAudience(
  { id: operatorId, role: "OPERATOR" },
  { mode: "SEGMENT", segment: "F" }
);
expect(preview).toEqual({
  label: "F 组全员",
  total: 2,
  estimatedSkipped: 1
});
expect(Object.keys(preview)).not.toContain("emails");
```

- [x] **Step 5: Run the audience test and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mail-audience.test.ts`

Expected: FAIL because the audience query module does not exist.

- [x] **Step 6: Implement shared permission scope, preview and row resolution**

```ts
export type MailAudienceViewer = {
  id: string;
  role: MemberRole;
};

export type MailBatchAudience =
  | { mode: "SEGMENT"; segment: SegmentCode }
  | { mode: "ALL" };

export function mailAudienceUserWhere(
  viewer: MailAudienceViewer,
  audience: MailBatchAudience
): Prisma.UserProfileWhereInput {
  return {
    sourceDeletedAt: null,
    ...(audience.mode === "SEGMENT"
      ? { currentSegment: audience.segment }
      : {}),
    ...(viewer.role === "OPERATOR"
      ? { OR: [{ ownerId: viewer.id }, { ownerId: null }] }
      : {})
  };
}
```

`previewMailAudience` must count all resolved rows, estimate rows already unsubscribed, paused, invalid, suppressed or duplicate, and return counts only. `findMailAudienceUsers` must return stable `id` order with `id`, `email`, `emailNormalized`, `unsubscribedAt`, `pausedAt`.

- [x] **Step 7: Add and test the preview route**

The route must require `mail:send-reviewed`, accept only `SEGMENT` plus a valid segment or `ALL`, and return:

```json
{
  "label": "F 组全员",
  "total": 12,
  "estimatedSkipped": 2
}
```

Run: `npx vitest run tests/unit/api/mail-audience-preview-route.test.ts`

Expected: PASS for authorized inputs, 400 for invalid inputs, and no email fields in the response.

---

### Task 3: 创建不可变批次和收件人快照

**Files:**
- Create: `src/modules/mail/create-mail-batch.ts`
- Modify: `src/modules/tasks/scheduler.ts`
- Modify: `src/modules/tasks/pg-task-scheduler.ts`
- Modify: `src/worker/job-names.ts`
- Create: `src/app/api/mail/batches/route.ts`
- Test: `tests/integration/mail/create-mail-batch.test.ts`
- Test: `tests/unit/api/mail-batches-route.test.ts`

**Interfaces:**
- Adds `TaskScheduler.scheduleMailBatch?(input: { batchId: string }): Promise<void>`.
- Produces `createMailBatch(input): Promise<MailBatch>`.
- `POST /api/mail/batches` returns batch ID and initial summary only.

- [x] **Step 1: Write the failing batch-creation integration test**

```ts
const scheduled: string[] = [];
const batch = await createMailBatch({
  actorId,
  audience: { mode: "SEGMENT", segment: "F" },
  mailboxId,
  subject: "服务提醒",
  bodyText: "请查看说明。",
  bodyHtml: "<p>请查看说明。</p>",
  assets: [],
  idempotencyKey: "batch-create-1",
  scheduler: {
    async scheduleSegmentCheck() {},
    async scheduleMailBatch({ batchId }) {
      scheduled.push(batchId);
    }
  }
});

expect(batch).toMatchObject({
  audienceMode: "SEGMENT",
  segment: "F",
  totalRecipients: 3,
  pendingRecipients: 2,
  skippedRecipients: 1
});
expect(scheduled).toEqual([batch.id]);
```

- [x] **Step 2: Run the integration test and verify RED**

Run: `npm run test:integration -- tests/integration/mail/create-mail-batch.test.ts`

Expected: FAIL because `createMailBatch` and `scheduleMailBatch` do not exist.

- [x] **Step 3: Implement transactional batch creation**

`createMailBatch` must:

1. load active actor and assert `mail:send-reviewed`;
2. load enabled mailbox;
3. call `resolveOutboundMailAssets` once to validate HTML and assets before inserting the batch;
4. resolve users server-side with `findMailAudienceUsers`;
5. reject an empty audience;
6. normalize emails and mark invalid, unsubscribed, paused, suppressed, and duplicate rows as `SKIPPED` with safe codes;
7. insert batch, assets and every user row in one transaction;
8. set counts from inserted recipient statuses;
9. write audit action `mail.batch_created` without any full email;
10. schedule `JOBS.MAIL_BATCH` after commit with singleton key equal to the batch ID.

Use this signature:

```ts
export type CreateMailBatchInput = {
  actorId: string;
  mailboxId: string;
  audience: MailBatchAudience;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  assets: OutboundAssetReference[];
  idempotencyKey: string;
  scheduler: TaskScheduler;
  now?: Date;
};
```

Use the `MailBatch.idempotencyKey` unique field created in Task 1 so browser retries return the existing batch and do not recreate recipients.

- [x] **Step 4: Extend pg-boss scheduling**

```ts
MAIL_BATCH: "mail-batch"
```

```ts
async scheduleMailBatch(
  input: { batchId: string }
): Promise<void> {
  await this.boss.upsert(JOBS.MAIL_BATCH, input, {
    singletonKey: input.batchId
  });
}
```

- [x] **Step 5: Implement and test POST `/api/mail/batches`**

The route must require same-origin, `mail:send-reviewed`, a non-empty `idempotency-key`, parse `mailBatchRequestSchema`, and call `createMailBatch` with `getRuntimeTaskScheduler()`.

Run: `npx vitest run tests/unit/api/mail-batches-route.test.ts`

Expected: PASS for one created batch, 400 for invalid requests, 401/403 for auth failures, and no recipient emails in the JSON response.

- [x] **Step 6: Re-run batch creation integration test and verify GREEN**

Run: `npm run test:integration -- tests/integration/mail/create-mail-batch.test.ts`

Expected: PASS for permission scope, snapshot counts, duplicate-email skip, asset validation and idempotent resubmission.

---

### Task 4: 后台逐人独立投递

**Files:**
- Modify: `src/modules/mail/send-reviewed-mail.ts`
- Create: `src/modules/mail/process-mail-batch.ts`
- Create: `src/worker/handlers/mail-batch.ts`
- Modify: `src/worker/register-handlers.ts`
- Test: `tests/integration/mail/mail-batch-delivery.test.ts`
- Test: `tests/unit/worker/mail-batch.test.ts`

**Interfaces:**
- Extends `ReviewedMailInput` with optional `authorizationScope?: "CURRENT" | "BATCH_SNAPSHOT"` and `batchRecipientId?: string`.
- Produces `processMailBatchRecipient(recipientId, adapter, dependencies)`.
- Produces `handleMailBatch({ batchId }, now, scheduler, dependencies)`.

- [x] **Step 1: Write the failing privacy and isolation integration test**

Create a batch with two pending recipients and one skipped recipient. Use an adapter whose first call succeeds and second call throws. Assert:

```ts
expect(adapter.send).toHaveBeenNthCalledWith(
  1,
  expect.objectContaining({ to: [firstEmail] })
);
expect(adapter.send).toHaveBeenNthCalledWith(
  2,
  expect.objectContaining({ to: [secondEmail] })
);
for (const [message] of adapter.send.mock.calls) {
  expect(message.to).toHaveLength(1);
  expect(message).not.toHaveProperty("cc");
  expect(message).not.toHaveProperty("bcc");
}
expect(await recipientStatuses(batchId)).toEqual([
  "SENT",
  "FAILED",
  "SKIPPED"
]);
```

- [x] **Step 2: Run the delivery test and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mail-batch-delivery.test.ts`

Expected: FAIL because no batch processor exists.

- [x] **Step 3: Make single-send safe for a fixed authorized snapshot**

Keep `authorizationScope` defaulting to `CURRENT`. Only when it is `BATCH_SNAPSHOT` and `batchRecipientId` belongs to the same actor-created batch/user may the existing operator-owner check use the snapshot authorization. Actor active status, mail permission, suppression, pause, source deletion and frequency guard remain enforced at delivery time.

When `batchRecipientId` is provided, save the returned `MailMessage.id` and task ID on that recipient in the same final transaction used to mark the message sent.

- [x] **Step 4: Implement recipient claiming and outcome classification**

`processMailBatchRecipient` must atomically transition exactly one `PENDING` row to `SENDING`, increment attempts, and then:

- call `sendReviewedMail` with exactly one recipient;
- mark success `SENT`;
- map `MailSendBlockedError` to `SKIPPED`;
- map SMTP/provider errors to `FAILED`;
- never place full email in `reasonCode`, logs or audit metadata.

Safe reason codes are:

```ts
type MailBatchRecipientReason =
  | "RECIPIENT_SUPPRESSED"
  | "RECIPIENT_PAUSED"
  | "CONTACT_FREQUENCY_LIMIT"
  | "INVALID_RECIPIENT"
  | "DUPLICATE_RECIPIENT"
  | "SOURCE_USER_DELETED"
  | "SMTP_SEND_FAILED"
  | "BATCH_CREATOR_UNAVAILABLE";
```

- [x] **Step 5: Implement bounded worker processing**

```ts
export type MailBatchJobInput = { batchId: string };

export declare function handleMailBatch(
  input: MailBatchJobInput,
  now: Date,
  scheduler: TaskScheduler,
  dependencies: MailBatchDeliveryDependencies,
  batchSize?: number
): Promise<{
  completed: boolean;
  sent: number;
  skipped: number;
  failed: number;
}>;
```

After each bounded run:

- derive batch counters from recipient statuses;
- set `COMPLETED` if no failed rows remain;
- set `PARTIAL_FAILURE` when processing is finished with failures;
- set `RUNNING` and reschedule the same batch when pending rows remain;
- never automatically reclaim `SENDING` rows whose SMTP outcome is unknown; mark stale rows `FAILED` with `SMTP_SEND_FAILED` for explicit operator review.

- [x] **Step 6: Register the pg-boss worker and verify GREEN**

Register `JOBS.MAIL_BATCH` in `registerHandlers`, load the batch mailbox config, create its SMTP adapter, and call `handleMailBatch`.

Run: `npm run test:integration -- tests/integration/mail/mail-batch-delivery.test.ts`

Expected: PASS with separate calls, separate messages/tasks, independent failure, accurate counters and no duplicate successful delivery on job retry.

Run: `npx vitest run tests/unit/worker/mail-batch.test.ts`

Expected: PASS for empty jobs, bounded rescheduling and singleton job data.

---

### Task 5: 批次查询、失败重试和邮件中心数据

**Files:**
- Create: `src/modules/mail/mail-batch-query.ts`
- Create: `src/modules/mail/retry-mail-batch.ts`
- Create: `src/app/api/mail/batches/[id]/route.ts`
- Create: `src/app/api/mail/batches/[id]/retry/route.ts`
- Modify: `src/modules/mail/workspace-query.ts`
- Test: `tests/integration/mail/mail-batch-query.test.ts`
- Test: `tests/integration/mail/retry-mail-batch.test.ts`
- Test: `tests/unit/api/mail-batch-routes.test.ts`

**Interfaces:**
- Produces `listMailBatches(viewer)` and `getMailBatchSummary(viewer, id)`.
- Produces `retryMailBatch({ actorId, batchId, scheduler })`.
- Extends `MailWorkspaceData` with `mailBatches`.

- [x] **Step 1: Write failing query privacy tests**

```ts
const summary = await getMailBatchSummary(viewer, batchId);
expect(summary).toMatchObject({
  id: batchId,
  audienceLabel: "F 组全员",
  totalRecipients: 3,
  sentRecipients: 1,
  skippedRecipients: 1,
  failedRecipients: 1,
  reasons: [
    { code: "RECIPIENT_PAUSED", count: 1 },
    { code: "SMTP_SEND_FAILED", count: 1 }
  ]
});
expect(JSON.stringify(summary)).not.toContain("@example.test");
```

- [x] **Step 2: Run query tests and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mail-batch-query.test.ts`

Expected: FAIL because the query module does not exist.

- [x] **Step 3: Implement permission-scoped summaries**

Admins can view all batches. Operators can view only batches they created. Return subject, audience label, counts, safe reason-code aggregates and timestamps; never return `emailNormalized` or recipient rows.

- [x] **Step 4: Write failing retry tests**

Create `SENT`, `SKIPPED` and `FAILED` rows, then assert:

```ts
await retryMailBatch({ actorId, batchId, scheduler });
expect(await statuses(batchId)).toEqual([
  "SENT",
  "SKIPPED",
  "PENDING"
]);
expect(scheduled).toEqual([batchId]);
```

- [x] **Step 5: Implement explicit failed-only retry**

Only the batch creator, admin or primary admin with `mail:send-reviewed` may retry. Update only `FAILED` rows to `PENDING`, clear their failure code and claim timestamps, recalculate counts, set the batch to `PENDING`, audit `mail.batch_retried`, and schedule the batch once. Never reset `SENT` or `SKIPPED`.

- [x] **Step 6: Add GET detail, POST retry routes and workspace data**

`GET /api/mail/batches/:id` returns the safe summary. `POST /api/mail/batches/:id/retry` requires same-origin and returns updated counts. Add `mailBatches: await listMailBatches(viewer)` to `getMailWorkspaceData`.

Run: `npx vitest run tests/unit/api/mail-batch-routes.test.ts`

Expected: PASS for authorization, privacy and failed-only retry.

Run: `npm run test:integration -- tests/integration/mail/retry-mail-batch.test.ts tests/integration/mail/mail-batch-query.test.ts`

Expected: PASS with accurate state transitions and no emails in summaries.

---

### Task 6: 增加三种发送对象和群发进度界面

**Files:**
- Modify: `src/components/mail/mail-composer.tsx`
- Create: `src/components/mail/mail-batch-list.tsx`
- Modify: `src/app/(dashboard)/mail/page.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `tests/unit/components/mail-composer.test.tsx`
- Create: `tests/unit/components/mail-batch-list.test.tsx`
- Modify: `tests/e2e/mail-images-workflow.spec.ts`

**Interfaces:**
- `MailComposer` receives the existing single-user props and submits group/all mail to `/api/mail/batches`.
- `MailBatchList` receives safe summary objects only and can invoke the retry endpoint.

- [x] **Step 1: Write failing composer mode tests**

```tsx
expect(screen.getByRole("radio", {
  name: "指定用户"
})).toBeChecked();

fireEvent.click(screen.getByRole("radio", {
  name: "指定分组"
}));
expect(screen.getByLabelText("选择分组")).toBeInTheDocument();
expect(screen.queryByLabelText("最终收件人")).not.toBeInTheDocument();
expect(screen.getByText(
  "每位用户将收到独立邮件，无法看到其他收件人邮箱"
)).toBeInTheDocument();
```

For `ALL`, assert a preview fetch, a batch POST body without user IDs or email addresses, and button text `确认创建群发`.

- [x] **Step 2: Run component tests and verify RED**

Run: `npx vitest run tests/unit/components/mail-composer.test.tsx`

Expected: FAIL because audience controls and batch submission do not exist.

- [x] **Step 3: Implement mode-specific composer state**

Add:

```ts
type AudienceMode = "USER" | "SEGMENT" | "ALL";
const segmentOptions = ["F", "A", "B", "C", "D", "E", "G"] as const;
```

For `USER`, preserve the current form and `/api/mail/send` body. For `SEGMENT` or `ALL`:

- debounce a preview request when mode/segment changes;
- render only counts and privacy copy;
- generate one `crypto.randomUUID()` idempotency key per submit attempt;
- POST content and audience selector to `/api/mail/batches`;
- show `群发任务已创建，可在下方查看进度`;
- disable submission while preview is loading, audience is empty, content is unresolved, mailbox is missing or content is blank.

- [x] **Step 4: Write and implement batch-list tests**

Test that the list renders audience, subject, status and four counts without any email. Show `重试失败项` only when `failedRecipients > 0`; clicking it POSTs to `/api/mail/batches/:id/retry` and refreshes the page.

Run: `npx vitest run tests/unit/components/mail-batch-list.test.tsx`

Expected: PASS.

- [x] **Step 5: Integrate the batch list into the mail page**

Render `<MailBatchList batches={data.mailBatches} />` beneath the composer and above mail statistics. Add two-row audience controls, count cards, privacy notice and responsive styles without changing the existing mail workbench layout.

- [x] **Step 6: Add browser workflow coverage**

Extend the mail workflow to select `指定分组`, choose `F`, verify preview text, submit a mocked batch request, and confirm that the request contains:

```json
{
  "mode": "SEGMENT",
  "segment": "F"
}
```

and does not contain `recipient`, `userId`, or any email list.

Run: `npx playwright test tests/e2e/mail-images-workflow.spec.ts`

Expected: PASS for existing images/template/reply flows and the new group audience flow.

---

### Task 7: 完整验证与 localhost 验收

**Files:**
- Verify all files changed in Tasks 1–6.

**Interfaces:**
- No new interfaces; this task validates the completed feature against the approved specification.

- [x] **Step 1: Run focused mail tests**

Run:

```bash
npx vitest run \
  tests/unit/mail/batch-schema.test.ts \
  tests/unit/components/mail-composer.test.tsx \
  tests/unit/components/mail-batch-list.test.tsx \
  tests/unit/api/mail-audience-preview-route.test.ts \
  tests/unit/api/mail-batches-route.test.ts \
  tests/unit/api/mail-batch-routes.test.ts
```

Expected: all focused unit tests PASS.

Run:

```bash
npm run test:integration -- \
  tests/integration/mail/mail-batch-schema.test.ts \
  tests/integration/mail/mail-audience.test.ts \
  tests/integration/mail/create-mail-batch.test.ts \
  tests/integration/mail/mail-batch-delivery.test.ts \
  tests/integration/mail/mail-batch-query.test.ts \
  tests/integration/mail/retry-mail-batch.test.ts
```

Expected: all focused integration tests PASS.

- [x] **Step 2: Run full regression checks**

Run:

```bash
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
npm run worker:build
git diff --check
```

Expected: every command exits with code 0.

- [ ] **Step 3: Apply migration and run local worker**

Run:

```bash
npm run db:migrate
npm run worker
```

Expected: the migration is current and the worker registers `mail-batch` without startup errors.

- [ ] **Step 4: Verify privacy and progress in localhost**

At `http://localhost:3000/mail?view=replies&compose=1`:

1. confirm all three audience modes are visible;
2. choose F and confirm preview count;
3. create a safe local test batch using test recipients only;
4. confirm the batch shows pending/sent/skipped/failed counters;
5. inspect captured adapter calls or local test mailbox and confirm every message has one `To` recipient and no CC/BCC;
6. confirm the sent-mail view shows one recipient per message;
7. restore any temporary local test data.

- [x] **Step 5: Review final diff without committing**

Run:

```bash
git status --short --branch
git diff --stat
git diff --check
```

Expected: only intended feature files plus the previously existing uncommitted F-group work appear; no file is staged, committed or pushed.
