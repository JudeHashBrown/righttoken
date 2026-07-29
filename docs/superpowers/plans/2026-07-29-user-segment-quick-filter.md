# User Segment Quick Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the user-center segment dropdown with an always-visible `全部、F、A、B、C、D、E、G` quick filter while keeping the desktop filter bar on one line.

**Architecture:** Add a focused server-compatible presentational component that renders submit buttons inside the existing GET form. Keep the existing `segment` query parameter and user query unchanged; CSS module classes provide selected, focus, desktop-density, and narrow-screen overflow behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Vitest, Testing Library, Playwright.

## Global Constraints

- Desktop order is `全部、F、A、B、C、D、E、G`.
- Clicking a segment submits the current search, country, region, and owner values together.
- The current segment exposes both a visual selected state and `aria-pressed="true"`.
- Desktop filter controls remain on one line.
- Narrow screens never fall back to a dropdown; the segment strip may scroll horizontally.
- Existing `segment=A` through `segment=G` query behavior and pagination remain unchanged.

---

### Task 1: Segment quick-filter component

**Files:**
- Create: `recall-admin/src/components/users/segment-quick-filter.tsx`
- Create: `recall-admin/tests/unit/components/segment-quick-filter.test.tsx`
- Modify: `recall-admin/src/app/(dashboard)/users/page.tsx`

**Interfaces:**
- Consumes: `selectedSegment: string` from the current `segment` URL query parameter.
- Produces: `SegmentQuickFilter({ selectedSegment }: { selectedSegment: string }): React.JSX.Element`.

- [ ] **Step 1: Write the failing component test**

```tsx
render(<SegmentQuickFilter selectedSegment="F" />);

expect(
  screen.getAllByRole("button").map((button) => button.textContent)
).toEqual(["全部", "F", "A", "B", "C", "D", "E", "G"]);
expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "F" })).toHaveAttribute(
  "aria-pressed",
  "true"
);
expect(screen.getByRole("button", { name: "A" })).toHaveAttribute(
  "name",
  "segment"
);
expect(screen.getByRole("button", { name: "A" })).toHaveAttribute(
  "value",
  "A"
);
```

- [ ] **Step 2: Run the test and verify the missing component failure**

Run:

```bash
npx vitest run tests/unit/components/segment-quick-filter.test.tsx
```

Expected: FAIL because `SegmentQuickFilter` does not exist.

- [ ] **Step 3: Implement the component**

```tsx
import styles from "@/components/workspaces/workspace.module.css";

const segments = ["", "F", "A", "B", "C", "D", "E", "G"] as const;

export function SegmentQuickFilter({
  selectedSegment
}: {
  selectedSegment: string;
}): React.JSX.Element {
  return (
    <fieldset className={styles.segmentQuickFieldset}>
      <legend>分组</legend>
      <div className={styles.segmentQuickList}>
        {segments.map((segment) => {
          const selected = segment === selectedSegment;
          return (
            <button
              aria-pressed={selected}
              className={`${styles.segmentQuickButton} ${
                selected ? styles.segmentQuickButtonSelected : ""
              }`}
              key={segment || "all"}
              name="segment"
              type="submit"
              value={segment}
            >
              {segment || "全部"}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4: Replace the page dropdown**

Import `SegmentQuickFilter` and replace the `user-segment` label/select block with:

```tsx
<SegmentQuickFilter selectedSegment={segment} />
```

Keep the surrounding form method and all other named controls unchanged so native GET form submission includes every current field.

- [ ] **Step 5: Run the component and page-related tests**

Run:

```bash
npx vitest run \
  tests/unit/components/segment-quick-filter.test.tsx \
  tests/unit/config/user-facing-copy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the interaction**

```bash
git add \
  recall-admin/src/components/users/segment-quick-filter.tsx \
  recall-admin/src/app/'(dashboard)'/users/page.tsx \
  recall-admin/tests/unit/components/segment-quick-filter.test.tsx
git commit -m "feat: add user segment quick filters"
```

### Task 2: Compact responsive filter layout

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/users/page.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Modify: `recall-admin/tests/e2e/navigation.spec.ts`

**Interfaces:**
- Consumes: `segmentQuickFieldset`, `segmentQuickList`, `segmentQuickButton`, and `segmentQuickButtonSelected` from Task 1.
- Produces: `userFilterBar`, `userFilterCompact`, and `userFilterOwner` layout classes used only by the user-center filter.

- [ ] **Step 1: Add an end-to-end assertion for visible quick filters**

After navigating to `/users`, assert:

```ts
const segmentGroup = page.getByRole("group", { name: "分组" });
await expect(segmentGroup).toBeVisible();
await expect(
  segmentGroup.getByRole("button", { name: "F" })
).toBeVisible();
await expect(segmentGroup.getByRole("combobox")).toHaveCount(0);
```

Then click `F` and assert:

```ts
await segmentGroup.getByRole("button", { name: "F" }).click();
await expect(page).toHaveURL(/segment=F/);
await expect(
  page.getByRole("button", { name: "F" })
).toHaveAttribute("aria-pressed", "true");
```

- [ ] **Step 2: Run the targeted browser test and verify it fails before layout completion**

Run:

```bash
npx playwright test tests/e2e/navigation.spec.ts
```

Expected: FAIL until the quick-filter markup and classes are available.

- [ ] **Step 3: Add compact user-filter classes to the page**

Use:

```tsx
<form className={`${styles.filterBar} ${styles.userFilterBar}`}>
```

Apply `styles.userFilterCompact` to country and region fields, and `styles.userFilterOwner` to the owner field.

- [ ] **Step 4: Implement desktop and narrow-screen CSS**

Add:

```css
.userFilterBar {
  flex-wrap: nowrap;
  gap: 8px;
}

.userFilterBar .fieldGrow {
  min-width: 220px;
}

.userFilterCompact {
  width: 126px;
  min-width: 126px;
}

.userFilterOwner {
  width: 168px;
  min-width: 168px;
}

.segmentQuickFieldset {
  display: grid;
  min-width: 276px;
  margin: 0;
  padding: 0;
  border: 0;
  gap: 6px;
}

.segmentQuickFieldset legend {
  padding: 0;
  color: #737d93;
  font-size: 13px;
  font-weight: 650;
}

.segmentQuickList {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.segmentQuickList::-webkit-scrollbar {
  display: none;
}

.segmentQuickButton {
  min-width: 32px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid #d9deea;
  border-radius: 999px;
  background: #f7f8fc;
  color: #4f5870;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.segmentQuickButton:first-child {
  min-width: 48px;
}

.segmentQuickButton:hover {
  border-color: #9aa5ee;
  color: #4f5fd4;
}

.segmentQuickButton:focus-visible {
  outline: 3px solid rgb(102 117 232 / 20%);
  outline-offset: 1px;
}

.segmentQuickButtonSelected {
  border-color: #5b6cdb;
  background: #5b6cdb;
  color: #ffffff;
}

@media (max-width: 1180px) {
  .userFilterBar {
    flex-wrap: wrap;
  }

  .segmentQuickFieldset {
    min-width: 276px;
  }
}
```

Include the quick buttons in the existing reduced-motion rule so state transitions are removed when requested.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test -- --reporter=dot
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Expected: all commands exit 0.

- [ ] **Step 6: Verify the live localhost page**

At `http://127.0.0.1:3101/users` confirm:

- desktop filter bar is one line;
- all eight quick filters are visible;
- `F` is selected after clicking;
- URL contains `segment=F`;
- no segment dropdown exists.

- [ ] **Step 7: Commit the responsive layout**

```bash
git add \
  recall-admin/src/app/'(dashboard)'/users/page.tsx \
  recall-admin/src/components/workspaces/workspace.module.css \
  recall-admin/tests/e2e/navigation.spec.ts
git commit -m "style: compact user filters"
```
