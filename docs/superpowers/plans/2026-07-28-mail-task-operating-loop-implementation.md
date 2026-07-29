# Mail and Task Operating Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore proactive email, replace opaque mailbox failures with actionable diagnostics, and connect task handling, outbound mail, inbound replies, and task completion into one auditable workflow.

**Architecture:** Keep `/mail` as the single mail workspace and open its composer with query parameters for task- and user-scoped entry points. Move send authorization and optional manual-task creation into the server service so every entry point shares the same permission, suppression, frequency, and audit rules. Introduce a safe mail-sync error taxonomy at the adapter boundary, persist only stable codes, and log diagnostic context without credentials or message bodies.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma/PostgreSQL, ImapFlow, Nodemailer integration, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Frontend copy must use operational Chinese and must never render internal codes such as `MAIL_SYNC_FAILED`.
- Never log mailbox passwords, encrypted configuration, authentication payloads, complete email bodies, or image contents.
- A proactive message must be associated with a RightToken user; an existing task is optional because the server can create a `MANUAL` task.
- Operators may only contact users they own or tasks assigned to them; admins and the primary admin keep global scope.
- Recipient editing remains allowed, but suppression checks cover both the selected user's canonical email and the final recipient.
- Sending success moves the associated task to `WAITING_USER`.
- An inbound reply reopens the matching waiting task before creating a new `EMAIL_REPLY` task.
- All behavior changes use failing tests first and are committed in independently reviewable slices.

---

## File Structure

### New files

- `recall-admin/src/modules/mail/sync-error.ts` — stable mail-sync codes, safe classification, and Chinese status text.
- `recall-admin/src/components/mail/mailbox-status-detail.tsx` — mailbox state, timestamps, recovery actions, and operational explanations.
- `recall-admin/src/app/api/mail/compose-context/route.ts` — permission-scoped user search and initial compose context.
- `recall-admin/src/modules/mail/compose-context.ts` — reusable user/task lookup with operator scoping.
- `recall-admin/src/modules/mail/compose-link.ts` — deterministic `/mail?compose=1` link construction.
- `recall-admin/tests/unit/mail/sync-error.test.ts` — classification and copy tests.
- `recall-admin/tests/unit/components/mailbox-status-detail.test.tsx` — mailbox detail rendering and retry tests.
- `recall-admin/tests/unit/mail/compose-link.test.ts` — query-link encoding tests.
- `recall-admin/tests/integration/mail/compose-context.test.ts` — operator/admin search scope tests.

### Existing files to modify

- `recall-admin/src/modules/mail/adapters/smtp-imap.ts` — classify connection stages and skip/log individual malformed messages.
- `recall-admin/src/worker/handlers/mail-sync.ts` — persist classified errors and emit safe diagnostics.
- `recall-admin/src/app/api/mail/sync/route.ts` — return classified codes and persist failure state for manual sync.
- `recall-admin/src/app/api/integrations/mailboxes/[id]/test/route.ts` — use the same classification.
- `recall-admin/src/modules/mail/workspace-query.ts` — translate mailbox rows and load selected mailbox detail.
- `recall-admin/src/components/mail/mail-conversation-list.tsx` — render operational status instead of internal codes.
- `recall-admin/src/components/mail/mail-workbench.tsx` — display mailbox detail and the unified composer.
- `recall-admin/src/app/(dashboard)/mail/page.tsx` — add “写邮件”, preserve compose query state, and pass initial context.
- `recall-admin/src/modules/mail/workspace-filter.ts` — parse `compose`, `userId`, and `taskId`.
- `recall-admin/src/components/mail/mail-composer.tsx` — user search, optional task, templates, editable recipient, and task-aware success.
- `recall-admin/src/modules/mail/send-request-schema.ts` — accept `userId` plus optional `taskId`.
- `recall-admin/src/modules/mail/send-reviewed-mail.ts` — validate user scope, create a manual task when needed, send, audit, and transition to waiting.
- `recall-admin/src/app/api/mail/send/route.ts` — pass the expanded request to the service.
- `recall-admin/src/modules/mail/sync-mailbox.ts` — reopen the original waiting task on reply.
- `recall-admin/src/components/tables/task-table.tsx` — make the email a compose link.
- `recall-admin/src/app/(dashboard)/tasks/[id]/page.tsx` — add “联系用户”, make email clickable, and remove obsolete placeholder copy.
- `recall-admin/src/components/tasks/task-actions.tsx` — show task-state actions with contact as the primary in-progress action.
- `recall-admin/src/components/workspaces/workspace.module.css` — compact composer drawer/panel, mailbox health, and task action styles.

---

### Task 1: Safe Mail-Sync Error Taxonomy

**Files:**
- Create: `recall-admin/src/modules/mail/sync-error.ts`
- Create: `recall-admin/tests/unit/mail/sync-error.test.ts`

**Interfaces:**
- Produces: `MailSyncErrorCode`, `classifyMailSyncError(error: unknown): MailSyncErrorCode`, `mailSyncStatusText(code: string | null): string`.
- Consumed by: worker sync, manual sync route, connection-test route, workspace query, and mailbox detail.

- [ ] **Step 1: Write the failing classification tests**

```ts
import { describe, expect, it } from "vitest";
import {
  classifyMailSyncError,
  mailSyncStatusText
} from "@/modules/mail/sync-error";

describe("mail sync error classification", () => {
  it.each([
    [{ authenticationFailed: true }, "IMAP_AUTH_FAILED"],
    [Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }), "IMAP_CONNECTION_TIMEOUT"],
    [Object.assign(new Error("certificate"), { code: "CERT_HAS_EXPIRED" }), "IMAP_TLS_FAILED"],
    [Object.assign(new Error("mailbox missing"), { code: "IMAP_FOLDER_FAILED" }), "IMAP_FOLDER_FAILED"]
  ])("classifies %o as %s", (error, expected) => {
    expect(classifyMailSyncError(error)).toBe(expected);
  });

  it("uses a safe fallback and operational Chinese copy", () => {
    expect(classifyMailSyncError(new Error("unknown"))).toBe(
      "MAIL_SYNC_FAILED"
    );
    expect(mailSyncStatusText("MAIL_SYNC_FAILED")).toBe(
      "邮箱同步未完成，请重新测试连接"
    );
    expect(mailSyncStatusText(null)).toBe("同步正常");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
npm test -- --run tests/unit/mail/sync-error.test.ts
```

Expected: FAIL because `@/modules/mail/sync-error` does not exist.

- [ ] **Step 3: Implement the stable classifier and copy map**

```ts
export const mailSyncErrorCodes = [
  "IMAP_AUTH_FAILED",
  "IMAP_CONNECTION_TIMEOUT",
  "IMAP_TLS_FAILED",
  "IMAP_FOLDER_FAILED",
  "IMAP_MESSAGE_PARSE_FAILED",
  "MAIL_SYNC_PROCESSING_FAILED",
  "MAIL_SYNC_FAILED"
] as const;

export type MailSyncErrorCode =
  (typeof mailSyncErrorCodes)[number];

const copy: Record<MailSyncErrorCode, string> = {
  IMAP_AUTH_FAILED: "邮箱账号、密码或授权未通过",
  IMAP_CONNECTION_TIMEOUT: "连接邮箱服务器超时",
  IMAP_TLS_FAILED: "邮箱安全连接失败",
  IMAP_FOLDER_FAILED: "无法读取收件箱",
  IMAP_MESSAGE_PARSE_FAILED: "部分邮件内容无法处理",
  MAIL_SYNC_PROCESSING_FAILED: "邮件保存或任务处理未完成",
  MAIL_SYNC_FAILED: "邮箱同步未完成，请重新测试连接"
};

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = Reflect.get(error, "code");
  return typeof value === "string" ? value.toUpperCase() : "";
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.toUpperCase();
  return "";
}

export function classifyMailSyncError(
  error: unknown
): MailSyncErrorCode {
  const code = errorCode(error);
  const text = errorText(error);
  if (
    Reflect.get((error ?? {}) as object, "authenticationFailed") === true ||
    code.includes("AUTH") ||
    text.includes("AUTHENTICATION")
  ) return "IMAP_AUTH_FAILED";
  if (code === "ETIMEDOUT" || text.includes("TIMEOUT"))
    return "IMAP_CONNECTION_TIMEOUT";
  if (
    code.includes("CERT") ||
    code.includes("TLS") ||
    text.includes("CERTIFICATE")
  ) return "IMAP_TLS_FAILED";
  if (code === "IMAP_FOLDER_FAILED")
    return "IMAP_FOLDER_FAILED";
  if (code === "IMAP_MESSAGE_PARSE_FAILED")
    return "IMAP_MESSAGE_PARSE_FAILED";
  if (code === "MAIL_SYNC_PROCESSING_FAILED")
    return "MAIL_SYNC_PROCESSING_FAILED";
  return "MAIL_SYNC_FAILED";
}

export function mailSyncStatusText(code: string | null): string {
  if (!code) return "同步正常";
  return copy[code as MailSyncErrorCode] ??
    "邮箱同步未完成，请重新测试连接";
}
```

- [ ] **Step 4: Run the unit test**

Run:

```bash
npm test -- --run tests/unit/mail/sync-error.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the classifier**

```bash
git add recall-admin/src/modules/mail/sync-error.ts recall-admin/tests/unit/mail/sync-error.test.ts
git commit -m "feat: classify mailbox sync failures"
```

---

### Task 2: Persist Actionable Failures and Keep Syncing After a Malformed Message

**Files:**
- Modify: `recall-admin/src/modules/mail/adapters/smtp-imap.ts`
- Modify: `recall-admin/src/worker/handlers/mail-sync.ts`
- Modify: `recall-admin/src/app/api/mail/sync/route.ts`
- Modify: `recall-admin/src/app/api/integrations/mailboxes/[id]/test/route.ts`
- Modify: `recall-admin/tests/integration/worker/mail-sync.test.ts`
- Test: `recall-admin/tests/unit/mail/smtp-imap-adapter.test.ts`

**Interfaces:**
- Consumes: `classifyMailSyncError`.
- Produces: persisted stable mailbox error codes and safe server log events with `{ mailboxId, stage, code }`.

- [ ] **Step 1: Add a failing worker test for classified persistence**

Add this test to `tests/integration/worker/mail-sync.test.ts`:

```ts
it("stores a classified failure without exposing the provider message", async () => {
  const mailbox = await prisma.mailbox.create({
    data: {
      name: "失败测试邮箱",
      emailAddress: `failed-${randomUUID()}@righttoken.test`,
      encryptedConfig: "encrypted-test-value",
      enabled: true
    }
  });
  mailboxId = mailbox.id;
  const secret = "provider-secret-that-must-not-be-stored";
  const adapter = {
    testConnection: vi.fn(),
    send: vi.fn(),
    listMessagesSince: vi.fn().mockRejectedValue(
      Object.assign(new Error(secret), { code: "ETIMEDOUT" })
    )
  };

  await expect(
    handleMailSync(new Date("2026-07-28T09:00:00.000Z"), async () => adapter, {
      mailboxIds: [mailbox.id]
    })
  ).resolves.toMatchObject({ failed: 1 });

  const stored = await prisma.mailbox.findUniqueOrThrow({
    where: { id: mailbox.id },
    select: { lastErrorCode: true }
  });
  expect(stored.lastErrorCode).toBe("IMAP_CONNECTION_TIMEOUT");
  expect(JSON.stringify(stored)).not.toContain(secret);
});
```

- [ ] **Step 2: Run the worker test and verify it reports `MAIL_SYNC_FAILED`**

Run:

```bash
npm test -- --run tests/integration/worker/mail-sync.test.ts
```

Expected: FAIL because the stored code is still `MAIL_SYNC_FAILED`.

- [ ] **Step 3: Classify and persist failures in all sync entry points**

In `worker/handlers/mail-sync.ts`, replace the generic catch with:

```ts
} catch (error) {
  const code = classifyMailSyncError(error);
  summary.failed += 1;
  console.error("mail_sync_failed", {
    mailboxId: mailbox.id,
    stage: "scheduled_sync",
    code
  });
  await prisma.mailbox.update({
    where: { id: mailbox.id },
    data: { lastErrorCode: code }
  });
}
```

In the manual sync and test routes, call the same classifier, persist the returned code, and return only `{ code }` with status `502`. Do not include `error.message`.

- [ ] **Step 4: Add a failing adapter test for one malformed message**

Extract an exported helper in the adapter:

```ts
export async function parseFetchedMessage(
  source: Buffer,
  internalDate: Date
): Promise<MailboxMessage | null>
```

Test that the fetch loop catches a parser rejection for one UID, logs `{ stage: "message_parse", code: "IMAP_MESSAGE_PARSE_FAILED" }`, and continues to return subsequent valid messages. The assertion must verify that the logged object contains neither raw source nor body text.

- [ ] **Step 5: Implement per-message parse isolation**

Wrap only `simpleParser` and `parsedMailToMailboxMessage` inside the fetch iteration:

```ts
try {
  const message = await parseFetchedMessage(
    item.source,
    item.internalDate instanceof Date
      ? item.internalDate
      : new Date(item.internalDate ?? Date.now())
  );
  if (message) messages.push(message);
} catch {
  console.error("mail_message_parse_failed", {
    stage: "message_parse",
    code: "IMAP_MESSAGE_PARSE_FAILED"
  });
}
```

Connection, authentication, TLS, and mailbox-lock errors must still fail the mailbox sync so the mailbox health state remains accurate.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run tests/unit/mail/sync-error.test.ts tests/unit/mail/smtp-imap-adapter.test.ts tests/integration/worker/mail-sync.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit sync diagnostics**

```bash
git add recall-admin/src/modules/mail/adapters/smtp-imap.ts recall-admin/src/worker/handlers/mail-sync.ts recall-admin/src/app/api/mail/sync/route.ts recall-admin/src/app/api/integrations/mailboxes/[id]/test/route.ts recall-admin/tests/unit/mail/smtp-imap-adapter.test.ts recall-admin/tests/integration/worker/mail-sync.test.ts
git commit -m "fix: preserve actionable mailbox sync failures"
```

---

### Task 3: Mailbox Health UI and Recovery Actions

**Files:**
- Create: `recall-admin/src/components/mail/mailbox-status-detail.tsx`
- Create: `recall-admin/tests/unit/components/mailbox-status-detail.test.tsx`
- Modify: `recall-admin/src/modules/mail/workspace-query.ts`
- Modify: `recall-admin/src/components/mail/mail-conversation-list.tsx`
- Modify: `recall-admin/src/components/mail/mail-workbench.tsx`
- Modify: `recall-admin/src/components/settings/mailbox-actions.tsx`

**Interfaces:**
- Consumes: `mailSyncStatusText`.
- Produces: selected result `{ kind: "mailbox"; mailbox: MailboxStatus }`.

- [ ] **Step 1: Write failing workspace-query tests**

In the existing mail workspace integration test, create a mailbox with `lastErrorCode: "IMAP_AUTH_FAILED"` and request `view=mailboxes&selected=<id>`. Assert:

```ts
expect(data.items[0].preview).toBe(
  "邮箱账号、密码或授权未通过"
);
expect(data.selected).toMatchObject({
  kind: "mailbox",
  mailbox: {
    id: mailbox.id,
    statusText: "邮箱账号、密码或授权未通过"
  }
});
```

- [ ] **Step 2: Run the query test**

Run:

```bash
npm test -- --run tests/integration/ui/mail-workspace-query.test.ts
```

Expected: FAIL because the preview still contains the raw code and selected mailbox details are unsupported.

- [ ] **Step 3: Return translated mailbox list and detail data**

Update `workspace-query.ts` so mailbox items use:

```ts
preview: mailbox.lastErrorCode
  ? mailSyncStatusText(mailbox.lastErrorCode)
  : mailbox.lastSyncedAt
    ? "同步正常"
    : "尚未运行同步"
```

Add a selected-mailbox branch returning enabled state, status text, last tested time, last successful time, and last sync time. Never return `encryptedConfig`.

- [ ] **Step 4: Write the failing component test**

```tsx
render(
  <MailboxStatusDetail
    mailbox={{
      id: "mailbox-1",
      name: "Namecheap 客服邮箱",
      emailAddress: "contact@righttoken.ai",
      enabled: true,
      statusText: "连接邮箱服务器超时",
      lastTestedAt: null,
      lastSuccessAt: null,
      lastSyncedAt: null
    }}
  />
);
expect(screen.getByText("连接邮箱服务器超时")).toBeInTheDocument();
expect(screen.queryByText("IMAP_CONNECTION_TIMEOUT")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "测试连接" })).toBeEnabled();
expect(screen.getByRole("button", { name: "立即同步" })).toBeEnabled();
```

- [ ] **Step 5: Render mailbox recovery detail**

Build `MailboxStatusDetail` using the existing `MailboxActions`. Extend `MailboxActions` to accept API response `code` and translate it through a client-safe copy function exported from `sync-error.ts`. Render this component in the `selected.kind === "mailbox"` branch of `MailWorkbench`.

- [ ] **Step 6: Run component and query tests**

Run:

```bash
npm test -- --run tests/unit/components/mailbox-status-detail.test.tsx tests/unit/components/mailbox-actions.test.tsx tests/integration/ui/mail-workspace-query.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit mailbox health UI**

```bash
git add recall-admin/src/components/mail/mailbox-status-detail.tsx recall-admin/tests/unit/components/mailbox-status-detail.test.tsx recall-admin/src/modules/mail/workspace-query.ts recall-admin/src/components/mail/mail-conversation-list.tsx recall-admin/src/components/mail/mail-workbench.tsx recall-admin/src/components/settings/mailbox-actions.tsx
git commit -m "feat: add actionable mailbox health controls"
```

---

### Task 4: Permission-Scoped Compose Context

**Files:**
- Create: `recall-admin/src/modules/mail/compose-context.ts`
- Create: `recall-admin/src/app/api/mail/compose-context/route.ts`
- Create: `recall-admin/tests/integration/mail/compose-context.test.ts`
- Modify: `recall-admin/src/modules/mail/workspace-filter.ts`
- Test: `recall-admin/tests/unit/mail/workspace-filter.test.ts`

**Interfaces:**
- Produces: `findComposeUsers(viewer, query, selectedUserId?)` and `getComposeContext(viewer, { userId?, taskId? })`.
- API response: `{ users: Array<{ id; label; email; suppressed; paused }>; tasks: Array<{ id; userId; title; status }> }`.

- [ ] **Step 1: Write failing scope tests**

Create an admin, two operators, one owned user per operator, and one unowned user. Assert:

```ts
expect(
  (await findComposeUsers(operatorA, "", undefined)).map((user) => user.id)
).toEqual(expect.arrayContaining([operatorAUser.id, unownedUser.id]));
expect(
  (await findComposeUsers(operatorA, "", undefined)).map((user) => user.id)
).not.toContain(operatorBUser.id);
expect(
  (await findComposeUsers(admin, "", undefined)).map((user) => user.id)
).toEqual(
  expect.arrayContaining([
    operatorAUser.id,
    operatorBUser.id,
    unownedUser.id
  ])
);
```

- [ ] **Step 2: Run the integration test**

Run:

```bash
npm test -- --run tests/integration/mail/compose-context.test.ts
```

Expected: FAIL because the module and endpoint do not exist.

- [ ] **Step 3: Implement user search and task context**

Use case-insensitive matching on `email`, `displayName`, and `externalUserId`, limit results to 20, exclude `sourceDeletedAt` users, and apply:

```ts
const scope =
  viewer.role === "OPERATOR"
    ? { OR: [{ ownerId: viewer.id }, { ownerId: null }] }
    : {};
```

For a supplied task, require it to be assigned to the operator or to belong to an owned user. Return only open tasks in `UNASSIGNED`, `TODO`, `IN_PROGRESS`, `WAITING_USER`, or `PAUSED`.

- [ ] **Step 4: Parse compose query state**

Extend `MailWorkspaceFilter` with:

```ts
compose: boolean;
composeUserId: string | null;
composeTaskId: string | null;
```

Parse `compose=1`, `userId`, and `taskId` without altering the existing `view` and `selected` behavior.

- [ ] **Step 5: Add the API permission guard**

The GET route must call `requireRequestPermission(request, "mail:send-reviewed")`, normalize `query`, and return only the safe fields from `findComposeUsers`. Return `401`/`403` through the established error pattern.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run tests/integration/mail/compose-context.test.ts tests/unit/mail/workspace-filter.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit compose context**

```bash
git add recall-admin/src/modules/mail/compose-context.ts recall-admin/src/app/api/mail/compose-context/route.ts recall-admin/tests/integration/mail/compose-context.test.ts recall-admin/src/modules/mail/workspace-filter.ts recall-admin/tests/unit/mail/workspace-filter.test.ts
git commit -m "feat: add scoped mail compose context"
```

---

### Task 5: Send Mail With an Optional Existing Task

**Files:**
- Modify: `recall-admin/src/modules/mail/send-request-schema.ts`
- Modify: `recall-admin/src/modules/mail/send-reviewed-mail.ts`
- Modify: `recall-admin/src/app/api/mail/send/route.ts`
- Modify: `recall-admin/tests/integration/mail/reviewed-send.test.ts`
- Modify: `recall-admin/tests/unit/mail/send-request-schema.test.ts`

**Interfaces:**
- Updated input: `{ actorId; mailboxId; userId; taskId?: string; recipient; subject; bodyText; bodyHtml?; assets?; minimumContactIntervalMinutes; now? }`.
- Produces: `{ message: MailMessage; taskId: string }` from `sendReviewedMail`.

- [ ] **Step 1: Write failing schema tests**

```ts
expect(
  mailSendRequestSchema.parse({
    mailboxId: "mailbox-1",
    userId: "user-1",
    recipient: "person@example.test",
    subject: "你好",
    bodyText: "正文"
  })
).toMatchObject({
  userId: "user-1",
  taskId: undefined
});
```

Also assert a missing `userId` fails and an empty optional `taskId` fails.

- [ ] **Step 2: Write failing integration tests for manual-task creation**

Send as an operator to an owned user without a task. Assert:

```ts
expect(result.taskId).toBeTruthy();
expect(
  await prisma.recallTask.findUniqueOrThrow({
    where: { id: result.taskId }
  })
).toMatchObject({
  userId: user.id,
  origin: "MANUAL",
  assigneeId: operator.id,
  status: "WAITING_USER"
});
expect(result.message).toMatchObject({
  taskId: result.taskId,
  userId: user.id,
  status: "SENT"
});
```

Add rejection tests for an operator sending to another operator's user and for a supplied task belonging to a different user.

- [ ] **Step 3: Run schema and service tests**

Run:

```bash
npm test -- --run tests/unit/mail/send-request-schema.test.ts tests/integration/mail/reviewed-send.test.ts
```

Expected: FAIL because `userId` is unsupported and `taskId` is mandatory.

- [ ] **Step 4: Resolve or create the task on the server**

In `sendReviewedMail`, load actor, mailbox, selected user, and optional task in one authorization phase. If no task exists, create:

```ts
{
  userId: user.id,
  origin: "MANUAL",
  triggerKey: `manual-mail:${crypto.randomUUID()}`,
  ruleVersion: 1,
  title: `主动联系：${input.subject.trim()}`.slice(0, 200),
  reason: "运营人员主动联系用户",
  priority: "NORMAL",
  status: "IN_PROGRESS",
  assigneeId: actor.id,
  assignmentReason: "由发件运营人员创建",
  dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  startedAt: now
}
```

After SMTP succeeds, update the task to:

```ts
{
  status: "WAITING_USER",
  startedAt: task.startedAt ?? now
}
```

Create `task.waiting_user` and `mail.reviewed_sent` activity rows in the same transaction as the sent-message update.

- [ ] **Step 5: Preserve all send guards**

Run suppression checks against both `user.emailNormalized` and the normalized final recipient. Keep the last-sent frequency query scoped to the selected user. Keep operator authorization based on task assignment or user ownership.

- [ ] **Step 6: Return the resolved task ID from the API**

Return:

```ts
{
  message: {
    id: result.message.id,
    status: result.message.status,
    sentAt: result.message.sentAt
  },
  taskId: result.taskId
}
```

- [ ] **Step 7: Run service tests**

Run:

```bash
npm test -- --run tests/unit/mail/send-request-schema.test.ts tests/integration/mail/reviewed-send.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Commit optional-task sending**

```bash
git add recall-admin/src/modules/mail/send-request-schema.ts recall-admin/src/modules/mail/send-reviewed-mail.ts recall-admin/src/app/api/mail/send/route.ts recall-admin/tests/integration/mail/reviewed-send.test.ts recall-admin/tests/unit/mail/send-request-schema.test.ts
git commit -m "feat: create tracked tasks for proactive email"
```

---

### Task 6: Restore the Unified Composer in Mail Center

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Modify: `recall-admin/src/components/mail/mail-workbench.tsx`
- Modify: `recall-admin/src/components/mail/mail-composer.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Modify: `recall-admin/tests/unit/components/mail-composer.test.tsx`
- Test: `recall-admin/tests/integration/ui/workspace-routes.test.ts`

**Interfaces:**
- Consumes: compose filter state and compose-context API.
- Produces: one composer panel shared by proactive, task, and user entry points.

- [ ] **Step 1: Write failing page and component tests**

Assert the mail page renders a “写邮件” link to `/mail?view=replies&compose=1`. Render the composer without an initial task, search for a user, select it, edit the recipient, and assert the POST body contains:

```json
{
  "userId": "user-1",
  "recipient": "manual@example.test",
  "mailboxId": "mailbox-1"
}
```

Assert the submit button remains disabled until a user, valid recipient, mailbox, subject, and body are present.

- [ ] **Step 2: Run page and composer tests**

Run:

```bash
npm test -- --run tests/unit/components/mail-composer.test.tsx tests/integration/ui/workspace-routes.test.ts
```

Expected: FAIL because the page does not render the composer and the component requires a task.

- [ ] **Step 3: Add the top-level “写邮件” entry**

In the mail page heading actions render:

```tsx
<Link
  className={styles.button}
  href={`/mail?view=${filter.view}&compose=1`}
>
  写邮件
</Link>
```

Keep “模板管理” as the secondary action. Preserve `compose`, `userId`, and `taskId` when the user changes only the mail view.

- [ ] **Step 4: Refactor the composer around selected user**

Replace the mandatory task selector state with:

```ts
const [userId, setUserId] = useState(initialUser?.id ?? "");
const [taskId, setTaskId] = useState(initialTask?.id ?? "");
const [recipient, setRecipient] = useState(initialUser?.email ?? "");
```

Debounce user search by 250 ms, call `/api/mail/compose-context?query=...`, and reset recipient and task choices when the user changes. Keep template selection through the existing public template list and rich editor.

- [ ] **Step 5: Render a compact compose panel**

When `filter.compose` is true, render `MailComposer` above the conversation workbench on wide screens and as a full-width panel on narrow screens. Add a “关闭写信” link that removes `compose`, `userId`, and `taskId` but preserves the current mail view.

- [ ] **Step 6: Show task-aware success**

After a successful send, render:

```tsx
<p role="status">
  邮件已发送，任务已进入等待用户回复
</p>
```

Refresh the router and update the local `taskId` from the API response when a manual task was created.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- --run tests/unit/components/mail-composer.test.tsx tests/integration/ui/workspace-routes.test.ts
```

Expected: all PASS.

- [ ] **Step 8: Commit the restored composer**

```bash
git add recall-admin/src/app/(dashboard)/mail/page.tsx recall-admin/src/components/mail/mail-workbench.tsx recall-admin/src/components/mail/mail-composer.tsx recall-admin/src/components/workspaces/workspace.module.css recall-admin/tests/unit/components/mail-composer.test.tsx recall-admin/tests/integration/ui/workspace-routes.test.ts
git commit -m "feat: restore proactive email workspace"
```

---

### Task 7: Connect Task and User Entry Points to Compose

**Files:**
- Create: `recall-admin/src/modules/mail/compose-link.ts`
- Create: `recall-admin/tests/unit/mail/compose-link.test.ts`
- Modify: `recall-admin/src/components/tables/task-table.tsx`
- Modify: `recall-admin/src/app/(dashboard)/tasks/[id]/page.tsx`
- Modify: `recall-admin/src/components/tasks/task-actions.tsx`
- Modify: `recall-admin/src/app/(dashboard)/users/[id]/page.tsx`
- Modify: `recall-admin/tests/unit/components/task-table.test.tsx`
- Modify: `recall-admin/tests/integration/ui/workspace-routes.test.ts`

**Interfaces:**
- Produces: `mailComposeHref({ userId, taskId?, view? }): string`.
- Consumed by: task table, task detail, user detail, and task action panel.

- [ ] **Step 1: Write the failing link helper test**

```ts
expect(
  mailComposeHref({
    userId: "user/a",
    taskId: "task?1",
    view: "replies"
  })
).toBe(
  "/mail?view=replies&compose=1&userId=user%2Fa&taskId=task%3F1"
);
```

- [ ] **Step 2: Implement deterministic URL construction**

Use `URLSearchParams` in this insertion order: `view`, `compose`, `userId`, then `taskId`. Default view to `replies`.

- [ ] **Step 3: Write failing task UI tests**

Assert:

- The task table email is a link to the compose URL.
- A `TODO` task shows “开始处理” but not “联系用户”.
- An `IN_PROGRESS` task shows “联系用户” as the primary link.
- A `WAITING_USER` task shows “再次联系”.
- The task detail no longer contains “邮件模板将在邮件中心完成后接入”.

- [ ] **Step 4: Add task and user compose links**

In the task table, keep the user number linked to user 360 and render the email as:

```tsx
<Link
  className={styles.secondaryLink}
  href={mailComposeHref({
    userId: task.user.id,
    taskId: task.id
  })}
>
  {task.user.email}
</Link>
```

In task detail, make “完整邮箱” clickable and replace the obsolete suggestion section with a “联系用户” card. In user detail, add “发邮件” using the user ID and no task ID.

- [ ] **Step 5: Make contact the task's primary operational action**

Extend `TaskActions` props with `userId`. Render:

- `IN_PROGRESS`: primary “联系用户”.
- `WAITING_USER`: secondary “再次联系”.
- Existing status transitions remain available.

The contact link must not mutate task state by itself. Sending the message performs the transition to `WAITING_USER`.

- [ ] **Step 6: Run task and page tests**

Run:

```bash
npm test -- --run tests/unit/mail/compose-link.test.ts tests/unit/components/task-table.test.tsx tests/integration/ui/workspace-routes.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit task entry points**

```bash
git add recall-admin/src/modules/mail/compose-link.ts recall-admin/tests/unit/mail/compose-link.test.ts recall-admin/src/components/tables/task-table.tsx recall-admin/src/app/(dashboard)/tasks/[id]/page.tsx recall-admin/src/components/tasks/task-actions.tsx recall-admin/src/app/(dashboard)/users/[id]/page.tsx recall-admin/tests/unit/components/task-table.test.tsx recall-admin/tests/integration/ui/workspace-routes.test.ts
git commit -m "feat: connect tasks and users to email compose"
```

---

### Task 8: Reopen the Original Waiting Task on User Reply

**Files:**
- Modify: `recall-admin/src/modules/mail/sync-mailbox.ts`
- Modify: `recall-admin/src/modules/mail/reply-matcher.ts`
- Modify: `recall-admin/tests/integration/mail/sync-mailbox.test.ts`
- Modify: `recall-admin/tests/unit/mail/reply-matcher.test.ts`

**Interfaces:**
- Updated outbound candidate: optional `taskId`.
- Updated matched result: `{ kind: "MATCHED"; threadId: string; taskId: string | null }`.
- Produces: reopened `IN_PROGRESS` task or newly created `EMAIL_REPLY` task ID for notification.

- [ ] **Step 1: Write failing reply-reopen integration tests**

Create a sent outbound message linked to a `WAITING_USER` task, then sync a matching inbound reply. Assert:

```ts
expect(result.replyTasksCreated).toBe(0);
expect(result.replyTasksReopened).toBe(1);
expect(
  await prisma.recallTask.findUniqueOrThrow({
    where: { id: task.id }
  })
).toMatchObject({
  status: "IN_PROGRESS",
  assigneeId: operator.id
});
expect(
  await prisma.taskActivity.findFirst({
    where: {
      taskId: task.id,
      action: "task.user_replied"
    }
  })
).not.toBeNull();
```

Add a second case where no waiting task exists and assert one `EMAIL_REPLY` task is created.

- [ ] **Step 2: Run the sync test**

Run:

```bash
npm test -- --run tests/integration/mail/sync-mailbox.test.ts
```

Expected: FAIL because every reply currently creates a new task.

- [ ] **Step 3: Carry task identity through reply matching**

Include `taskId` in the outbound-message query and `OutboundReplyCandidate`. Return the candidate task ID in the matched result while retaining the existing thread match rules.

- [ ] **Step 4: Reopen or create inside the mail transaction**

After storing the inbound message:

```ts
const waitingTask = match.taskId
  ? await tx.recallTask.findFirst({
      where: {
        id: match.taskId,
        userId: thread.userId,
        status: "WAITING_USER"
      }
    })
  : null;

if (waitingTask) {
  await tx.recallTask.update({
    where: { id: waitingTask.id },
    data: { status: "IN_PROGRESS" }
  });
  await tx.taskActivity.create({
    data: {
      taskId: waitingTask.id,
      action: "task.user_replied",
      detail: { providerMessageId: message.providerMessageId }
    }
  });
  notificationTaskIds.push(waitingTask.id);
  result.replyTasksReopened += 1;
} else {
  // Create the existing EMAIL_REPLY task and notification.
}
```

Keep the original assignee when reopening. Do not store message body in task activity.

- [ ] **Step 5: Update result types and worker summaries**

Add `replyTasksReopened` to `SyncResult` and to the scheduled-worker summary. Update existing tests to expect zero when no reply is reopened.

- [ ] **Step 6: Run reply and worker tests**

Run:

```bash
npm test -- --run tests/unit/mail/reply-matcher.test.ts tests/integration/mail/sync-mailbox.test.ts tests/integration/worker/mail-sync.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit reply-task reuse**

```bash
git add recall-admin/src/modules/mail/sync-mailbox.ts recall-admin/src/modules/mail/reply-matcher.ts recall-admin/tests/integration/mail/sync-mailbox.test.ts recall-admin/tests/unit/mail/reply-matcher.test.ts recall-admin/src/worker/handlers/mail-sync.ts recall-admin/tests/integration/worker/mail-sync.test.ts
git commit -m "feat: reopen waiting tasks on email reply"
```

---

### Task 9: Full Regression and Local Acceptance

**Files:**
- Modify: `recall-admin/tests/e2e/task-workflow.spec.ts`
- Create: `recall-admin/tests/e2e/mail-operating-loop.spec.ts`
- Modify: `recall-admin/README.md`

**Interfaces:**
- Consumes: all preceding functionality.
- Produces: end-to-end evidence for mailbox recovery, proactive send, task-linked send, and reply reopening.

- [ ] **Step 1: Add the end-to-end operating-loop test**

Cover these visible assertions:

```ts
await page.getByRole("link", { name: "写邮件" }).click();
await page.getByLabel("选择用户").fill("person@example.test");
await page.getByRole("option", { name: /person@example.test/ }).click();
await expect(page.getByLabel("最终收件人")).toHaveValue(
  "person@example.test"
);
await expect(
  page.getByRole("button", { name: "审核并发送" })
).toBeEnabled();
```

Mock only the SMTP provider boundary; keep the API, database, permissions, task creation, message save, and status transition real.

- [ ] **Step 2: Add task-entry navigation coverage**

Open task center, click the email link, and assert the mail composer contains the correct task and recipient. After sending, assert the task page displays “等待用户”.

- [ ] **Step 3: Document operational recovery**

Add a short README section:

```md
### 邮箱同步异常

在“邮件中心 → 已启用邮箱”选择邮箱，可查看中文状态。先执行“测试连接”，通过后执行“立即同步”。服务端日志仅记录邮箱编号、同步阶段和安全错误分类，不记录密码或邮件正文。
```

- [ ] **Step 4: Run static checks and focused suites**

Run:

```bash
npm run typecheck
npm run lint
npm test -- --run tests/unit/mail tests/unit/components/mail-composer.test.tsx tests/unit/components/mailbox-status-detail.test.tsx tests/integration/mail tests/integration/worker/mail-sync.test.ts tests/integration/ui/workspace-routes.test.ts
```

Expected: all commands exit `0`.

- [ ] **Step 5: Run the end-to-end tests**

Run:

```bash
npm run test:e2e -- tests/e2e/mail-operating-loop.spec.ts tests/e2e/task-workflow.spec.ts
```

Expected: all scenarios PASS.

- [ ] **Step 6: Verify the real configured mailbox without exposing secrets**

In localhost:

1. Open “邮件中心 → 已启用邮箱”.
2. Select “Namecheap 客服邮箱”.
3. Confirm the current status is Chinese.
4. Click “测试连接”.
5. Click “立即同步”.
6. Confirm the success timestamp updates and no internal code is visible.

Do not send a real email during this verification unless the user supplies a test recipient.

- [ ] **Step 7: Commit acceptance coverage**

```bash
git add recall-admin/tests/e2e/task-workflow.spec.ts recall-admin/tests/e2e/mail-operating-loop.spec.ts recall-admin/README.md
git commit -m "test: cover mail and task operating loop"
```

---

## Self-Review

- Spec coverage: Tasks 1–3 cover diagnosable sync and recovery; Tasks 4–7 cover unified proactive and task-linked compose; Task 8 covers reply-driven task reopening; Task 9 covers permissions, operational recovery, and end-to-end acceptance.
- Placeholder scan: the plan contains no deferred implementation markers and every code-changing task has explicit test, implementation, verification, and commit steps.
- Type consistency: `userId` is mandatory throughout sending; `taskId` is optional on input and resolved to a mandatory returned task ID; `replyTasksReopened` is added consistently to sync and worker results; compose query keys remain `compose`, `userId`, and `taskId`.
