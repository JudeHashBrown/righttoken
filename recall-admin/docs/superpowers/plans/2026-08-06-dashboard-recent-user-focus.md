# Dashboard Recent User Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first two dashboard cards with recent unpaid-registration and service-anomaly metrics, and let either card reveal its matching user list on the dashboard.

**Architecture:** A focused report helper owns the exact 72-hour predicates and focus parsing. The dashboard query reuses those predicates for both counts and detail rows, while the page passes a validated focus into the snapshot and a dedicated component renders the selected list.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, CSS Modules, Vitest, Testing Library

## Global Constraints

- Use a rolling 72-hour window with an inclusive lower boundary.
- Preserve administrator/operator user scoping and exclude `sourceDeletedAt` users.
- Keep existing task metrics in the snapshot for navigation badges.
- Do not mutate user or task data.
- Do not push GitHub.

---

### Task 1: Define and test recent-user report rules

**Files:**
- Create: `src/modules/reports/dashboard-recent-users.ts`
- Create: `tests/unit/reports/dashboard-recent-users.test.ts`

**Interfaces:**
- Produces: `DashboardFocus`, `parseDashboardFocus(value)`, `recentUserCutoff(now)`, `recentUnpaidWhere(member, now)`, `recentAnomalyWhere(member, now)`, and `effectiveAnomalyAt(row)`.

- [ ] **Step 1: Write failing unit tests**

Cover valid/invalid focus values, a cutoff exactly 72 hours before `now`, administrator versus operator owner scope, `sourceDeletedAt: null`, segment A registration filtering, segment F active anomaly filtering using either anomaly timestamp, and selection of the later anomaly timestamp.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/unit/reports/dashboard-recent-users.test.ts`

Expected: FAIL because `dashboard-recent-users` does not exist.

- [ ] **Step 3: Implement the minimal report helper**

Return Prisma-compatible `UserProfileWhereInput` objects using `gte: recentUserCutoff(now)` and the existing operator rule `{ OR: [{ ownerId: member.id }, { ownerId: null }] }`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/unit/reports/dashboard-recent-users.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the report rules**

Stage only the two files above and commit as `feat: define dashboard recent user filters`.

### Task 2: Add counts and focused rows to the dashboard query

**Files:**
- Modify: `src/modules/reports/dashboard-query.ts`
- Modify: `tests/unit/components/dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 1 focus and predicate helpers.
- Produces: `DashboardFocusUser`, `metrics.recentUnpaid`, `metrics.recentAnomalies`, `focus`, and `focusUsers` on `DashboardSnapshot`.

- [ ] **Step 1: Update the component fixture first so the new snapshot contract is required**

Add recent metric values plus unpaid and anomaly focus-user fixtures. The focus-user shape contains `id`, `externalUserId`, `displayName`, `email`, `region`, `ownerName`, `registeredAt`, `anomalyReason`, and `anomalyAt`.

- [ ] **Step 2: Run type checking and verify RED**

Run: `npm run typecheck`

Expected: FAIL because the dashboard snapshot does not yet expose the new fields.

- [ ] **Step 3: Extend the dashboard query**

Add both counts to the existing parallel query. Accept a nullable focus argument, query only the selected detail set with the exact same predicate as its count, include owner display name, compute effective anomaly time, and sort focused rows descending by the relevant timestamp with ID as deterministic tie-breaker.

- [ ] **Step 4: Run type checking and verify GREEN for the data contract**

Run: `npm run typecheck`

Expected: PASS once downstream rendering is completed in Task 3; until then, only failures explicitly caused by not-yet-updated UI are acceptable.

### Task 3: Replace the cards and render the focused list

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Create: `src/components/dashboard/dashboard-focus-list.tsx`
- Modify: `src/components/dashboard/dashboard.module.css`
- Modify: `tests/unit/components/dashboard.test.tsx`

**Interfaces:**
- Consumes: Task 2 snapshot focus and rows.
- Produces: validated dashboard links and the `#focus-list` panel.

- [ ] **Step 1: Write failing component expectations**

Assert the old title, greeting, and date are absent; new card labels/counts/links are present; the unpaid table contains user/email/region/registration/owner; the anomaly table contains reason/anomaly time; and an empty focused result has a clear empty state.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- tests/unit/components/dashboard.test.tsx`

Expected: FAIL on the new text, links, and detail panel.

- [ ] **Step 3: Implement the page and components**

Parse `searchParams.focus`, pass it into `getDashboardSnapshot`, remove the page header and unused props/helpers, link cards to the two focus URLs, and render a full-width focused table immediately below the metrics when a focus is selected.

- [ ] **Step 4: Run component tests and type checking**

Run: `npm test -- tests/unit/components/dashboard.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the dashboard feature**

Stage only the dashboard query/page/components/styles/tests and commit as `feat: add dashboard recent user drilldowns`.

### Task 4: Verify the complete change

**Files:**
- Modify only files required to fix failures caused by Tasks 1–3.

**Interfaces:**
- Consumes: completed feature.
- Produces: verified local branch without a remote push.

- [ ] **Step 1: Run all automated checks**

Run sequentially: `npm test`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, `npm run worker:build`, and `npm run build`.

Expected: every command exits successfully.

- [ ] **Step 2: Review the final diff**

Confirm only dashboard-specific files and the two documentation files belong to this change, and that unrelated pre-existing worktree changes remain unstaged.

- [ ] **Step 3: Commit any verification fixes**

Stage only necessary dashboard files and commit with a narrowly scoped message.

## Self-Review

- Spec coverage: Tasks 1–3 cover both metric definitions, both click targets, the in-page lists, header removal, role scope, deletion filtering, and existing navigation compatibility.
- Placeholder scan: no TBD, TODO, deferred implementation, or unspecified error-handling steps remain.
- Type consistency: `DashboardFocus` and `DashboardFocusUser` are introduced before the page and component consume them; metric field names match throughout the plan.
