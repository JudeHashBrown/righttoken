# A Group Operations Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent A-group operations page below B group for registered users who have not started checkout, with the same compact workflow and persistent actions as B group.

**Architecture:** Copy the B-group page, components, types, and query into an independent `a-group` feature. Keep the existing persisted contact, coupon, maintenance, and mail records as the shared source of truth, and expose A-group routes that delegate to the already-tested user action services. Do not refactor B group into a generic workspace.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7, CSS Modules, Vitest, Testing Library, Playwright.

## Global Constraints

- A group means `currentSegment = A`, `sourceDeletedAt = null`, and `checkoutStartedAt = null`.
- Sort A-group users by `registeredAt DESC`, then `id DESC`.
- The A-group mail composer defaults to `KNOWLEDGE_SHARE`.
- A-group templates include segment `A` and unscoped templates only.
- Put A group immediately below B group in the sidebar.
- Keep A and B page/component/query code independent; do not introduce a generic shared group workspace.
- Contact and successful coupon state persist across segment changes.
- Mail and effective maintenance completion are scoped to the current segment episode.
- Do not display backend rules or field names in the UI.

---

### Task 1: A-group query and episode state

**Files:**
- Create: `src/modules/a-group/types.ts`
- Create: `src/modules/a-group/current-episode.ts`
- Create: `src/modules/a-group/workspace-query.ts`
- Test: `tests/unit/a-group/current-episode.test.ts`
- Test: `tests/unit/a-group/workspace-query.test.ts`

**Interfaces:**
- Produces: `AGroupWorkspaceData`, `AGroupSelectedUser`, `deriveAGroupProgress()`, `buildAGroupWhere()`, `aGroupOrderBy()`, and `getAGroupWorkspace()`.
- Consumes: existing Prisma `UserProfile`, `UserContact`, `CouponGrant`, `UserMaintenanceRecord`, `MailMessage`, and the existing operator ownership/task access rules.

- [ ] **Step 1: Write failing query tests**

Add assertions that the A-group filter contains current segment A, a null checkout start, source deletion protection, and search over external sequence and email:

```ts
expect(buildAGroupWhere(viewer)).toEqual({
  AND: [
    {
      sourceDeletedAt: null,
      currentSegment: "A",
      checkoutStartedAt: null
    },
    {}
  ]
});

expect(aGroupOrderBy()).toEqual([
  { registeredAt: "desc" },
  { id: "desc" }
]);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run tests/unit/a-group/workspace-query.test.ts tests/unit/a-group/current-episode.test.ts
```

Expected: FAIL because the `a-group` modules do not exist.

- [ ] **Step 3: Copy and customize B-group domain files**

Copy the B-group types, episode helper, and workspace query into `src/modules/a-group/`. Rename exported types/functions from `BGroup*` to `AGroup*`. Change the filter and ordering to:

```ts
AND: [
  {
    sourceDeletedAt: null,
    currentSegment: "A",
    checkoutStartedAt: null
  },
  authorizedScope(viewer),
  ...searchConditions
]
```

```ts
export function aGroupOrderBy(): Prisma.UserProfileOrderByWithRelationInput[] {
  return [{ registeredAt: "desc" }, { id: "desc" }];
}
```

Keep the same current-episode calculation, mail counters, effective-maintenance rule, persistent contact state, and persistent successful-coupon state.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 Vitest command again. Expected: both files pass.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/modules/a-group tests/unit/a-group
git commit -m "feat: add A group workspace query"
```

---

### Task 2: Independent A-group page and copied workspace components

**Files:**
- Create: `src/app/(dashboard)/groups/a/page.tsx`
- Create: `src/components/a-group/a-group-workspace.tsx`
- Create: `src/components/a-group/a-group-progress.tsx`
- Create: `src/components/a-group/a-group-mail-panel.tsx`
- Create: `src/components/a-group/a-group-contact-panel.tsx`
- Create: `src/components/a-group/a-group-coupon-panel.tsx`
- Create: `src/components/a-group/a-group-maintenance-panel.tsx`
- Create: `src/components/a-group/a-group.module.css`
- Test: `tests/unit/components/a-group-workspace.test.tsx`

**Interfaces:**
- Consumes: `getAGroupWorkspace()` and `AGroupWorkspaceData` from Task 1.
- Produces: `/groups/a` and the four inline action panels.

- [ ] **Step 1: Write failing A-group component tests**

Test the copied workspace through its public UI:

```tsx
render(
  <AGroupWorkspace
    initialData={data}
    mailboxes={mailboxes}
    templates={[]}
  />
);

expect(screen.getByRole("heading", {
  name: "新注册但未发起支付"
})).toBeInTheDocument();
expect(screen.getByText("偶然在社交媒体看到，出于好奇注册"))
  .toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: /发邮件/ }));
expect(screen.getByLabelText("邮件类型")).toHaveValue(
  "KNOWLEDGE_SHARE"
);
```

Also verify contact and maintenance open inline and the maintenance entry clears after a successful save.

- [ ] **Step 2: Run component test and verify RED**

Run:

```bash
npx vitest run tests/unit/components/a-group-workspace.test.tsx
```

Expected: FAIL because A-group components do not exist.

- [ ] **Step 3: Copy B-group components into `a-group`**

Copy every B-group component and the CSS module. Rename component and type imports to A group. Change visible copy to:

```tsx
<h1>新注册但未发起支付</h1>
<p className={styles.reasons}>
  <span>还不清楚 RightToken 的用途</span>
  <span>偶然在社交媒体看到，出于好奇注册</span>
  <span>浏览价格后认为价格偏高</span>
</p>
```

Change the queue label and selected-user route:

```tsx
<strong>A组用户</strong>
router.push(`/groups/a?userId=${encodeURIComponent(id)}`);
```

Change only the mail-purpose default:

```tsx
<select
  aria-label="邮件类型"
  defaultValue="KNOWLEDGE_SHARE"
  name="purpose"
>
```

Keep the five compact capsules, arrows, completion highlighting, 176-pixel queue, full-width mail panel, full-width maintenance panel, contact fields, coupon behavior, and manual-maintenance form unchanged.

- [ ] **Step 4: Add the A-group page**

Load the A-group workspace, active mailboxes, and A/unscoped templates:

```ts
prisma.mailTemplate.findMany({
  where: {
    active: true,
    archivedAt: null,
    OR: [{ segment: "A" }, { segment: null }]
  },
  select: {
    id: true,
    name: true,
    subject: true,
    bodyText: true
  },
  orderBy: { name: "asc" }
});
```

- [ ] **Step 5: Run component tests and verify GREEN**

Run the Task 2 Vitest command again. Expected: all A-group component tests pass.

- [ ] **Step 6: Commit the page and components**

```bash
git add src/app/'(dashboard)'/groups/a src/components/a-group tests/unit/components/a-group-workspace.test.tsx
git commit -m "feat: add A group operations page"
```

---

### Task 3: A-group action routes and navigation

**Files:**
- Create: `src/app/api/a-group/users/[id]/contact/route.ts`
- Create: `src/app/api/a-group/users/[id]/coupon/route.ts`
- Create: `src/app/api/a-group/users/[id]/maintenance/route.ts`
- Modify: `src/components/a-group/a-group-contact-panel.tsx`
- Modify: `src/components/a-group/a-group-coupon-panel.tsx`
- Modify: `src/components/a-group/a-group-maintenance-panel.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-header.tsx`
- Modify: `tests/unit/components/app-sidebar.test.tsx`
- Modify: `tests/unit/components/app-header.test.tsx`
- Modify: `tests/e2e/navigation.spec.ts`

**Interfaces:**
- Consumes: existing `saveUserContact()`, `grantBGroupCoupon()`, `getCouponIssuer()`, and `addManualMaintenanceRecord()` services; these services operate on user-level persisted state and already enforce access.
- Produces: A-group semantic API paths and navigation entry.

- [ ] **Step 1: Add failing navigation tests**

Assert that B group is immediately followed by A group and that `/groups/a` resolves the A-group title:

```ts
expect(screen.getAllByRole("link").map((link) => link.textContent))
  .toContain("A组");
expect(screen.getByText("A组 · 新注册但未发起支付"))
  .toBeInTheDocument();
```

Add `{ path: "/groups/a", heading: "新注册但未发起支付" }` immediately after the B-group route in the Playwright navigation list.

- [ ] **Step 2: Run navigation tests and verify RED**

Run:

```bash
npx vitest run tests/unit/components/app-sidebar.test.tsx tests/unit/components/app-header.test.tsx
```

Expected: FAIL because the A-group navigation and header mapping do not exist.

- [ ] **Step 3: Copy the three A-group routes**

Copy the B-group route handlers under `/api/a-group/`. Keep CSRF, authentication, permissions, validation, status codes, and error messages unchanged. Update the copied A-group panels to call `/api/a-group/users/${user.id}/...`.

- [ ] **Step 4: Add navigation and header mapping**

Insert the A-group item immediately after B group:

```ts
{
  label: "A组",
  href: "/groups/a",
  icon: UserRoundPlus
}
```

Add the header mapping before `/dashboard`:

```ts
["/groups/a", "A组 · 新注册但未发起支付"]
```

- [ ] **Step 5: Run navigation and A-group tests and verify GREEN**

Run:

```bash
npx vitest run \
  tests/unit/a-group \
  tests/unit/components/a-group-workspace.test.tsx \
  tests/unit/components/app-sidebar.test.tsx \
  tests/unit/components/app-header.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit routes and navigation**

```bash
git add src/app/api/a-group src/components/a-group src/components/layout tests
git commit -m "feat: wire A group actions and navigation"
```

---

### Task 4: Full verification and browser review

**Files:**
- Modify only if verification identifies a tested defect.

**Interfaces:**
- Verifies the complete A-group page without changing its product scope.

- [ ] **Step 1: Run static and unit verification**

Run sequentially where commands share `.next`:

```bash
npm run lint
npm test
npm run build
npm run typecheck
npm run worker:build
```

Expected: every command exits 0; the unit suite reports zero failures; the production route list includes `/groups/a`.

- [ ] **Step 2: Run browser end-to-end tests**

```bash
npm run test:e2e
```

Expected: all Playwright tests pass and `/groups/a` loads with the exact heading `新注册但未发起支付`.

- [ ] **Step 3: Perform local visual review**

Open `http://127.0.0.1:3000/groups/a` and verify:

- A group is below B group in the sidebar;
- the queue remains narrow;
- all five capsules remain compact and connected by arrows;
- knowledge sharing is the selected default mail purpose;
- mail and maintenance use the full right-side work area;
- contact fields include WeChat, Telegram, country code, and phone number;
- no backend field names or logic explanations are visible.

- [ ] **Step 4: Confirm the worktree contains only intended changes**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no generated development-only `next-env.d.ts` change.

- [ ] **Step 5: Commit any test-backed verification fix**

If a defect was found, add its regression test and minimal fix, rerun the affected command, and commit with a focused message. If no defect was found, do not create an empty commit.
