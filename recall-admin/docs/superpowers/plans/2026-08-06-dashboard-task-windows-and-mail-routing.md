# Dashboard Task Windows and Mail Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit dashboard task metrics to confirmed creation-time windows and open the newest pending mail conversation from the reply card.

**Architecture:** Centralize the two fixed creation-time windows in a pure dashboard filter helper, then reuse them in dashboard queries and task shortcut parsing so counts and destination lists agree. Resolve the default pending-mail selection inside the server-side workspace query, after authorized items are loaded, so explicit selections and permission scopes remain authoritative.

**Tech Stack:** TypeScript, Next.js App Router, Prisma, Vitest, Testing Library.

## Global Constraints

- Due-today tasks require `createdAt >= now - 168 hours` in addition to the existing Shanghai-day and open-status filters.
- Urgent tasks require `createdAt >= now - 72 hours` in addition to the existing urgent and open-status filters.
- Historical tasks remain unchanged and accessible outside these dashboard shortcuts.
- `/mail?view=pending` automatically opens the newest authorized pending conversation when no explicit selection exists.
- Preserve administrator/operator authorization rules.
- Do not modify or stage unrelated GeoIP worktree changes.
- Do not push GitHub without explicit user instruction.

---

### Task 1: Fixed recent-task windows

**Files:**
- Create: `src/modules/reports/dashboard-task-windows.ts`
- Create: `tests/unit/reports/dashboard-task-windows.test.ts`
- Modify: `src/modules/reports/dashboard-query.ts`

**Interfaces:**
- Produces: `dashboardTaskWindows(now: Date): { dueTodayCreatedAfter: Date; urgentCreatedAfter: Date }`.
- Consumed by: dashboard query and task shortcut parsing.

- [ ] **Step 1: Write failing boundary tests**

```ts
expect(dashboardTaskWindows(now)).toEqual({
  dueTodayCreatedAfter: new Date(now.getTime() - 168 * 60 * 60_000),
  urgentCreatedAfter: new Date(now.getTime() - 72 * 60 * 60_000)
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/reports/dashboard-task-windows.test.ts`

Expected: failure because the helper does not exist.

- [ ] **Step 3: Implement the helper and apply it to dashboard counts**

```ts
export function dashboardTaskWindows(now: Date) {
  return {
    dueTodayCreatedAfter: new Date(now.getTime() - 168 * 60 * 60_000),
    urgentCreatedAfter: new Date(now.getTime() - 72 * 60 * 60_000)
  };
}
```

Add `createdAt: { gte: dueTodayCreatedAfter }` to `dueToday`; calculate `overdue` with the same Shanghai-day and 168-hour filters plus `dueAt: { lt: now }`; add `createdAt: { gte: urgentCreatedAfter }` to `urgent`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run tests/unit/reports/dashboard-task-windows.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/reports/dashboard-task-windows.ts src/modules/reports/dashboard-query.ts tests/unit/reports/dashboard-task-windows.test.ts
git commit -m "feat: limit dashboard tasks to recent windows"
```

### Task 2: Matching task-center shortcuts

**Files:**
- Modify: `src/modules/tasks/task-shortcut.ts`
- Modify: `src/app/(dashboard)/tasks/page.tsx`
- Modify: `src/modules/tasks/task-queries.ts`
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `tests/unit/tasks/task-shortcut.test.ts`
- Modify: `tests/unit/components/dashboard.test.tsx`

**Interfaces:**
- Extend `ShortcutParams` with `recent?: string`.
- Extend `TaskFilters` with `createdFrom?: Date`.
- Recognize only fixed values `168h` for `due=today` and `72h` for urgent open scope.

- [ ] **Step 1: Write failing shortcut and link tests**

```ts
expect(taskShortcutFilters({ due: "today", recent: "168h" }, now))
  .toMatchObject({ createdFrom: new Date(now.getTime() - 168 * 60 * 60_000) });
expect(taskShortcutFilters({ scope: "open", recent: "72h" }, now))
  .toMatchObject({ createdFrom: new Date(now.getTime() - 72 * 60 * 60_000) });
```

Update component expectations to require `/tasks?view=all&due=today&recent=168h` and `/tasks?view=all&priority=URGENT&scope=open&recent=72h`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/unit/tasks/task-shortcut.test.ts tests/unit/components/dashboard.test.tsx`

Expected: failures for missing `createdFrom` and old links.

- [ ] **Step 3: Implement fixed shortcut parsing and query propagation**

Parse `recent` on the task page, return the corresponding `createdFrom` only for the two supported shortcut combinations, pass it to `findTasks`, and add `createdAt: { gte: filters.createdFrom }` in `buildTaskWhere`. Update dashboard links to the fixed URLs.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/unit/tasks/task-shortcut.test.ts tests/unit/components/dashboard.test.tsx`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/tasks/task-shortcut.ts 'src/app/(dashboard)/tasks/page.tsx' src/modules/tasks/task-queries.ts src/components/dashboard/dashboard-overview.tsx tests/unit/tasks/task-shortcut.test.ts tests/unit/components/dashboard.test.tsx
git commit -m "feat: align dashboard task shortcuts"
```

### Task 3: Latest pending mail conversation

**Files:**
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/modules/mail/workspace-query.ts`
- Modify: `tests/unit/components/dashboard.test.tsx`
- Modify: `tests/integration/mail/workspace-query.test.ts`

**Interfaces:**
- Dashboard reply card links to `/mail?view=pending`.
- `getMailWorkspaceData()` derives an effective selected ID from `filter.selectedId ?? items[0]?.id` only when `filter.view === "pending"`.

- [ ] **Step 1: Write failing routing and auto-selection tests**

Update the dashboard link expectation to `/mail?view=pending`. In the integration fixture, request pending mail with `selectedId: null` and assert that `data.filter.selectedId` equals the first authorized item ID and `data.selected.kind` equals `thread`. Add an explicit-selection assertion proving a supplied ID still wins.

- [ ] **Step 2: Run focused tests and verify RED**

Run unit test: `npx vitest run tests/unit/components/dashboard.test.tsx`

Run integration test through the safe integration runner and confirm the new auto-selection assertion fails before implementation.

- [ ] **Step 3: Implement server-side effective selection**

After `items` are loaded, build:

```ts
const effectiveFilter =
  filter.view === "pending" && !filter.selectedId && items[0]
    ? { ...filter, selectedId: items[0].id }
    : filter;
```

Use `effectiveFilter` for `selectedItem()` and return it as `data.filter`. Preserve empty lists and explicit selections.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same unit and integration tests. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard-overview.tsx src/modules/mail/workspace-query.ts tests/unit/components/dashboard.test.tsx tests/integration/mail/workspace-query.test.ts
git commit -m "feat: open latest pending mail conversation"
```

### Task 4: Full verification

**Files:**
- Verify only; do not stage unrelated files.

- [ ] **Step 1: Run unit and integration suites**

Run: `npm test`

Run: `npm run test:integration`

Expected: all suites pass.

- [ ] **Step 2: Run static and production checks sequentially**

Run: `npm run lint`

Run: `npm run typecheck`

Run: `npm run worker:build`

Run: `npm run build`

Expected: all commands exit successfully.

- [ ] **Step 3: Verify scope**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only the pre-existing GeoIP changes may remain unstaged.
