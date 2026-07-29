# User-Facing Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every visible surface in the recall admin uses clear business language and never exposes backend enums, error codes, storage terms, or rule-engine wording.

**Architecture:** Keep API and persistence values unchanged, and translate them through focused presentation helpers before rendering. Rewrite static page copy by workflow, then enforce the boundary with unit tests and a source-level UI copy audit.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Playwright.

## Global Constraints

- Backend enums, error codes, database terms, queue terms, and rule-engine implementation details must not be directly visible.
- Unknown machine values must use safe generic copy and must never fall back to the raw value.
- Required connection fields remain available but use task-oriented labels.
- Existing permissions and business rules remain unchanged.

---

### Task 1: Presentation Vocabulary

**Files:**
- Create: `recall-admin/src/modules/presentation/status.ts`
- Create: `recall-admin/src/modules/presentation/events.ts`
- Create: `recall-admin/src/modules/presentation/errors.ts`
- Test: `recall-admin/tests/unit/presentation/status.test.ts`
- Test: `recall-admin/tests/unit/presentation/events.test.ts`
- Test: `recall-admin/tests/unit/presentation/errors.test.ts`

**Interfaces:**
- Consumes: machine values returned by existing services and page queries.
- Produces: `presentTaskStatus`, `presentRunStatus`, `presentUserEvent`, and `presentUserError`.

- [ ] Write failing tests for known and unknown values, including the requirement that unknown values never echo the input.
- [ ] Run the focused presentation tests and confirm they fail because the helpers do not exist.
- [ ] Implement the minimum mapping helpers.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Static UI Copy Audit Guard

**Files:**
- Create: `recall-admin/tests/unit/config/user-facing-copy.test.ts`

**Interfaces:**
- Consumes: visible string literals in `src/app/**/*.tsx` and `src/components/**/*.tsx`.
- Produces: a failing build-time guard for forbidden user-visible backend language.

- [ ] Write a source audit test for raw status/error tokens and forbidden implementation phrases.
- [ ] Run it and confirm it fails on the current pages.
- [ ] Add narrow exclusions for request payloads, comparisons, form values, element IDs, and advanced connection help.
- [ ] Keep the test failing until visible copy is rewritten.

### Task 3: User and Task Workflows

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/users/page.tsx`
- Modify: `recall-admin/src/app/(dashboard)/users/[id]/page.tsx`
- Modify: `recall-admin/src/components/tables/user-table.tsx`
- Modify: `recall-admin/src/app/(dashboard)/tasks/page.tsx`
- Modify: `recall-admin/src/app/(dashboard)/tasks/[id]/page.tsx`
- Modify: `recall-admin/src/components/tables/task-table.tsx`
- Modify: `recall-admin/src/components/tasks/task-actions.tsx`
- Modify: `recall-admin/src/components/dashboard/priority-task-table.tsx`
- Test: existing component and presentation tests.

**Interfaces:**
- Consumes: Task 1 presentation helpers.
- Produces: user and task pages containing business-readable states, events, locations, payments, and actions.

- [ ] Extend tests with the required user-facing copy.
- [ ] Run focused tests and confirm the new expectations fail.
- [ ] Replace raw events, status fallbacks, “用户 360”, and backend fact language.
- [ ] Run focused tests and confirm they pass.

### Task 4: Segmentation, Assignment, and Notifications

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/automation/segments/page.tsx`
- Modify: `recall-admin/src/components/automation/segment-rule-editor.tsx`
- Modify: `recall-admin/src/app/(dashboard)/automation/assignment/page.tsx`
- Modify: `recall-admin/src/components/automation/assignment-rule-editor.tsx`
- Modify: `recall-admin/src/components/automation/location-rule-editor.tsx`
- Modify: `recall-admin/src/app/(dashboard)/automation/notifications/page.tsx`
- Modify: `recall-admin/src/components/automation/notification-policy-editor.tsx`
- Test: existing automation component tests.

**Interfaces:**
- Consumes: existing rule models without changing their machine representation.
- Produces: business-language editors for grouping, ownership, location recognition, and notifications.

- [ ] Add failing copy expectations for scheme history, user regrouping, filter labels, ownership, and notification wording.
- [ ] Rewrite static and dynamic messages without changing request payloads or comparisons.
- [ ] Replace raw run-status rendering with Task 1 helpers.
- [ ] Run automation tests and confirm they pass.

### Task 5: Mail Workflows

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Modify: `recall-admin/src/components/mail/*.tsx`
- Modify: `recall-admin/src/components/settings/mailbox-settings-form.tsx`
- Modify: `recall-admin/src/components/settings/mailbox-actions.tsx`
- Test: existing mail component tests.

**Interfaces:**
- Consumes: existing mailbox, message, template, and error data.
- Produces: customer-service language for inbox, replies, templates, sending, connection status, and recovery.

- [ ] Add failing expectations for friendly mailbox fields, connection messages, template history, and unknown send errors.
- [ ] Rewrite copy and route errors through the presentation error helper.
- [ ] Keep necessary protocol abbreviations only in advanced helper text.
- [ ] Run all mail component tests and confirm they pass.

### Task 6: Dashboard, Reports, Members, Settings, and Authentication

**Files:**
- Modify: `recall-admin/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `recall-admin/src/components/dashboard/*.tsx`
- Modify: `recall-admin/src/app/(dashboard)/reports/page.tsx`
- Modify: `recall-admin/src/app/(dashboard)/members/page.tsx`
- Modify: `recall-admin/src/components/members/*.tsx`
- Modify: `recall-admin/src/app/(dashboard)/settings/page.tsx`
- Modify: `recall-admin/src/components/settings/wecom-settings-form.tsx`
- Modify: `recall-admin/src/app/(auth)/**/*.tsx`
- Modify: `recall-admin/src/app/2fa/setup/page.tsx`
- Test: existing page and component tests.

**Interfaces:**
- Consumes: existing query results, permissions, and connection state.
- Produces: consistent business-language remaining pages.

- [ ] Add failing expectations for workflow-oriented labels and safe errors.
- [ ] Rewrite all remaining visible implementation language.
- [ ] Run the related component tests and confirm they pass.

### Task 7: Full Verification

**Files:**
- Modify only files required by failures discovered during verification.

**Interfaces:**
- Consumes: all changes from Tasks 1–6.
- Produces: a verified build with no forbidden user-visible backend language.

- [ ] Run `npm test`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run the relevant Playwright navigation and workflow tests.
- [ ] Review the final diff against every requirement in the design document.
