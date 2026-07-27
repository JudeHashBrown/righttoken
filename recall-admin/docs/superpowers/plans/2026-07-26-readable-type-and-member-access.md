# Readable Type and Member Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve admin readability and replace standalone invitations with RightToken-user access grants and revocation.

**Architecture:** Keep RightToken as the only identity provider. Resolve access grants against synchronized `UserProfile` rows, bind the resulting member to `externalUserId`, and soft-revoke access in a transaction that clears sessions and releases work. Apply a consistent minimum 12px product-UI type scale across dashboard CSS modules.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7, Vitest, CSS Modules.

## Global Constraints

- Business text must be at least 12px.
- Only synchronized RightToken users may receive recall access.
- Revocation must preserve main-site accounts and audit history.
- PRIMARY_ADMIN and the acting member cannot be revoked.
- Existing unrelated dirty-tree changes must be preserved.

---

### Task 1: Readable typography baseline

**Files:**
- Create: `tests/unit/config/typography-scale.test.ts`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `src/components/dashboard/dashboard.module.css`
- Modify: `src/components/layout/app-header.module.css`
- Modify: `src/components/layout/app-sidebar.module.css`
- Modify: `src/components/automation/segment-rule-editor.module.css`

**Interfaces:**
- Consumes: existing CSS module class names.
- Produces: the same class names with a minimum 12px business-text size.

- [ ] Write a test that scans the listed dashboard CSS modules and rejects `font-size` values below 12px.
- [ ] Run the test and confirm it fails on existing 7–11px declarations.
- [ ] Raise 7–10px declarations to 12px and 11–17px declarations by 2px.
- [ ] Run the typography test and existing component tests.

### Task 2: RightToken member access service

**Files:**
- Create: `tests/unit/auth/member-access.test.ts`
- Create: `src/modules/auth/member-access.ts`

**Interfaces:**
- Produces: `grantMemberAccess(actorId, email, role, store?)`.
- Produces: `revokeMemberAccess(actorId, targetId, store?)`.

- [ ] Write failing tests for synchronized-user enforcement, role boundaries, reactivation, self-protection, primary-admin protection, and released work counts.
- [ ] Run the focused test and confirm failures are caused by the missing module.
- [ ] Implement an injectable store interface plus a transactional Prisma default store.
- [ ] Run focused tests and confirm they pass.

### Task 3: Member access API and UI

**Files:**
- Modify: `tests/unit/components/member-invite-form.test.tsx`
- Create: `tests/unit/components/member-access-actions.test.tsx`
- Modify: `src/components/members/member-invite-form.tsx`
- Create: `src/components/members/member-access-actions.tsx`
- Create: `src/app/api/members/access/route.ts`
- Create: `src/app/api/members/[id]/access/route.ts`
- Modify: `src/app/(dashboard)/members/page.tsx`

**Interfaces:**
- `POST /api/members/access` accepts `{email, role}`.
- `DELETE /api/members/:id/access` revokes recall access.

- [ ] Update component tests to expect direct access granting and add failing revoke interaction tests.
- [ ] Run focused tests and confirm the current invitation UI fails the new expectations.
- [ ] Implement the new routes and UI while retaining permission-controlled role options.
- [ ] Run focused component tests and route-related type checks.

### Task 4: Full verification

**Files:**
- Verify only.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Start or reuse the local app and inspect `/members` plus representative dashboard/table pages.
