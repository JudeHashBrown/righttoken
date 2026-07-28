# Return to Main Site Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compact “返回主站” control to the recall admin header that returns authorized users to the RightToken dashboard using an environment-specific URL.

**Architecture:** The server dashboard layout resolves the main-site dashboard URL from validated environment configuration and passes it to the client header. The header renders a same-tab anchor beside the notification control, with icon-and-text on desktop and icon-only presentation on narrow screens.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Zod, Vitest, Testing Library.

---

## Task 1: Add validated dashboard URL configuration

**Files:**
- Modify: `recall-admin/src/lib/env/server.ts`
- Create: `recall-admin/src/modules/integrations/righttoken/dashboard-url.ts`
- Modify: `recall-admin/tests/unit/env/server.test.ts`
- Create: `recall-admin/tests/unit/integrations/righttoken-dashboard-url.test.ts`
- Modify: `recall-admin/.env.example`
- Modify: `deploy/recall.env.example`
- Modify: `deploy/docker-compose.recall.yml`
- Modify: `recall-admin/docs/deployment.md`

**Step 1: Write the failing tests**

Add an environment parsing assertion:

```ts
it("accepts an explicit RightToken dashboard URL", () => {
  const env = parseServerEnv({
    ...baseEnv,
    RIGHTTOKEN_DASHBOARD_URL: "https://righttoken.ai/dashboard",
  });

  expect(env.RIGHTTOKEN_DASHBOARD_URL).toBe("https://righttoken.ai/dashboard");
});
```

Add resolver tests:

```ts
describe("resolveRightTokenDashboardUrl", () => {
  it("uses the configured URL when provided", () => {
    expect(
      resolveRightTokenDashboardUrl({
        DEPLOYMENT_ENV: "production",
        RIGHTTOKEN_DASHBOARD_URL: "https://console.example.com/dashboard",
      }),
    ).toBe("https://console.example.com/dashboard");
  });

  it("uses the local dashboard by default in local development", () => {
    expect(resolveRightTokenDashboardUrl({ DEPLOYMENT_ENV: "local" })).toBe(
      "http://127.0.0.1:3002/dashboard",
    );
  });

  it("uses the RightToken dashboard by default in production", () => {
    expect(resolveRightTokenDashboardUrl({ DEPLOYMENT_ENV: "production" })).toBe(
      "https://righttoken.ai/dashboard",
    );
  });
});
```

**Step 2: Run the focused tests and confirm they fail**

Run:

```bash
cd recall-admin
npm test -- --run tests/unit/env/server.test.ts tests/unit/integrations/righttoken-dashboard-url.test.ts
```

Expected: FAIL because `RIGHTTOKEN_DASHBOARD_URL` and the resolver do not exist.

**Step 3: Implement the minimum configuration**

Extend the server environment schema:

```ts
RIGHTTOKEN_DASHBOARD_URL: z.string().url().optional(),
```

Create the resolver:

```ts
type DashboardUrlEnvironment = {
  DEPLOYMENT_ENV: "local" | "production";
  RIGHTTOKEN_DASHBOARD_URL?: string;
};

export function resolveRightTokenDashboardUrl(env: DashboardUrlEnvironment) {
  if (env.RIGHTTOKEN_DASHBOARD_URL) {
    return env.RIGHTTOKEN_DASHBOARD_URL;
  }

  return env.DEPLOYMENT_ENV === "local"
    ? "http://127.0.0.1:3002/dashboard"
    : "https://righttoken.ai/dashboard";
}
```

Document and wire:

```dotenv
RIGHTTOKEN_DASHBOARD_URL=http://127.0.0.1:3002/dashboard
RECALL_RIGHTTOKEN_DASHBOARD_URL=https://righttoken.ai/dashboard
```

Pass the deployment variable into the recall web container:

```yaml
RIGHTTOKEN_DASHBOARD_URL: ${RECALL_RIGHTTOKEN_DASHBOARD_URL:-https://righttoken.ai/dashboard}
```

**Step 4: Run the focused tests and confirm they pass**

Run:

```bash
cd recall-admin
npm test -- --run tests/unit/env/server.test.ts tests/unit/integrations/righttoken-dashboard-url.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add recall-admin/src/lib/env/server.ts recall-admin/src/modules/integrations/righttoken/dashboard-url.ts recall-admin/tests/unit/env/server.test.ts recall-admin/tests/unit/integrations/righttoken-dashboard-url.test.ts recall-admin/.env.example deploy/recall.env.example deploy/docker-compose.recall.yml recall-admin/docs/deployment.md
git commit -m "configure main dashboard return URL"
```

## Task 2: Add the compact header return control

**Files:**
- Modify: `recall-admin/tests/unit/components/app-header.test.tsx`
- Modify: `recall-admin/src/components/layout/app-header.tsx`
- Modify: `recall-admin/src/components/layout/app-header.module.css`
- Modify: `recall-admin/src/app/(dashboard)/layout.tsx`

**Step 1: Write the failing component test**

Render the header with a main-site URL:

```tsx
render(
  <AppHeader
    memberName="主管理员"
    urgentCount={0}
    mainSiteUrl="https://righttoken.ai/dashboard"
  />,
);
```

Assert that the same-tab control exists:

```ts
const returnLink = screen.getByRole("link", { name: "返回主站" });
expect(returnLink).toHaveAttribute("href", "https://righttoken.ai/dashboard");
expect(returnLink).not.toHaveAttribute("target");
```

**Step 2: Run the focused component test and confirm it fails**

Run:

```bash
cd recall-admin
npm test -- --run tests/unit/components/app-header.test.tsx
```

Expected: FAIL because `AppHeader` does not accept `mainSiteUrl` and does not render the link.

**Step 3: Implement the header control**

Add the prop and render a standard anchor before the notification control:

```tsx
type AppHeaderProps = {
  memberName: string;
  urgentCount: number;
  mainSiteUrl: string;
};

<a
  className={styles.mainSiteLink}
  href={mainSiteUrl}
  aria-label="返回主站"
  title="返回主站"
>
  <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.9} />
  <span className={styles.mainSiteLabel}>返回主站</span>
</a>
```

Resolve the URL in the server layout:

```tsx
const mainSiteUrl = resolveRightTokenDashboardUrl(getServerEnv());

<AppHeader
  memberName={member.displayName}
  urgentCount={snapshot.metrics.urgent}
  mainSiteUrl={mainSiteUrl}
/>
```

Style it as a compact secondary action:

```css
.mainSiteLink {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid #d9deea;
  border-radius: 9px;
  background: #fff;
  color: #4c566f;
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}
```

On screens up to 700px, hide the label and keep a 36×36 icon control.

**Step 4: Run focused and full recall-admin verification**

Run:

```bash
cd recall-admin
npm test -- --run tests/unit/components/app-header.test.tsx
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Expected: all commands PASS.

**Step 5: Validate the user flow in localhost**

Start or reuse the local recall admin and main-site frontend. Open the recall admin, verify that:

1. “返回主站” appears between the page context and notification/account controls.
2. The desktop control shows the left-arrow icon and text.
3. Clicking it navigates in the same tab to the configured RightToken dashboard.
4. A narrow viewport keeps the icon control and removes only the visible text.

**Step 6: Commit**

```bash
git add recall-admin/tests/unit/components/app-header.test.tsx recall-admin/src/components/layout/app-header.tsx recall-admin/src/components/layout/app-header.module.css 'recall-admin/src/app/(dashboard)/layout.tsx'
git commit -m "add return to main site header control"
```

