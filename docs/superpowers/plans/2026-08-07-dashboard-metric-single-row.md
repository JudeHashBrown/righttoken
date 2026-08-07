# Dashboard Metric Single-Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all six administrator dashboard metric cards fit on one wide-desktop row while preserving readable responsive layouts.

**Architecture:** Keep the existing `DashboardOverview` and `MetricCard` component structure unchanged. Add a CSS contract test, then adjust only the dashboard CSS grid, card density, and responsive breakpoints; verify the resulting page in the running local browser.

**Tech Stack:** Next.js 16, React 19, CSS Modules, Vitest, Testing Library, in-app browser.

## Global Constraints

- Wide desktop shows six equal-width metric columns; the five-card operator view fills the same row naturally.
- Medium desktop uses three columns and narrow tablet uses two columns.
- Mobile retains the existing horizontal card scroller.
- Card links, focus behavior, hover behavior, color tones, semantics, and dashboard data stay unchanged.
- Supporting text remains readable and may wrap to two lines; no text may overflow or be clipped.
- Use the existing visual language and introduce no dependencies.

---

### Task 1: Add the responsive metric-layout contract and compact styling

**Files:**
- Create: `recall-admin/tests/unit/config/dashboard-metric-layout.test.ts`
- Modify: `recall-admin/src/components/dashboard/dashboard.module.css:17-170, 413-439`

**Interfaces:**
- Consumes: `.metrics`, `.metric`, `.metricIcon`, `.metricCopy`, and the existing responsive CSS rules.
- Produces: a six-column wide-desktop metric grid, compact card dimensions, three-column and two-column intermediate layouts, and the existing mobile scroller.

- [ ] **Step 1: Write the failing CSS contract test**

Create `recall-admin/tests/unit/config/dashboard-metric-layout.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard metric layout", () => {
  it("keeps six compact metrics on one wide-desktop row", async () => {
    const css = await readFile(
      path.resolve("src/components/dashboard/dashboard.module.css"),
      "utf8"
    );

    expect(css).toContain(
      "grid-template-columns: repeat(6, minmax(0, 1fr));"
    );
    expect(css).toContain("min-height: 112px;");
    expect(css).toContain("gap: 12px;");
    expect(css).toContain("padding: 16px;");
    expect(css).toContain("width: 34px;");
    expect(css).toContain("height: 34px;");
  });

  it("steps down to three and two columns before mobile scrolling", async () => {
    const css = await readFile(
      path.resolve("src/components/dashboard/dashboard.module.css"),
      "utf8"
    );

    expect(css).toMatch(
      /@media \(max-width: 1320px\)[\s\S]*?\.metrics \{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.metrics \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.metrics \{[\s\S]*?display: flex;/
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/config/dashboard-metric-layout.test.ts
```

Expected: FAIL because the current stylesheet uses `auto-fit`, `126px`, `14px`, `19px`, and `38px` rather than the approved compact values.

- [ ] **Step 3: Implement the minimal CSS change**

Update the base rules in `dashboard.module.css`:

```css
.metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.metric {
  display: flex;
  min-height: 112px;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid #e3e6ee;
  border-radius: 12px;
  background: #ffffff;
  color: inherit;
  padding: 16px;
  text-decoration: none;
}

.metricIcon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
}
```

Replace the current responsive metric rules with:

```css
@media (max-width: 1320px) {
  .metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1180px) {
  .primaryGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .dashboard {
    padding: 20px 16px 28px;
  }

  .metrics {
    display: flex;
    margin-inline: -16px;
    overflow-x: auto;
    padding: 0 16px 4px;
    scroll-snap-type: x mandatory;
  }

  .metric {
    min-width: 220px;
    scroll-snap-align: start;
  }
}
```

Do not modify the JSX or data flow.

- [ ] **Step 4: Run focused and component tests**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/config/dashboard-metric-layout.test.ts tests/unit/components/dashboard.test.tsx tests/unit/config/typography-scale.test.ts
```

Expected: 3 test files pass with zero failures.

- [ ] **Step 5: Run static checks**

Run:

```bash
cd recall-admin
npm run typecheck
npm run lint
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the implementation**

```bash
git add recall-admin/src/components/dashboard/dashboard.module.css recall-admin/tests/unit/config/dashboard-metric-layout.test.ts
git commit -m "fix: keep dashboard metrics on one row"
```

### Task 2: Verify layout behavior in the running application

**Files:**
- Verify: `recall-admin/src/components/dashboard/dashboard.module.css`
- Verify: `recall-admin/src/components/dashboard/dashboard-overview.tsx`

**Interfaces:**
- Consumes: the local development server at `http://localhost:3000/dashboard`.
- Produces: browser evidence that six cards share one row on wide desktop and responsive fallbacks remain usable.

- [ ] **Step 1: Open the dashboard and inspect the wide-desktop layout**

Open `http://localhost:3000/dashboard` at the browser's normal wide viewport. Verify all six administrator metric cards have matching top positions, no labels or notes overflow, and the cards remain clickable.

- [ ] **Step 2: Inspect intermediate and mobile widths**

Use temporary viewport overrides at approximately 1200px, 850px, and 390px. Verify the metric region displays three columns, two columns, and a horizontal mobile scroller respectively. Reset the viewport override afterward.

- [ ] **Step 3: Re-run the layout detector**

Run:

```bash
node /Users/meichaoqun/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout recall-admin/src/components/dashboard/dashboard.module.css recall-admin/src/components/dashboard/dashboard-overview.tsx recall-admin/src/components/dashboard/metric-card.tsx
```

Expected: `[]`.

- [ ] **Step 4: Confirm repository scope**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated changes remain; the implementation files are committed.
