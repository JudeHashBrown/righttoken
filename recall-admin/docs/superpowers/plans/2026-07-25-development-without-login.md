# Development Without Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every local development page and API usable without login, passwords, cookies, CSRF, 2FA, logout, or reauthentication while preserving a real primary-admin actor for permissions and audit records.

**Architecture:** `AUTH_MODE=development` resolves the active primary administrator directly from PostgreSQL and returns a synthetic verified session context to existing business services. Browser route protection and same-origin authentication checks become no-ops only in development mode; future production identity remains isolated behind `AUTH_MODE=righttoken`.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, Vitest, Playwright.

## Global Constraints

- Local development must never redirect to login or 2FA.
- Production must never silently fall back to development identity.
- Permission checks and real `Member.id` audit attribution remain active.
- RightToken internal event secret validation remains unchanged.
- Existing unrelated working-tree changes must be preserved.

---

### Task 1: Development identity provider

**Files:**
- Modify: `src/lib/env/server.ts`
- Modify: `src/modules/auth/guards.ts`
- Modify: `.env`
- Modify: `.env.example`
- Test: `tests/unit/config/server-env.test.ts`
- Test: `tests/unit/auth/guards.test.ts`

**Interfaces:**
- Produces: `AUTH_MODE: "development" | "righttoken"`.
- Produces: `getCurrentMember(): Promise<Member>` in development when an active primary administrator exists.
- Produces: `requireRequestPermission(request, permission): Promise<SessionContext>` with a synthetic, fully verified development session.

- [ ] **Step 1: Write failing tests**

Add tests proving that `AUTH_MODE=development` is accepted and defaults locally, and that no-cookie development requests resolve the active primary administrator while preserving permission checks.

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npx vitest run tests/unit/config/server-env.test.ts tests/unit/auth/guards.test.ts
```

Expected: failure because `development` is not an accepted auth mode and anonymous requests currently return `null` or throw `UnauthorizedError`.

- [ ] **Step 3: Implement development identity**

Change the environment enum to `["development", "righttoken"]`. In `guards.ts`, when `AUTH_MODE === "development"`, query the active `PRIMARY_ADMIN` member and return it. For request guards, return the same member with a synthetic session whose ID is `development-session`, expiry is in the future, `reauthenticatedAt` is current, and second factor is already verified.

- [ ] **Step 4: Verify tests pass**

Run the same focused Vitest command and expect all tests to pass.

### Task 2: Remove browser login barriers

**Files:**
- Modify: `src/proxy.ts`
- Create: `src/app/page.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/2fa/setup/page.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/modules/admin/page-access.ts`
- Test: `tests/unit/auth/proxy.test.ts`
- Test: `tests/e2e/navigation.spec.ts`

**Interfaces:**
- Consumes: development identity from Task 1.
- Produces: `/`, `/login`, and `/2fa/setup` redirect to `/dashboard`.
- Produces: all dashboard routes render without cookies.

- [ ] **Step 1: Write failing route tests**

Change proxy expectations so anonymous dashboard navigation proceeds. Add browser assertions that an empty browser context can open `/dashboard`, `/tasks`, and `/automation/segments` without visiting `/login`.

- [ ] **Step 2: Verify failures**

Run:

```bash
npx vitest run tests/unit/auth/proxy.test.ts
npx playwright test tests/e2e/navigation.spec.ts
```

Expected: proxy and browser tests fail due to login redirection.

- [ ] **Step 3: Remove navigation guards**

Make `proxy()` pass through application routes. Redirect the three obsolete entry routes to `/dashboard`. Remove fallback login redirects from dashboard layout and page-access helpers.

- [ ] **Step 4: Verify route tests pass**

Run the focused proxy and navigation tests and expect direct dashboard access.

### Task 3: Remove login controls and reauthentication

**Files:**
- Modify: `src/components/layout/app-header.tsx`
- Modify: `src/components/members/member-invite-form.tsx`
- Modify: `src/app/(dashboard)/members/page.tsx`
- Modify: `src/app/api/members/invitations/route.ts`
- Modify: `src/modules/auth/csrf.ts`
- Test: `tests/unit/components/app-header.test.tsx`
- Test: `tests/unit/components/member-invite-form.test.tsx`
- Test: `tests/unit/auth/csrf.test.ts`

**Interfaces:**
- Consumes: synthetic verified development session from Task 1.
- Produces: header without logout.
- Produces: member invitation without password, 2FA, or reauthentication request.
- Produces: `assertSameOrigin()` bypass only when `AUTH_MODE=development`.

- [ ] **Step 1: Write failing UI and API tests**

Assert that logout, password, 2FA, and `/api/auth/reauthenticate` calls are absent. Assert development mutations accept missing `Origin`, while `righttoken` mode still rejects invalid origin.

- [ ] **Step 2: Verify failures**

Run:

```bash
npx vitest run tests/unit/components/app-header.test.tsx tests/unit/components/member-invite-form.test.tsx tests/unit/auth/csrf.test.ts
```

Expected: failures on existing logout and reauthentication controls.

- [ ] **Step 3: Implement the minimal removals**

Remove the logout form, password and code fields, and reauthentication fetch. Remove 2FA/session metrics from the members page. Let invitation creation use the already-authorized development actor without recent-reauthentication enforcement. Make CSRF bypass conditional on development mode.

- [ ] **Step 4: Verify focused tests pass**

Run the same Vitest command and expect all focused tests to pass.

### Task 4: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/runbooks/local-development.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `tests/e2e/segment-rule-workflow.spec.ts`
- Modify: `tests/e2e/task-workflow.spec.ts`

**Interfaces:**
- Produces: local instructions containing no test login credentials.
- Produces: cookie-free E2E workflows.

- [ ] **Step 1: Remove E2E session setup**

Delete test session inserts and cookie injection from browser tests while keeping test members needed for assignment scenarios.

- [ ] **Step 2: Update documentation**

Document direct local access on port `3101`, automatic primary-admin identity, and future `righttoken` production identity.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run worker:build
npm run build
npm run test:e2e
git diff --check
```

Expected: all commands pass with zero failures.

- [ ] **Step 4: Browser handoff**

Open `http://127.0.0.1:3101/automation/segments` in a clean browser context and verify it renders without `/login`.
