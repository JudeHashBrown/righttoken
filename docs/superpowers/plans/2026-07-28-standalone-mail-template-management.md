# Standalone Mail Template Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible mail template management entry and a standalone editor that works without a selected mail conversation.

**Architecture:** Add a `templates` mail workspace view and render a focused client-side template library from the existing server-loaded template data. Change the workspace query to return the latest unarchived version of every template key, while reply editors filter that list to enabled templates.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, CSS Modules, Vitest and Testing Library.

## Global Constraints

- No new database tables or migrations.
- PRIMARY_ADMIN, ADMIN and OPERATOR can create, update, enable and disable templates.
- Existing immutable template version behavior must remain unchanged.
- Disabled templates must remain visible in template management but must not appear in the reply-template tabs.
- Use existing button, input, textarea, tab and panel styles.

---

### Task 1: Standalone template library and mail entry

**Files:**
- Create: `recall-admin/src/components/mail/mail-template-library.tsx`
- Modify: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Modify: `recall-admin/src/components/mail/mail-reply-editor.tsx`
- Modify: `recall-admin/src/modules/mail/workspace-filter.ts`
- Modify: `recall-admin/src/modules/mail/workspace-query.ts`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Test: `recall-admin/tests/unit/components/mail-template-library.test.tsx`
- Test: `recall-admin/tests/unit/mail/workspace-filter.test.ts`
- Test: `recall-admin/tests/integration/mail/workspace-query.test.ts`

**Interfaces:**
- Consumes: existing `MailTemplateSummary`, `MailTemplateManager`, template create/version/toggle API routes and `MailWorkspaceData.templates`.
- Produces: `MailTemplateLibrary({ templates }): React.JSX.Element` and `MailWorkspaceView` value `"templates"`.

- [ ] **Step 1: Write failing component and filter tests**

Add a component test asserting that the standalone library renders without a mail thread, allows selecting an inactive template, exposes name/subject/body editors and shows “发布新版本” plus “启用模板”. Add a filter test asserting `view=templates` is accepted.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run tests/unit/components/mail-template-library.test.tsx tests/unit/mail/workspace-filter.test.ts
```

Expected: FAIL because `MailTemplateLibrary` and the `templates` view do not exist.

- [ ] **Step 3: Implement the standalone template library and fixed entry**

Create the client component with inline new-template form, editable selected template fields, immutable version publishing and enable/disable actions. Add “模板管理” and “返回邮件列表” links to the mail page and render the library when `filter.view === "templates"`.

- [ ] **Step 4: Return latest enabled and disabled template versions**

Change `getMailWorkspaceData` to return the latest unarchived version per template key. In `MailReplyEditor`, pass only `templates.filter(template => template.active)` to reply-template tabs so disabled templates never appear during a user reply.

- [ ] **Step 5: Verify GREEN and regression coverage**

Run:

```bash
npx vitest run tests/unit/components/mail-template-library.test.tsx tests/unit/mail/workspace-filter.test.ts tests/unit/components/mail-reply-editor.test.tsx
npm run typecheck
npm run lint
npm run test:integration
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add recall-admin
git commit -m "feat: add standalone mail template management"
```
