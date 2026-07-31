# List Header Filters and Recency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add table-header dropdown filters for the requested user and task columns and make ordinary user/task lists newest-first.

**Architecture:** Reuse the current GET query parameters and server-side filters. A shared header filter component submits its table form automatically, while Prisma queries define stable descending business-time order.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, Vitest, Testing Library.

## Global Constraints

- Keep existing authorization scopes and URL parameter names.
- Do not introduce client-only filtering.
- Preserve other active filters and pagination parameters.
- Keep dashboard action-priority ordering unchanged.
- Use test-first development for each behavior.

---

### Task 1: Table Header Filters

**Files:**
- Create: `src/components/tables/table-header-filter.tsx`
- Modify: `src/components/tables/user-table.tsx`
- Modify: `src/components/tables/task-table.tsx`
- Modify: `src/app/(dashboard)/users/page.tsx`
- Modify: `src/app/(dashboard)/tasks/page.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/unit/components/workspaces.test.tsx`

**Interfaces:**
- Produces: `TableHeaderFilter({ label, name, value, options })`.
- `UserTable` consumes region and owner filter options.
- `TaskTable` consumes segment and assignee filter options.

- [ ] **Step 1: Write failing component tests**

Assert that the four requested headers expose named comboboxes with the current selected value
and all supplied options.

- [ ] **Step 2: Run the focused test and verify RED**

Run `npx vitest run tests/unit/components/workspaces.test.tsx`.
Expected: FAIL because the header filter controls do not exist.

- [ ] **Step 3: Implement the shared header control and wire both pages**

Use a GET form whose action is the current list route, hidden inputs for all other active
parameters, and `onChange={(event) => event.currentTarget.form?.requestSubmit()}`.
Remove the duplicated page-top region/owner/segment/assignee selects.

- [ ] **Step 4: Run the focused component test**

Run `npx vitest run tests/unit/components/workspaces.test.tsx`.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit the component, pages, styles, and tests with `feat: add list header filters`.

### Task 2: Newest-First List Queries

**Files:**
- Modify: `src/modules/users/user-queries.ts`
- Modify: `src/modules/tasks/task-queries.ts`
- Test: `tests/integration/ui/user-task-scope.test.ts`

**Interfaces:**
- `findUsers` returns descending `lastExternalEventAt`, then `registeredAt`, then `id`.
- `findTasks` returns descending `createdAt`, then `id`.

- [ ] **Step 1: Write failing integration assertions**

Create records with deliberately conflicting priority/due/update values and assert the latest
business occurrence appears first.

- [ ] **Step 2: Run the focused integration test and verify RED**

Run `npm run test:integration -- tests/integration/ui/user-task-scope.test.ts`.
Expected: FAIL because existing task ordering is priority/due and user ordering is `updatedAt`.

- [ ] **Step 3: Implement stable descending query order**

Change only the main user and task list `orderBy` clauses. Preserve nested next-task and detail
activity ordering.

- [ ] **Step 4: Run focused and full verification**

Run the focused integration test, unit suite, typecheck, lint, and build.
Expected: all PASS.

- [ ] **Step 5: Commit**

Commit query and integration test changes with `fix: sort operational lists by recency`.
