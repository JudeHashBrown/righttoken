# 邮件工作台与公共模板实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将邮件中心升级为可筛选、可查看完整会话、可人工关联来信、可直接线程回复并可维护公共模板页签的运营工作台。

**Architecture:** 保留 `/mail` 作为单页工作台，由服务端查询提供统计、筛选列表和会话详情，客户端组件处理模板选择、模板维护、人工关联和回复。邮件线程、来信正文和模板版本继续存储在 PostgreSQL；SMTP/IMAP 适配器扩展标准回复头，所有写操作通过受权限和 CSRF 保护的 Route Handler。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5.9、Prisma 7、PostgreSQL、Vitest、Testing Library、Playwright、Nodemailer、IMAPFlow。

## Global Constraints

- 主管理员、管理员和运营人员均可创建、更新、启用和停用公共模板。
- 只有主管理员可以归档模板历史版本；归档必须是软删除。
- 运营人员只能访问自己负责或公共池范围内的用户、任务和邮件。
- 邮件正文首版仅展示和编辑纯文本，不渲染不可信 HTML。
- 模板切换只复制主题和正文到本次编辑器，不自动修改公共模板。
- 更新模板必须创建新版本，不能覆盖旧版本。
- 所有回复在服务端执行退订、暂停联系、联系频率、用户范围和权限校验。
- 回复必须携带 `In-Reply-To` 和 `References`，并保存使用的模板键和版本。
- 所有新增和修改行为必须有自动化测试；生产代码前先运行对应失败测试。

---

### Task 1: 模板权限与版本数据模型

**Files:**
- Modify: `recall-admin/src/modules/auth/permissions.ts`
- Modify: `recall-admin/tests/unit/auth/permissions.test.ts`
- Modify: `recall-admin/prisma/schema.prisma`
- Create: `recall-admin/prisma/migrations/20260727120000_add_mail_template_archiving/migration.sql`
- Regenerate: `recall-admin/src/generated/prisma/**`
- Modify: `recall-admin/tests/integration/mail/schema.test.ts`

**Interfaces:**
- Produces permissions: `mail:manage-templates`, `mail:archive-template-version`
- Produces fields: `MailTemplate.updatedAt`, `MailTemplate.archivedAt`, `MailTemplate.archivedById`

- [ ] **Step 1: Write the failing permission test**

```ts
it("allows every workspace role to manage templates but only the primary admin to archive versions", () => {
  for (const role of ["PRIMARY_ADMIN", "ADMIN", "OPERATOR"] as const) {
    expect(can(role, "mail:manage-templates")).toBe(true);
  }
  expect(can("PRIMARY_ADMIN", "mail:archive-template-version")).toBe(true);
  expect(can("ADMIN", "mail:archive-template-version")).toBe(false);
  expect(can("OPERATOR", "mail:archive-template-version")).toBe(false);
});
```

- [ ] **Step 2: Run the permission test and verify RED**

Run:

```bash
cd recall-admin
npm test -- tests/unit/auth/permissions.test.ts
```

Expected: TypeScript or assertion failure because the two permissions do not exist.

- [ ] **Step 3: Add the permissions**

Add both strings to `Permission`; add `mail:manage-templates` to all three roles and `mail:archive-template-version` only to `PRIMARY_ADMIN`.

- [ ] **Step 4: Run the permission test and verify GREEN**

Run the command from Step 2. Expected: the permission test passes.

- [ ] **Step 5: Write the failing schema assertion**

Extend `tests/integration/mail/schema.test.ts` to create a template and assert:

```ts
expect(template).toMatchObject({
  archivedAt: null,
  archivedById: null
});
expect(template.updatedAt).toBeInstanceOf(Date);
```

- [ ] **Step 6: Run the integration test and verify RED**

Run:

```bash
npm run test:integration
```

Expected: failure because the archive and update fields are absent.

- [ ] **Step 7: Add Prisma fields and migration**

Update `MailTemplate`:

```prisma
model MailTemplate {
  id           String       @id @default(cuid())
  key          String
  version      Int
  name         String
  locale       String       @default("zh-CN")
  subject      String
  bodyText     String
  segment      SegmentCode?
  active       Boolean      @default(false)
  createdById  String
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  archivedAt   DateTime?
  archivedById String?

  @@unique([key, version])
  @@index([active, archivedAt, segment, locale])
  @@schema("recall")
}
```

Migration SQL:

```sql
ALTER TABLE "recall"."MailTemplate"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

DROP INDEX IF EXISTS "recall"."MailTemplate_active_segment_locale_idx";
CREATE INDEX "MailTemplate_active_archivedAt_segment_locale_idx"
  ON "recall"."MailTemplate"("active", "archivedAt", "segment", "locale");
```

- [ ] **Step 8: Generate the Prisma client and verify schema GREEN**

Run:

```bash
npx prisma generate
npm run test:integration
```

Expected: client generation succeeds and schema test passes.

- [ ] **Step 9: Commit**

```bash
git add recall-admin/src/modules/auth/permissions.ts recall-admin/tests/unit/auth/permissions.test.ts recall-admin/prisma recall-admin/src/generated/prisma recall-admin/tests/integration/mail/schema.test.ts
git commit -m "feat: add mail template permissions and archiving"
```

---

### Task 2: 公共模板版本服务与 API

**Files:**
- Create: `recall-admin/src/modules/mail/template-schema.ts`
- Create: `recall-admin/src/modules/mail/template-service.ts`
- Create: `recall-admin/src/app/api/mail/templates/route.ts`
- Create: `recall-admin/src/app/api/mail/templates/[key]/versions/route.ts`
- Create: `recall-admin/src/app/api/mail/templates/[key]/toggle/route.ts`
- Create: `recall-admin/src/app/api/mail/templates/[id]/archive/route.ts`
- Create: `recall-admin/tests/integration/mail/template-service.test.ts`
- Create: `recall-admin/tests/unit/api/mail-template-routes.test.ts`

**Interfaces:**
- Produces `listActiveMailTemplates()`
- Produces `createMailTemplate(input)`
- Produces `publishMailTemplateVersion(input)`
- Produces `setMailTemplateEnabled(input)`
- Produces `archiveMailTemplateVersion(input)`

- [ ] **Step 1: Write failing integration tests for immutable versions**

Test these behaviors with real Prisma records:

```ts
const first = await createMailTemplate({
  actorId,
  name: "注册未支付",
  subject: "完成首次支付",
  bodyText: "你好，我们可以协助你完成首次支付。"
});
const second = await publishMailTemplateVersion({
  actorId,
  key: first.key,
  name: first.name,
  subject: "首次支付协助",
  bodyText: "你好，如需支付协助请回复此邮件。"
});
const refreshedFirst = await prisma.mailTemplate.findUniqueOrThrow({
  where: { id: first.id }
});

expect(first.version).toBe(1);
expect(refreshedFirst.active).toBe(false);
expect(second.version).toBe(2);
expect(second.active).toBe(true);
expect(await prisma.mailTemplate.count({ where: { key: first.key } })).toBe(2);
```

Also assert an `OPERATOR` can create/update/toggle and cannot archive; `PRIMARY_ADMIN` can archive.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:integration
```

Expected: module-not-found failure for `template-service`.

- [ ] **Step 3: Implement strict request schemas**

`template-schema.ts` exports:

```ts
export const createMailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(200),
  bodyText: z.string().trim().min(1).max(100_000),
  locale: z.string().trim().min(2).max(20).default("zh-CN")
}).strict();

export const publishMailTemplateVersionSchema =
  createMailTemplateSchema.omit({ locale: true });

export const toggleMailTemplateSchema = z.object({
  enabled: z.boolean()
}).strict();
```

- [ ] **Step 4: Implement versioned template service**

`createMailTemplate` generates a stable slug plus random suffix key, version `1`, and `active: true`.

`publishMailTemplateVersion` runs one transaction:

1. Load latest unarchived version.
2. Set all active rows for the key to `false`.
3. Create `latest.version + 1` with the submitted content and `active: true`.
4. Store `createdById: actorId`.

Use a unique constraint failure to return `MAIL_TEMPLATE_VERSION_CONFLICT`.

`setMailTemplateEnabled` sets every version inactive, then activates only the latest unarchived version when `enabled` is true.

`archiveMailTemplateVersion` requires `mail:archive-template-version`, sets `archivedAt`, `archivedById` and `active: false`, and never deletes rows.

- [ ] **Step 5: Run integration tests and verify GREEN**

Run Step 2 command. Expected: all template service tests pass.

- [ ] **Step 6: Write failing API route tests**

Mock request sessions and assert:

- `GET /api/mail/templates` returns active templates.
- `POST /api/mail/templates` accepts an operator.
- invalid bodies return `400 INVALID_MAIL_TEMPLATE_REQUEST`.
- archive returns `403` for operators and admins.
- version conflict returns `409 MAIL_TEMPLATE_VERSION_CONFLICT`.

- [ ] **Step 7: Run route tests and verify RED**

Run:

```bash
npm test -- tests/unit/api/mail-template-routes.test.ts
```

Expected: route modules or responses are missing.

- [ ] **Step 8: Implement CSRF-protected routes**

Every write route must:

1. Call `assertSameOrigin(request)`.
2. Call `requireRequestPermission`.
3. Parse JSON with the strict schema.
4. Map `UnauthorizedError` to 401, `ForbiddenError` to 403, validation to 400 and version conflicts to 409.

Use `mail:manage-templates` for create/version/toggle and `mail:archive-template-version` for archive.

- [ ] **Step 9: Run route tests and verify GREEN**

Run Step 7 command. Expected: all route tests pass.

- [ ] **Step 10: Commit**

```bash
git add recall-admin/src/modules/mail/template-schema.ts recall-admin/src/modules/mail/template-service.ts recall-admin/src/app/api/mail/templates recall-admin/tests/integration/mail/template-service.test.ts recall-admin/tests/unit/api/mail-template-routes.test.ts
git commit -m "feat: add versioned public mail templates"
```

---

### Task 3: 标准线程回复与模板引用

**Files:**
- Modify: `recall-admin/src/modules/mail/types.ts`
- Modify: `recall-admin/src/modules/integrations/email/smtp-sender.ts`
- Modify: `recall-admin/tests/unit/mail/smtp-imap.test.ts`
- Create: `recall-admin/src/modules/mail/reply-request-schema.ts`
- Create: `recall-admin/src/modules/mail/reply-to-thread.ts`
- Create: `recall-admin/src/app/api/mail/reply/route.ts`
- Create: `recall-admin/tests/integration/mail/thread-reply.test.ts`
- Create: `recall-admin/tests/unit/api/mail-reply-route.test.ts`

**Interfaces:**
- Extends `OutboundMailboxMessage` with `inReplyTo?: string` and `references?: string[]`
- Produces `replyToMailThread(input, adapter)`

- [ ] **Step 1: Write the failing SMTP header test**

Add:

```ts
await sendSmtpMessage(config, {
  to: ["user@example.test"],
  subject: "Re: 支付协助",
  text: "我们已经收到你的问题。",
  inReplyTo: "<inbound@example.test>",
  references: ["<outbound@example.test>", "<inbound@example.test>"]
}, createTransport);

expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
  inReplyTo: "<inbound@example.test>",
  references: ["<outbound@example.test>", "<inbound@example.test>"]
}));
```

- [ ] **Step 2: Run SMTP unit test and verify RED**

Run:

```bash
npm test -- tests/unit/mail/smtp-imap.test.ts
```

Expected: TypeScript failure or missing header fields in `sendMail`.

- [ ] **Step 3: Extend outbound message and SMTP transport**

Add optional header properties to `OutboundMailboxMessage` and the local `Transport.sendMail` input. Pass them unchanged to Nodemailer.

- [ ] **Step 4: Run SMTP unit test and verify GREEN**

Run Step 2 command. Expected: pass.

- [ ] **Step 5: Write failing thread reply integration test**

Create a user, mailbox, thread, reply task, last inbound message and template. Call:

```ts
const sent = await replyToMailThread({
  actorId,
  threadId,
  taskId,
  mailboxId,
  recipient: userEmail,
  subject: "Re: 支付协助",
  bodyText: "我们已经收到你的问题。",
  templateId,
  minimumContactIntervalMinutes: 0,
  now
}, adapter);
```

Assert:

```ts
expect(adapter.send).toHaveBeenCalledWith({
  to: [userEmail],
  subject: "Re: 支付协助",
  text: "我们已经收到你的问题。",
  inReplyTo: "<latest-inbound@example.test>",
  references: [
    "<original-outbound@example.test>",
    "<latest-inbound@example.test>"
  ]
});
expect(sent).toMatchObject({
  threadId,
  taskId,
  templateKey: "payment-help",
  templateVersion: 2,
  status: "SENT"
});
```

Also assert operator access scope, suppression, paused user and minimum interval failures.

- [ ] **Step 6: Run integration test and verify RED**

Run:

```bash
npm run test:integration
```

Expected: module-not-found failure for `reply-to-thread`.

- [ ] **Step 7: Implement reply schema and service**

Schema:

```ts
export const mailReplyRequestSchema = z.object({
  threadId: z.string().min(1),
  taskId: z.string().min(1),
  mailboxId: z.string().min(1),
  recipient: z.string().trim().toLowerCase().email().max(320),
  subject: z.string().trim().min(1).max(200),
  bodyText: z.string().trim().min(1).max(100_000),
  templateId: z.string().min(1).nullable()
}).strict();
```

`replyToMailThread` must:

1. Load actor, task, user, thread, mailbox, optional template and latest message.
2. Confirm thread, task, mailbox and user belong together.
3. Apply the same role scope and send guards as `sendReviewedMail`.
4. Build deduplicated references from latest message references, latest `inReplyTo` and latest `providerMessageId`.
5. Create a draft containing the selected template key/version.
6. Send through the adapter with reply headers.
7. Mark sent or failed and write task activity plus audit log.

- [ ] **Step 8: Run integration test and verify GREEN**

Run Step 6 command. Expected: pass.

- [ ] **Step 9: Write and run failing route tests**

Test valid reply, invalid request, unauthorized, forbidden, suppressed and SMTP failure responses.

Run:

```bash
npm test -- tests/unit/api/mail-reply-route.test.ts
```

Expected: missing route failure.

- [ ] **Step 10: Implement `/api/mail/reply` and verify GREEN**

Follow the existing `/api/mail/send` error mapping and use `mail:send-reviewed`.

Run Step 9 command. Expected: pass.

- [ ] **Step 11: Commit**

```bash
git add recall-admin/src/modules/mail/types.ts recall-admin/src/modules/integrations/email/smtp-sender.ts recall-admin/src/modules/mail/reply-request-schema.ts recall-admin/src/modules/mail/reply-to-thread.ts recall-admin/src/app/api/mail/reply recall-admin/tests/unit/mail/smtp-imap.test.ts recall-admin/tests/integration/mail/thread-reply.test.ts recall-admin/tests/unit/api/mail-reply-route.test.ts
git commit -m "feat: support threaded user mail replies"
```

---

### Task 4: 未匹配来信人工关联

**Files:**
- Create: `recall-admin/src/modules/mail/assign-inbound-message.ts`
- Create: `recall-admin/src/app/api/mail/messages/[id]/assign/route.ts`
- Create: `recall-admin/tests/integration/mail/assign-inbound-message.test.ts`
- Create: `recall-admin/tests/unit/api/mail-assign-route.test.ts`
- Refactor: `recall-admin/src/modules/mail/sync-mailbox.ts`
- Create: `recall-admin/src/modules/mail/reply-task-key.ts`

**Interfaces:**
- Produces `assignInboundMessage({ actorId, messageId, userId, now })`
- Produces shared `replyTriggerKey(providerMessageId)`

- [ ] **Step 1: Write the failing idempotent assignment integration test**

Create an `INBOUND/UNMATCHED` message and call assignment twice. Assert:

```ts
expect(first.message).toMatchObject({
  userId,
  status: "RECEIVED"
});
expect(first.thread.userId).toBe(userId);
expect(await prisma.recallTask.count({
  where: { userId, origin: "EMAIL_REPLY" }
})).toBe(1);
expect(second.task.id).toBe(first.task.id);
```

Also assert an operator cannot assign a user owned by another operator.

- [ ] **Step 2: Run integration test and verify RED**

Run:

```bash
npm run test:integration
```

Expected: module-not-found failure.

- [ ] **Step 3: Extract the shared trigger-key helper**

Move the current SHA-256 key function from `sync-mailbox.ts` into:

```ts
export function replyTriggerKey(providerMessageId: string): string {
  return `email-reply:${createHash("sha256")
    .update(providerMessageId)
    .digest("hex")
    .slice(0, 32)}`;
}
```

Keep the existing sync test green.

- [ ] **Step 4: Implement transactional assignment**

Within one transaction:

1. Load the unmatched inbound message and target user.
2. Enforce operator user scope.
3. Reuse or create a thread for mailbox, user and subject.
4. Update message to `RECEIVED` with `userId` and `threadId`.
5. Upsert the reply task by `triggerKey`.
6. Write `mail.inbound_assigned` audit log.

After the transaction, create notification intents only when a new task was created.

- [ ] **Step 5: Run integration tests and verify GREEN**

Run Step 2 command again; the integration runner includes both the assignment and reply-sync suites.

Expected: both pass.

- [ ] **Step 6: Write failing route tests**

Assert valid assignment, invalid body, unauthorized, cross-owner forbidden and already-assigned idempotent responses.

- [ ] **Step 7: Implement the assignment route and verify GREEN**

Use strict body `{ userId: string }`, CSRF protection and `mail:send-reviewed` permission.

Run:

```bash
npm test -- tests/unit/api/mail-assign-route.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add recall-admin/src/modules/mail/assign-inbound-message.ts recall-admin/src/modules/mail/reply-task-key.ts recall-admin/src/modules/mail/sync-mailbox.ts recall-admin/src/app/api/mail/messages recall-admin/tests/integration/mail/assign-inbound-message.test.ts recall-admin/tests/integration/mail/reply-sync.test.ts recall-admin/tests/unit/api/mail-assign-route.test.ts
git commit -m "feat: assign unmatched inbound mail to users"
```

---

### Task 5: 邮件工作区查询与可点击统计入口

**Files:**
- Create: `recall-admin/src/modules/mail/workspace-filter.ts`
- Create: `recall-admin/src/modules/mail/workspace-query.ts`
- Create: `recall-admin/src/app/api/mail/workspace/route.ts`
- Modify: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Create: `recall-admin/src/components/mail/mail-stat-links.tsx`
- Create: `recall-admin/tests/unit/mail/workspace-filter.test.ts`
- Create: `recall-admin/tests/integration/mail/workspace-query.test.ts`
- Create: `recall-admin/tests/unit/components/mail-stat-links.test.tsx`

**Interfaces:**
- Produces `MailWorkspaceView`
- Produces `parseMailWorkspaceFilter(searchParams)`
- Produces `getMailWorkspaceData(viewer, filter)`

- [ ] **Step 1: Write failing filter tests**

Assert valid views and safe fallback:

```ts
expect(parseMailWorkspaceFilter({ view: "pending" })).toEqual({
  view: "pending",
  selectedId: null
});
expect(parseMailWorkspaceFilter({ view: "not-valid" }).view).toBe("replies");
```

- [ ] **Step 2: Run filter tests and verify RED**

Run:

```bash
npm test -- tests/unit/mail/workspace-filter.test.ts
```

Expected: missing module failure.

- [ ] **Step 3: Implement the filter parser**

Support exact views:

```ts
type MailWorkspaceView =
  | "replies"
  | "pending"
  | "unsubscribed"
  | "mailboxes"
  | "unmatched"
  | "drafts"
  | "failed"
  | "sync";
```

Accept optional `selected` ID and reject all other values.

- [ ] **Step 4: Run filter tests and verify GREEN**

Run Step 2 command. Expected: pass.

- [ ] **Step 5: Write failing scoped query integration tests**

Seed two operators, owned users, threads and messages. Assert:

- admins receive all conversations;
- an operator receives own-user and public-pool conversations only;
- `pending` returns open `EMAIL_REPLY` tasks;
- `unmatched` includes body text but no user;
- selected thread returns all ordered messages and user context;
- templates omit archived versions.

- [ ] **Step 6: Run query tests and verify RED**

Run:

```bash
npm run test:integration
```

Expected: missing query module failure.

- [ ] **Step 7: Implement the workspace query**

Return one serializable object:

```ts
type MailWorkspaceData = {
  stats: MailWorkspaceStats;
  items: MailWorkspaceListItem[];
  selected:
    | { kind: "thread"; thread: MailThreadDetail }
    | { kind: "unmatched"; message: UnmatchedMessageDetail }
    | null;
  templates: MailTemplateSummary[];
  mailboxes: MailboxSummary[];
};
```

Use explicit Prisma `select` objects. Never return encrypted mailbox configuration, password hashes or raw authorization data.

- [ ] **Step 8: Run query tests and verify GREEN**

Run Step 6 command. Expected: pass.

- [ ] **Step 9: Write failing clickable-card component test**

Assert every card is a link with the correct query:

```ts
expect(screen.getByRole("link", { name: /待处理回复/ }))
  .toHaveAttribute("href", "/mail?view=pending");
expect(screen.getByRole("link", { name: /人工归档箱/ }))
  .toHaveAttribute("href", "/mail?view=unmatched");
```

- [ ] **Step 10: Implement cards, workspace endpoint and server page**

Replace non-interactive `div.statCard` elements with accessible `Link` cards. Update `/mail` to parse `searchParams`, load `getMailWorkspaceData`, and pass it to the client workbench added in Task 6.

`GET /api/mail/workspace` uses the same parser and query for client refreshes.

- [ ] **Step 11: Run component, integration and type tests**

Run:

```bash
npm test -- tests/unit/components/mail-stat-links.test.tsx tests/unit/mail/workspace-filter.test.ts
npm run test:integration
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 12: Commit**

```bash
git add recall-admin/src/modules/mail/workspace-filter.ts recall-admin/src/modules/mail/workspace-query.ts recall-admin/src/app/api/mail/workspace recall-admin/src/app/'(dashboard)'/mail/page.tsx recall-admin/src/components/mail/mail-stat-links.tsx recall-admin/tests/unit/mail/workspace-filter.test.ts recall-admin/tests/integration/mail/workspace-query.test.ts recall-admin/tests/unit/components/mail-stat-links.test.tsx
git commit -m "feat: add filterable mail workspace data"
```

---

### Task 6: 会话工作台、模板页签与回复交互

**Files:**
- Create: `recall-admin/src/components/mail/mail-workbench.tsx`
- Create: `recall-admin/src/components/mail/mail-conversation-list.tsx`
- Create: `recall-admin/src/components/mail/mail-conversation-detail.tsx`
- Create: `recall-admin/src/components/mail/mail-reply-editor.tsx`
- Create: `recall-admin/src/components/mail/mail-template-tabs.tsx`
- Create: `recall-admin/src/components/mail/mail-template-manager.tsx`
- Create: `recall-admin/src/components/mail/unmatched-message-assignment.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Modify: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Create: `recall-admin/tests/unit/components/mail-template-tabs.test.tsx`
- Create: `recall-admin/tests/unit/components/mail-reply-editor.test.tsx`
- Create: `recall-admin/tests/unit/components/mail-workbench.test.tsx`

**Interfaces:**
- Consumes `MailWorkspaceData` from Task 5
- Calls template, assignment and reply APIs from Tasks 2–4

- [ ] **Step 1: Write failing template-tab behavior tests**

Render two templates and assert:

1. Clicking a tab copies subject/body.
2. Editing the body does not mutate the template prop.
3. Dirty content invokes `window.confirm` before switching.
4. Cancelling confirmation keeps the existing draft.
5. Saving as new template calls `POST /api/mail/templates`.
6. Updating calls `POST /api/mail/templates/:key/versions`.
7. Operators see template management actions.

- [ ] **Step 2: Run template-tab tests and verify RED**

Run:

```bash
npm test -- tests/unit/components/mail-template-tabs.test.tsx
```

Expected: missing component failure.

- [ ] **Step 3: Implement controlled template tabs**

`MailTemplateTabs` receives:

```ts
type MailTemplateTabsProps = {
  templates: MailTemplateSummary[];
  selectedTemplateId: string | null;
  dirty: boolean;
  onSelect(template: MailTemplateSummary): void;
  onCreate(): void;
  onUpdate(): void;
  onToggle(): void;
};
```

Use native buttons with `role="tab"`, `aria-selected` and a horizontally scrollable tab list. Confirm before replacing dirty editor content.

- [ ] **Step 4: Run template-tab tests and verify GREEN**

Run Step 2 command. Expected: pass.

- [ ] **Step 5: Write failing reply-editor tests**

Assert:

- full inbound body and history are visible;
- selected template populates subject/body;
- edited content is sent to `/api/mail/reply`;
- success refreshes the workbench;
- suppressed user disables send;
- failed send keeps the draft and displays a readable error;
- unresolved square-bracket variables remain blocked.

- [ ] **Step 6: Run reply-editor tests and verify RED**

Run:

```bash
npm test -- tests/unit/components/mail-reply-editor.test.tsx
```

Expected: missing component failure.

- [ ] **Step 7: Implement conversation and reply components**

`MailConversationList` uses query links so browser history and reload preserve the selected view.

`MailConversationDetail` renders message direction, sender, recipients, timestamp and `bodyText` inside whitespace-preserving text containers.

`MailReplyEditor`:

- initializes recipient from the selected user;
- initializes subject as existing `Re:` subject without repeated prefixes;
- tracks dirty state separately from template state;
- submits thread, task, mailbox, template, subject and body;
- keeps unsent text after API errors;
- calls `router.refresh()` only after success.

- [ ] **Step 8: Implement template management and unmatched assignment**

`MailTemplateManager` uses a compact modal or drawer with name, subject and body fields. It exposes create, update and toggle actions to every role; archive history is rendered only when `canArchiveTemplates` is true.

`UnmatchedMessageAssignment` provides a server-filtered user search input, displays full email and external user ID, then posts to `/api/mail/messages/:id/assign`.

- [ ] **Step 9: Write failing workbench composition test**

Assert the selected filter, list, detail, reply editor and template tabs appear in one page without the old standalone `MailComposer`.

- [ ] **Step 10: Implement responsive workbench layout**

Desktop:

- 320px conversation list
- flexible conversation/detail column
- reply editor beneath the selected conversation

Tablet/mobile:

- stacked list and detail
- no fixed-height inner scrolling that hides reply controls
- template tabs horizontally scroll instead of wrapping into tall cards

Remove the old “准备接入客服邮箱会话” placeholder copy.

- [ ] **Step 11: Run component tests, lint and typecheck**

Run:

```bash
npm test -- tests/unit/components/mail-template-tabs.test.tsx tests/unit/components/mail-reply-editor.test.tsx tests/unit/components/mail-workbench.test.tsx
npm run lint
npm run typecheck
```

Expected: all commands exit 0 with no test failures.

- [ ] **Step 12: Commit**

```bash
git add recall-admin/src/components/mail recall-admin/src/components/workspaces/workspace.module.css recall-admin/src/app/'(dashboard)'/mail/page.tsx recall-admin/tests/unit/components/mail-template-tabs.test.tsx recall-admin/tests/unit/components/mail-reply-editor.test.tsx recall-admin/tests/unit/components/mail-workbench.test.tsx
git commit -m "feat: build mail conversation workbench"
```

---

### Task 7: 全链路验证与回归

**Files:**
- Create: `recall-admin/tests/e2e/mail-workspace.spec.ts`
- Modify: `recall-admin/prisma/seed.ts`
- Modify: `recall-admin/README.md`

**Interfaces:**
- Verifies the complete feature built by Tasks 1–6

- [ ] **Step 1: Add deterministic mail test fixtures**

Seed:

- one enabled test mailbox;
- one matched inbound conversation with full body;
- one unmatched inbound message;
- one open email-reply task;
- three active public templates;
- one inactive historical template version.

Use only `example.test` addresses and fake message IDs.

- [ ] **Step 2: Write the failing E2E flow**

The Playwright test must:

1. Open `/mail`.
2. Click “待处理回复”.
3. Open the seeded conversation.
4. Assert the complete inbound body is visible.
5. Select a template tab.
6. Edit the body and submit through a test-safe mocked transport.
7. Assert the sent message appears in the conversation.
8. Open “人工归档箱”.
9. Associate the unmatched message with a user.
10. Assert it moves into a normal conversation.
11. Create a public template as an operator and see its new tab.

- [ ] **Step 3: Run E2E and verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/mail-workspace.spec.ts
```

Expected: failure at the first missing or incorrect end-to-end behavior.

- [ ] **Step 4: Fix only integration seams exposed by E2E**

Do not add new product scope. Fix routing, serialization, loading state, test transport injection or fixture setup required by the approved design.

- [ ] **Step 5: Run the focused test matrix**

Run:

```bash
npm test -- \
  tests/unit/auth/permissions.test.ts \
  tests/unit/mail/smtp-imap.test.ts \
  tests/unit/mail/workspace-filter.test.ts \
  tests/unit/api/mail-template-routes.test.ts \
  tests/unit/api/mail-reply-route.test.ts \
  tests/unit/api/mail-assign-route.test.ts \
  tests/unit/components/mail-stat-links.test.tsx \
  tests/unit/components/mail-template-tabs.test.tsx \
  tests/unit/components/mail-reply-editor.test.tsx \
  tests/unit/components/mail-workbench.test.tsx

npm run test:integration

npm run test:e2e -- tests/e2e/mail-workspace.spec.ts
```

Expected: every command exits 0.

- [ ] **Step 6: Run the full quality gate**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: every command exits 0 without lint errors, type errors, test failures or build failures.

- [ ] **Step 7: Update operator documentation**

Document:

- how inbound synchronization populates conversations;
- how to assign unmatched messages;
- how template versions work;
- which roles can manage and archive templates;
- how reply suppression and SMTP errors are shown;
- the production migration and worker restart commands.

- [ ] **Step 8: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~7..HEAD
```

Expected: no whitespace errors, no generated development-only file changes, and only mail-workspace-related files.

- [ ] **Step 9: Commit final fixtures and documentation**

```bash
git add recall-admin/tests/e2e/mail-workspace.spec.ts recall-admin/prisma/seed.ts recall-admin/README.md
git commit -m "test: verify mail workspace workflow"
```

## Plan Self-Review

- Every approved statistic-card, conversation, reply, assignment and template requirement maps to a task.
- Permission names are consistent across schema, service, routes and tests.
- Thread reply headers are implemented at both domain type and SMTP transport levels.
- Template edits create versions; archive remains a soft-delete restricted to the primary administrator.
- Operator scope is covered by service tests, workspace query tests and E2E.
- No rich text, attachments, AI replies, private templates or automatic unreviewed sending is included.
