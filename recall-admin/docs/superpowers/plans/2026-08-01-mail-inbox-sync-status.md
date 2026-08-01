# Mail Inbox Sync Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mailbox sync status truthful, explain the difference between connection testing and message retrieval, and surface a clear warning when the two-minute background sync appears stale.

**Architecture:** Keep the existing IMAP sync API and pg-boss Worker unchanged. Add one pure status function in the mail sync error module, reuse it in both mailbox list and detail queries, then adjust UI copy and deployment diagnostics. No database migration or new runtime dependency is required.

**Tech Stack:** TypeScript 5.9, Next.js 16 App Router, React 19, Prisma 7, Vitest 4, pg-boss 12.

## Global Constraints

- Preserve the existing two-minute `MAIL_SYNC` Worker schedule.
- Preserve the existing manual `/api/mail/sync` behavior and 30-day first-sync window.
- Do not change mailbox credentials, SMTP/IMAP provider settings, or database schema.
- A sync is stale only when the most recent successful sync is more than ten minutes old.
- Classified IMAP or processing errors always take precedence over time-based status.

---

### Task 1: Centralize truthful mailbox sync status

**Files:**
- Modify: `recall-admin/tests/unit/mail/sync-error.test.ts`
- Modify: `recall-admin/src/modules/mail/sync-error.ts`
- Modify: `recall-admin/src/modules/mail/workspace-query.ts`

**Interfaces:**
- Consumes: existing `mailSyncStatusText(code: string | null): string` for classified errors.
- Produces: `mailboxSyncStatusText(input: { lastErrorCode: string | null; lastSyncedAt: Date | null; now?: Date }): string`.

- [ ] **Step 1: Write the failing status tests**

Add this import and test block to `tests/unit/mail/sync-error.test.ts`:

```ts
import {
  classifyMailSyncError,
  mailboxSyncStatusText,
  mailSyncStatusText
} from "@/modules/mail/sync-error";

describe("mailbox sync status", () => {
  const now = new Date("2026-08-01T05:00:00.000Z");

  it("reports a mailbox that has never synchronized", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: null,
        lastSyncedAt: null,
        now
      })
    ).toBe("尚未运行同步，请点击立即收取邮件");
  });

  it("warns when automatic synchronization is stale", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: null,
        lastSyncedAt: new Date("2026-08-01T04:49:59.999Z"),
        now
      })
    ).toBe("自动同步可能未运行，请检查后台 Worker");
  });

  it("reports a recent synchronization as healthy", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: null,
        lastSyncedAt: new Date("2026-08-01T04:52:00.000Z"),
        now
      })
    ).toBe("同步正常");
  });

  it("prioritizes a classified error over synchronization time", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: "IMAP_AUTH_FAILED",
        lastSyncedAt: new Date("2026-08-01T04:59:00.000Z"),
        now
      })
    ).toBe("邮箱账号、密码或授权未通过");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/mail/sync-error.test.ts
```

Expected: FAIL because `mailboxSyncStatusText` is not exported.

- [ ] **Step 3: Implement the pure status function**

Add to `src/modules/mail/sync-error.ts`:

```ts
const MAIL_SYNC_STALE_AFTER_MS = 10 * 60 * 1000;

export function mailboxSyncStatusText({
  lastErrorCode,
  lastSyncedAt,
  now = new Date()
}: {
  lastErrorCode: string | null;
  lastSyncedAt: Date | null;
  now?: Date;
}): string {
  if (lastErrorCode) {
    return mailSyncStatusText(lastErrorCode);
  }
  if (!lastSyncedAt) {
    return "尚未运行同步，请点击立即收取邮件";
  }
  if (
    now.getTime() - lastSyncedAt.getTime() >
    MAIL_SYNC_STALE_AFTER_MS
  ) {
    return "自动同步可能未运行，请检查后台 Worker";
  }
  return "同步正常";
}
```

- [ ] **Step 4: Reuse the function in mailbox list and detail queries**

In `src/modules/mail/workspace-query.ts`, import `mailboxSyncStatusText`, replace the mailbox-list preview expression with:

```ts
preview: mailboxSyncStatusText({
  lastErrorCode: mailbox.lastErrorCode,
  lastSyncedAt: mailbox.lastSyncedAt
}),
```

Replace the selected mailbox `statusText` expression with the same call.

- [ ] **Step 5: Run the focused test and type check**

Run:

```bash
npx vitest run tests/unit/mail/sync-error.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript exits with code 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add recall-admin/tests/unit/mail/sync-error.test.ts recall-admin/src/modules/mail/sync-error.ts recall-admin/src/modules/mail/workspace-query.ts
git commit -m "fix: report truthful mailbox sync status"
```

### Task 2: Clarify mailbox actions and timestamps

**Files:**
- Modify: `recall-admin/tests/unit/components/mailbox-actions.test.tsx`
- Modify: `recall-admin/tests/unit/components/mailbox-status-detail.test.tsx`
- Modify: `recall-admin/src/components/settings/mailbox-actions.tsx`
- Modify: `recall-admin/src/components/mail/mailbox-status-detail.tsx`

**Interfaces:**
- Consumes: `MailboxStatusDetailData.lastSyncedAt` as the only successful-sync timestamp.
- Produces: user-facing copy that distinguishes connection testing, manual sync, and two-minute automatic sync.

- [ ] **Step 1: Write failing component assertions**

Update `mailbox-actions.test.tsx` so the successful connection assertion is:

```ts
expect(
  screen.getByText(
    "收信和发信连接均正常；测试连接不会收取邮件。"
  )
).toBeInTheDocument();
```

Add to `mailbox-status-detail.test.tsx`:

```ts
expect(screen.getByText("最近成功同步")).toBeInTheDocument();
expect(screen.getByText("自动同步频率")).toBeInTheDocument();
expect(screen.getByText("每 2 分钟")).toBeInTheDocument();
expect(screen.queryByText("最近成功收信")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run focused component tests and verify RED**

Run:

```bash
npx vitest run tests/unit/components/mailbox-actions.test.tsx tests/unit/components/mailbox-status-detail.test.tsx
```

Expected: FAIL on the old connection-test copy and old summary labels.

- [ ] **Step 3: Implement the minimal UI copy changes**

In `mailbox-actions.tsx`, replace the test success message with:

```ts
setMessage("收信和发信连接均正常；测试连接不会收取邮件。");
```

In `mailbox-status-detail.tsx`, replace the final two summary items with:

```tsx
<div className={styles.summaryItem}>
  <span className={styles.detailLabel}>最近成功同步</span>
  <strong>{dateTime(mailbox.lastSyncedAt)}</strong>
</div>
<div className={styles.summaryItem}>
  <span className={styles.detailLabel}>自动同步频率</span>
  <strong>每 2 分钟</strong>
</div>
```

Remove `lastSuccessAt` from `MailboxStatusDetailData` and from the selected mailbox view model because it is no longer displayed.

- [ ] **Step 4: Run focused component tests and type check**

Run:

```bash
npx vitest run tests/unit/components/mailbox-actions.test.tsx tests/unit/components/mailbox-status-detail.test.tsx
npm run typecheck
```

Expected: component tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add recall-admin/tests/unit/components/mailbox-actions.test.tsx recall-admin/tests/unit/components/mailbox-status-detail.test.tsx recall-admin/src/components/settings/mailbox-actions.tsx recall-admin/src/components/mail/mailbox-status-detail.tsx recall-admin/src/modules/mail/workspace-query.ts
git commit -m "fix: clarify mailbox synchronization controls"
```

### Task 3: Document production Worker recovery and verify the release

**Files:**
- Modify: `recall-admin/docs/deployment.md`
- Modify: `recall-admin/docs/runbooks/deployment.md`

**Interfaces:**
- Consumes: production Compose services `recall-web` and `recall-worker`.
- Produces: an operator checklist for restoring and verifying two-minute inbox synchronization.

- [ ] **Step 1: Add the production recovery checklist**

Add the following to the mailbox section of `docs/deployment.md`:

```markdown
### 邮件自动同步排查

“测试连接”只验证 SMTP 和 IMAP，不会收取邮件。首次同步可在邮箱工作台点击
“立即收取邮件”。自动同步由 `recall-worker` 每两分钟执行。

页面持续显示“尚未运行同步”或“自动同步可能未运行”时：

1. 使用生产 Compose 配置检查 `recall-worker` 是否为运行且健康状态。
2. 查看 `recall-worker` 日志中的 `mail_sync_failed` 分类错误。
3. 同时重新创建 `recall-web` 和 `recall-worker`，不能只更新 Web。
4. 手动收取成功后等待两到四分钟并刷新，确认最近成功同步时间继续推进。
```

Add the same four verification outcomes, in checklist form, to `docs/runbooks/deployment.md`.

- [ ] **Step 2: Validate documentation and full application**

Run:

```bash
git diff --check
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: no whitespace errors; lint, typecheck, 153+ unit test files, and production build all exit with code 0.

- [ ] **Step 3: Commit Task 3**

```bash
git add recall-admin/docs/deployment.md recall-admin/docs/runbooks/deployment.md
git commit -m "docs: add mailbox worker recovery steps"
```

- [ ] **Step 4: Verify branch scope and push**

Run:

```bash
git status -sb
git log --oneline origin/main..HEAD
git push origin codex/fix-mail-inbox-sync
```

Expected: clean worktree, only the design/plan and three focused implementation commits ahead of `origin/main`, and a successful GitHub push.
