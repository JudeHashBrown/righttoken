# Dashboard Recent Unpaid and Low Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 72-hour unpaid metric include current A and B users, and add a clickable 72-hour recently-used low-balance metric with a matching detail list.

**Architecture:** Keep all dashboard focus definitions in `dashboard-recent-users.ts`, so metric counts and detail queries share identical Prisma filters. Extend the existing snapshot and focus-list pipeline with a third discriminated focus, using current E-group membership as the authoritative low-balance rule and `lastCallAt` as the 72-hour activity timestamp.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Vitest, Testing Library.

## Global Constraints

- “近72小时注册未支付” means `registeredAt >= now - 72h`, `currentSegment IN (A, B)`, and `sourceDeletedAt IS NULL`.
- “近72小时余额快耗尽” means `lastCallAt >= now - 72h`, `currentSegment = E`, and `sourceDeletedAt IS NULL`.
- E-group membership is the only low-balance authority; do not create a second hard-coded threshold in dashboard code.
- Administrators see all matching users; operators see users assigned to themselves or unassigned users.
- Each focus list displays at most 100 users while preserving the complete metric total.
- The default dashboard focus remains `recent-anomaly`.
- Do not change A, B, or E segmentation rules.
- Do not push GitHub.

---

### Task 1: Define and test the three dashboard focus filters

**Files:**
- Modify: `tests/unit/reports/dashboard-recent-users.test.ts`
- Modify: `src/modules/reports/dashboard-recent-users.ts`

**Interfaces:**
- Consumes: generated Prisma input types and the existing `DashboardMember` shape.
- Produces: `DashboardFocus = "recent-unpaid" | "recent-anomaly" | "recent-low-balance"`, `recentLowBalanceWhere(member, now)`, and three-focus sorting in `limitDashboardFocusUsers`.

- [ ] **Step 1: Write failing focus and filter tests**

Extend the imports and expectations in `tests/unit/reports/dashboard-recent-users.test.ts`:

```ts
import {
  dashboardFocusOrDefault,
  effectiveAnomalyAt,
  limitDashboardFocusUsers,
  parseDashboardFocus,
  recentAnomalyOrderBy,
  recentAnomalyWhere,
  recentLowBalanceWhere,
  recentUnpaidWhere,
  recentUserCutoff
} from "@/modules/reports/dashboard-recent-users";

expect(parseDashboardFocus("recent-low-balance")).toBe(
  "recent-low-balance"
);

expect(
  recentUnpaidWhere({ id: "admin-1", role: "ADMIN" }, now)
).toEqual({
  sourceDeletedAt: null,
  currentSegment: { in: ["A", "B"] },
  registeredAt: { gte: new Date("2026-08-03T12:00:00.000Z") }
});

expect(
  recentLowBalanceWhere({ id: "admin-1", role: "ADMIN" }, now)
).toEqual({
  sourceDeletedAt: null,
  currentSegment: "E",
  lastCallAt: { gte: new Date("2026-08-03T12:00:00.000Z") }
});

expect(
  recentLowBalanceWhere({ id: "operator-1", role: "OPERATOR" }, now)
).toEqual({
  OR: [{ ownerId: "operator-1" }, { ownerId: null }],
  sourceDeletedAt: null,
  currentSegment: "E",
  lastCallAt: { gte: new Date("2026-08-03T12:00:00.000Z") }
});
```

Add a low-balance sorting assertion using rows whose `lastCallAt` values are intentionally out of order and expect the newest call first.

- [ ] **Step 2: Run the focused unit test and verify RED**

Run:

```bash
npx vitest run tests/unit/reports/dashboard-recent-users.test.ts
```

Expected: FAIL because `recent-low-balance` and `recentLowBalanceWhere` do not exist, and the unpaid filter still equals `currentSegment: "A"`.

- [ ] **Step 3: Implement the minimal focus/filter behavior**

Update `src/modules/reports/dashboard-recent-users.ts`:

```ts
export type DashboardFocus =
  | "recent-unpaid"
  | "recent-anomaly"
  | "recent-low-balance";

export function parseDashboardFocus(value: unknown): DashboardFocus | null {
  return value === "recent-unpaid" ||
    value === "recent-anomaly" ||
    value === "recent-low-balance"
    ? value
    : null;
}

export function recentUnpaidWhere(
  member: DashboardMember,
  now: Date
): Prisma.UserProfileWhereInput {
  return {
    ...operatorUserScope(member),
    sourceDeletedAt: null,
    currentSegment: { in: ["A", "B"] },
    registeredAt: { gte: recentUserCutoff(now) }
  };
}

export function recentLowBalanceWhere(
  member: DashboardMember,
  now: Date
): Prisma.UserProfileWhereInput {
  return {
    ...operatorUserScope(member),
    sourceDeletedAt: null,
    currentSegment: "E",
    lastCallAt: { gte: recentUserCutoff(now) }
  };
}
```

Extend the sortable row type with `lastCallAt: Date | null` and use `lastCallAt` when `focus === "recent-low-balance"`; keep registered time for unpaid and anomaly time for anomalies.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected: all tests in the file PASS.

- [ ] **Step 5: Commit the filter behavior**

```bash
git add tests/unit/reports/dashboard-recent-users.test.ts src/modules/reports/dashboard-recent-users.ts
git commit -m "feat: define recent low balance dashboard focus"
```

---

### Task 2: Load low-balance metrics and focus users in the dashboard snapshot

**Files:**
- Modify: `src/modules/reports/dashboard-query.ts`
- Modify: `tests/unit/components/dashboard.test.tsx` (fixture types only in the RED step)

**Interfaces:**
- Consumes: `recentLowBalanceWhere`, `DashboardFocus`, and `DASHBOARD_FOCUS_PAGE_SIZE` from Task 1.
- Produces: `DashboardSnapshot.metrics.recentLowBalance`, plus `DashboardFocusUser.balanceUsdMinor` and `DashboardFocusUser.lastCallAt`.

- [ ] **Step 1: Extend the typed component fixture to expose missing snapshot fields**

Add this metric and fields to the shared snapshot fixture in `tests/unit/components/dashboard.test.tsx`:

```ts
metrics: {
  recentUnpaid: 9,
  recentAnomalies: 4,
  recentLowBalance: 3,
  awaitingReply: 17,
  unassignedUsers: 12,
  sevenDayRecallRate: 18.6
},
// inside each focus user
balanceUsdMinor: 35,
lastCallAt: new Date("2026-08-06T10:00:00.000Z")
```

- [ ] **Step 2: Run typecheck and verify RED**

Run:

```bash
npm run typecheck
```

Expected: FAIL because `DashboardSnapshot` does not yet accept `recentLowBalance`, `balanceUsdMinor`, or `lastCallAt`.

- [ ] **Step 3: Extend snapshot types, selection, counts, and list loading**

In `src/modules/reports/dashboard-query.ts`, add these fields to the existing named types without removing their current fields:

```ts
// DashboardFocusUser additions
balanceUsdMinor: number;
lastCallAt: Date | null;

// DashboardSnapshot.metrics addition
recentLowBalance: number;
```

Add `balanceUsdMinor: true` and `lastCallAt: true` to `focusUserSelect`. Import `recentLowBalanceWhere`. Add `recentLowBalance` to the `Promise.all` count tuple:

```ts
prisma.userProfile.count({
  where: recentLowBalanceWhere(member, now)
})
```

Choose the focus filter explicitly:

```ts
const focusWhere =
  focus === "recent-unpaid"
    ? recentUnpaidWhere(member, now)
    : focus === "recent-low-balance"
      ? recentLowBalanceWhere(member, now)
      : recentAnomalyWhere(member, now);
```

Load unpaid rows by `registeredAt`, low-balance rows by `lastCallAt`, and preserve the two-query anomaly merge. Map `balanceUsdMinor` and `lastCallAt` into each focus user and into the sortable input. Return `recentLowBalance` in `metrics`.

- [ ] **Step 4: Run typecheck and focused tests**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/reports/dashboard-recent-users.test.ts tests/unit/components/dashboard.test.tsx
```

Expected: typecheck and the current tests PASS.

- [ ] **Step 5: Commit snapshot data support**

```bash
git add src/modules/reports/dashboard-query.ts tests/unit/components/dashboard.test.tsx
git commit -m "feat: load recent low balance dashboard users"
```

---

### Task 3: Add the metric card and low-balance detail presentation

**Files:**
- Modify: `tests/unit/components/dashboard.test.tsx`
- Modify: `src/components/dashboard/dashboard-overview.tsx`
- Modify: `src/components/dashboard/dashboard-focus-list.tsx`

**Interfaces:**
- Consumes: the extended `DashboardSnapshot` from Task 2.
- Produces: a clickable low-balance metric and a three-mode detail table.

- [ ] **Step 1: Write failing component tests**

Add assertions for the metric link:

```ts
expect(screen.getByText("近72小时余额快耗尽")).toBeInTheDocument();
expect(
  screen.getByRole("link", { name: /近72小时余额快耗尽 3/ })
).toHaveAttribute(
  "href",
  "/dashboard?focus=recent-low-balance#focus-list"
);
```

Add a focused render using `focus: "recent-low-balance"` with `balanceUsdMinor: 35` and a recent `lastCallAt`. Assert:

```ts
expect(
  screen.getByRole("heading", { name: "近72小时余额快耗尽用户" })
).toBeInTheDocument();
expect(screen.getByText("当前余额")).toBeInTheDocument();
expect(screen.getByText("最近使用时间")).toBeInTheDocument();
expect(screen.getByText("US$0.35")).toBeInTheDocument();
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npx vitest run tests/unit/components/dashboard.test.tsx
```

Expected: FAIL because the new card and low-balance list mode are not rendered.

- [ ] **Step 3: Implement the card and focus-total mapping**

Import `BatteryLow` from `lucide-react` in `dashboard-overview.tsx` and add:

```tsx
<MetricCard
  label="近72小时余额快耗尽"
  value={metrics.recentLowBalance.toLocaleString("zh-CN")}
  note={
    metrics.recentLowBalance
      ? "点击查看用户列表"
      : "暂无符合条件用户"
  }
  icon={BatteryLow}
  tone="warning"
  href="/dashboard?focus=recent-low-balance#focus-list"
/>
```

Place it immediately after the service-anomaly card. Replace the binary total expression with a three-focus mapping so low-balance uses `metrics.recentLowBalance`.

- [ ] **Step 4: Implement the low-balance table mode**

In `dashboard-focus-list.tsx`, distinguish all three focus values. Add:

```ts
function formatUsdMinor(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value / 100);
}
```

Use the heading `近72小时余额快耗尽用户`. For this mode, render `当前余额` and `最近使用时间`, with `formatUsdMinor(user.balanceUsdMinor)` and `formatDate(user.lastCallAt)`. Preserve the current unpaid and anomaly columns unchanged.

- [ ] **Step 5: Run component and filter tests and verify GREEN**

Run:

```bash
npx vitest run tests/unit/components/dashboard.test.tsx tests/unit/reports/dashboard-recent-users.test.ts
```

Expected: both test files PASS.

- [ ] **Step 6: Commit the dashboard presentation**

```bash
git add tests/unit/components/dashboard.test.tsx src/components/dashboard/dashboard-overview.tsx src/components/dashboard/dashboard-focus-list.tsx
git commit -m "feat: show recent low balance dashboard users"
```

---

### Task 4: Add the low-balance database index and complete verification

**Files:**
- Create: `prisma/migrations/20260807120000_add_dashboard_recent_low_balance_index/migration.sql`

**Interfaces:**
- Consumes: the low-balance Prisma filter from Task 1.
- Produces: a PostgreSQL index supporting E-group, non-deleted, recent-call queries.

- [ ] **Step 1: Create the index migration**

Create the migration with:

```sql
CREATE INDEX "UserProfile_recent_low_balance_idx"
ON "recall"."UserProfile"(
  "currentSegment",
  "sourceDeletedAt",
  "lastCallAt"
);
```

- [ ] **Step 2: Apply migrations locally**

Run:

```bash
npm run db:deploy
```

Expected: migration `20260807120000_add_dashboard_recent_low_balance_index` applies successfully.

- [ ] **Step 3: Run focused and complete automated verification**

Run:

```bash
npx vitest run tests/unit/reports/dashboard-recent-users.test.ts tests/unit/components/dashboard.test.tsx
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run worker:build
npm run build
```

Expected: every command exits 0 with no test failure, lint error, type error, or build error.

- [ ] **Step 4: Verify the rendered dashboard locally**

Open `/dashboard` and confirm:

- the unpaid count includes current A and B users registered in the last 72 hours;
- the new card appears immediately after service anomalies;
- clicking the card changes the URL to `focus=recent-low-balance#focus-list`;
- the list heading, USD balance, latest-use time, owner, empty state, and 100-row limit render correctly;
- the default dashboard focus remains recent service anomalies.

- [ ] **Step 5: Commit the migration**

```bash
git add prisma/migrations/20260807120000_add_dashboard_recent_low_balance_index/migration.sql
git commit -m "perf: index recent low balance dashboard users"
```

- [ ] **Step 6: Confirm repository scope**

Run:

```bash
git status --short
git log --oneline --max-count=6
```

Expected: feature files and migration are committed; the pre-existing `next-env.d.ts` modification remains unstaged and untouched; no GitHub push has occurred.

## Self-Review

- Every requirement in the approved design maps to a task and an explicit test or verification step.
- `recentLowBalanceWhere` is the only new query predicate and reuses E-group membership rather than duplicating a numeric balance rule.
- The three focus strings, metric fields, query branches, total mapping, sort keys, and presentation branches use consistent names.
- The plan contains no placeholders, deferred implementation, or unrelated refactoring.
