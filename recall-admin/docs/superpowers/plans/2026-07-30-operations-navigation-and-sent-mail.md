# Operations Navigation and Sent Mail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard task metrics actionable, expose unidentified users in one filter, explain every segment inline, and add a complete sent-mail view.

**Architecture:** Extend existing task, user and mail workspace filters rather than introducing new pages. Keep metric definitions and landing-page queries aligned through explicit URL parameters, and reuse the mail workbench for individual outbound-message details.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Vitest, Testing Library.

## Global Constraints

- Preserve all existing uncommitted work.
- Do not create local commits; the user will commit everything to GitHub once the full project is ready.
- Dashboard link counts and task landing-page filters must use identical open-task semantics.
- “未识别” means both `countryCode` and `region` are null.
- Segment explanations must remain visible without hover.
- Sent mail means `direction=OUTBOUND` and `status=SENT`.
- Existing operator data scopes apply to every new view.

---

### Task 1: Link dashboard metrics to exact task filters

**Files:**
- Modify: `src/components/dashboard/metric-card.tsx`
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/components/dashboard/dashboard.module.css`
- Modify: `src/app/(dashboard)/tasks/page.tsx`
- Modify: `src/modules/tasks/task-queries.ts`
- Modify: `tests/unit/components/dashboard.test.tsx`
- Modify: `tests/integration/ui/user-task-scope.test.ts`

**Interfaces:**
- Produces: optional `href` on `MetricCard`.
- Produces: `TaskFilters.origins` and Shanghai-day due bounds.

- [ ] Add failing component assertions for:

```ts
expect(screen.getByRole("link", { name: /今日待处理 28/ }))
  .toHaveAttribute("href", "/tasks?view=all&due=today");
expect(screen.getByRole("link", { name: /紧急任务 3/ }))
  .toHaveAttribute("href", "/tasks?view=all&priority=URGENT&scope=open");
expect(screen.getByRole("link", { name: /用户待回复 17/ }))
  .toHaveAttribute("href", "/tasks?view=all&origin=EMAIL_REPLY&scope=open");
```

- [ ] Run the component test and verify the links are missing.
- [ ] Add integration fixtures and failing assertions for exact due-day, urgent and email-origin task filters.
- [ ] Implement linked metric cards, task URL parsing, open-status due-day bounds and `origins`.
- [ ] Run focused component, query and type tests until green.

---

### Task 2: Add unidentified-location filtering and inline segment definitions

**Files:**
- Modify: `src/app/(dashboard)/users/page.tsx`
- Modify: `src/modules/users/user-queries.ts`
- Modify: `src/components/users/segment-quick-filter.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `tests/unit/components/segment-quick-filter.test.tsx`
- Modify: `tests/integration/ui/user-task-scope.test.ts`

**Interfaces:**
- Produces: `UserFilters.locationState?: "unrecognized"`.
- Produces: region select values from distinct stored regions.

- [ ] Add a failing component assertion that every segment exposes its definition:

```ts
expect(screen.getByRole("button", { name: "F 服务异常" })).toBeVisible();
expect(screen.getByRole("button", { name: "A 注册未支付" })).toBeVisible();
expect(screen.getByRole("button", { name: "G 健康或其他" })).toBeVisible();
```

- [ ] Add a failing integration case with one fully unknown user, one country-only user and one known-region user; assert `locationState: "unrecognized"` returns only the fully unknown user.
- [ ] Implement the explicit location-state predicate and region-select options.
- [ ] Implement the two-line segment buttons and responsive horizontal overflow.
- [ ] Run focused tests and typecheck until green.

---

### Task 3: Add sent mail count, list and single-message detail

**Files:**
- Modify: `src/modules/mail/workspace-filter.ts`
- Modify: `src/modules/mail/workspace-query.ts`
- Modify: `src/components/mail/mail-stat-links.tsx`
- Modify: `src/components/mail/mail-workbench.tsx`
- Modify: `src/components/mail/mail-conversation-list.tsx`
- Modify: `tests/unit/mail/workspace-filter.test.ts`
- Modify: `tests/integration/mail/workspace-query.test.ts`

**Interfaces:**
- Produces: `MailWorkspaceView` value `"sent"`.
- Produces: `stats.sentMessages`.
- Produces: selected detail kind `{ kind: "message"; message: ... }`.

- [ ] Add a failing filter test proving `view=sent` is accepted.
- [ ] Add outbound SENT fixtures for both operator scopes and failing assertions for count, descending order, operator scope and selected full body.
- [ ] Count scoped sent messages and list each message by its own ID.
- [ ] Load selected outbound message body, addresses, attachments and `sentAt`.
- [ ] Render sent-message detail without reply or assignment controls.
- [ ] Run mail unit and integration tests until green.

---

### Task 4: Full verification

**Files:**
- No new files.

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect `git status --short`.
- [ ] Confirm no commits were created and all prior uncommitted changes remain present.
