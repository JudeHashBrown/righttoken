# Real Mailbox Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make system settings reflect real saved mailboxes, remove Namecheap configuration, support multiple mailbox connections, and permanently erase connection credentials while preserving all mail history.

**Architecture:** Keep `Mailbox` as the durable identity referenced by historical messages and batches, while making its encrypted configuration nullable and marking credential removal with `configurationDeletedAt`. Centralize the definition of a usable mailbox, filter operational queries through it, expose a permission-protected DELETE route, and make the settings UI render live mailbox counts and per-mailbox actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Zod 4, Vitest, Testing Library, Playwright.

## Global Constraints

- Do not expose mailbox passwords, decrypted configuration, or full encrypted payloads in API responses, audit records, logs, or UI.
- New mailbox configurations accept only `WECOM_MAIL` and `CUSTOM`; existing encrypted `NAMECHEAP` configurations remain runtime-readable until removed.
- Removing a mailbox configuration must preserve `Mailbox`, `MailThread`, `MailMessage`, `MailBatch`, recipient results, and asset relationships.
- A removed configuration must not be usable for sending, receiving, testing, workers, notifications, or new mailbox selection.
- Re-adding the same email address must reactivate the existing `Mailbox` row and retain its history.
- All mutations require existing administrator permissions and same-origin CSRF validation.
- Use TDD for every behavior change and keep unrelated code untouched.

---

### Task 1: Persist credential removal without deleting mailbox identity

**Files:**
- Modify: `recall-admin/prisma/schema.prisma`
- Create: `recall-admin/prisma/migrations/20260803170000_preserve_mail_history_on_configuration_delete/migration.sql`
- Modify (generated): `recall-admin/src/generated/prisma/models/Mailbox.ts`
- Modify (generated): `recall-admin/src/generated/prisma/internal/prismaNamespace.ts`
- Modify (generated): `recall-admin/src/generated/prisma/internal/prismaNamespaceBrowser.ts`
- Modify (generated): `recall-admin/src/generated/prisma/internal/class.ts`
- Test: `recall-admin/tests/integration/mail/schema.test.ts`

**Interfaces:**
- Produces: nullable `Mailbox.encryptedConfig: string | null` and `Mailbox.configurationDeletedAt: Date | null`.
- Consumes: existing `Mailbox` relations and unique `emailAddress` identity.

- [ ] **Step 1: Write the failing schema test**

Add a test that creates a mailbox with `encryptedConfig: null`, `enabled: false`, and `configurationDeletedAt: now`, then reads it back and asserts the marker and nullable credential are persisted while the row remains available.

```ts
it("keeps a mailbox identity after its configuration is removed", async () => {
  const deletedAt = new Date();
  const mailbox = await prisma.mailbox.create({
    data: {
      name: "历史客服邮箱",
      emailAddress: `history-${randomUUID()}@example.test`,
      encryptedConfig: null,
      enabled: false,
      configurationDeletedAt: deletedAt
    }
  });

  expect(mailbox.encryptedConfig).toBeNull();
  expect(mailbox.configurationDeletedAt).toEqual(deletedAt);
});
```

- [ ] **Step 2: Run the focused integration test and verify RED**

Run: `npm run test:integration -- tests/integration/mail/schema.test.ts`

Expected: FAIL because `encryptedConfig` is required and `configurationDeletedAt` does not exist.

- [ ] **Step 3: Add the nullable credential and deletion marker**

Change the Prisma model fields to:

```prisma
encryptedConfig        String?
configurationDeletedAt DateTime?
```

Create the migration:

```sql
ALTER TABLE "recall"."Mailbox"
  ALTER COLUMN "encryptedConfig" DROP NOT NULL,
  ADD COLUMN "configurationDeletedAt" TIMESTAMP(3);

CREATE INDEX "Mailbox_configurationDeletedAt_enabled_idx"
  ON "recall"."Mailbox"("configurationDeletedAt", "enabled");
```

- [ ] **Step 4: Regenerate Prisma and verify GREEN**

Run: `npx prisma generate`

Run: `npm run test:integration -- tests/integration/mail/schema.test.ts`

Expected: PASS, including the new nullable-configuration test.

- [ ] **Step 5: Commit the schema change**

```bash
git add recall-admin/prisma recall-admin/src/generated/prisma recall-admin/tests/integration/mail/schema.test.ts
git commit -m "feat(recall): preserve mailbox identity after credential removal"
```

### Task 2: Define and enforce usable mailbox state

**Files:**
- Create: `recall-admin/src/modules/mail/mailbox-availability.ts`
- Create: `recall-admin/tests/unit/mail/mailbox-availability.test.ts`
- Modify: `recall-admin/src/modules/mail/mailbox-credentials.ts`
- Modify: `recall-admin/src/modules/admin/workspace-queries.ts`
- Modify: `recall-admin/src/modules/mail/workspace-query.ts`
- Modify: `recall-admin/src/modules/mail/reply-to-thread.ts`
- Modify: `recall-admin/src/modules/mail/send-reviewed-mail.ts`
- Modify: `recall-admin/src/modules/mail/sync-mailbox.ts`
- Modify: `recall-admin/src/modules/mail/create-mail-batch.ts`
- Modify: `recall-admin/src/worker/handlers/mail-sync.ts`
- Modify: `recall-admin/src/worker/handlers/notification-delivery.ts`
- Modify: `recall-admin/src/app/api/integrations/mailboxes/route.ts`

**Interfaces:**
- Produces: `configuredMailboxWhere: Prisma.MailboxWhereInput` and `isConfiguredMailbox({ encryptedConfig, configurationDeletedAt }): boolean`.
- Consumes: Task 1 fields.

- [ ] **Step 1: Write failing unit tests for mailbox availability**

```ts
describe("isConfiguredMailbox", () => {
  it("accepts a mailbox with encrypted credentials and no deletion marker", () => {
    expect(isConfiguredMailbox({
      encryptedConfig: "ciphertext",
      configurationDeletedAt: null
    })).toBe(true);
  });

  it("rejects a mailbox after configuration removal", () => {
    expect(isConfiguredMailbox({
      encryptedConfig: null,
      configurationDeletedAt: new Date()
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused unit test and verify RED**

Run: `npx vitest run tests/unit/mail/mailbox-availability.test.ts`

Expected: FAIL because `mailbox-availability.ts` does not exist.

- [ ] **Step 3: Implement the shared predicate and Prisma filter**

```ts
import type { Prisma } from "@/generated/prisma/client";

export const configuredMailboxWhere = {
  encryptedConfig: { not: null },
  configurationDeletedAt: null
} satisfies Prisma.MailboxWhereInput;

export function isConfiguredMailbox(mailbox: {
  encryptedConfig: string | null;
  configurationDeletedAt: Date | null;
}): boolean {
  return mailbox.encryptedConfig !== null &&
    mailbox.configurationDeletedAt === null;
}
```

- [ ] **Step 4: Filter every operational mailbox query**

Use `configuredMailboxWhere` in settings/API lists, composer/workspace lists, batch creation, worker sync, notification delivery, reply/send paths, and runtime configuration reads. For ID lookups use `findFirstOrThrow({ where: { id, ...configuredMailboxWhere } })`; do not alter historical detail queries that need to display removed mailbox names.

Update `getMailboxRuntimeConfig` to reject a null credential before decryption:

```ts
if (!mailbox.encryptedConfig) {
  throw new Error("MAILBOX_CONFIGURATION_REMOVED");
}
```

Update `saveMailboxCredential` so an upsert update restores the row:

```ts
update: {
  name,
  encryptedConfig,
  configurationDeletedAt: null,
  enabled: input.enabled,
  lastErrorCode: null
}
```

- [ ] **Step 5: Run focused and regression tests**

Run: `npx vitest run tests/unit/mail/mailbox-availability.test.ts tests/unit/components/mail-composer.test.tsx`

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit availability enforcement**

```bash
git add recall-admin/src/modules/mail recall-admin/src/modules/admin/workspace-queries.ts recall-admin/src/worker recall-admin/src/app/api/integrations/mailboxes/route.ts recall-admin/tests/unit/mail
git commit -m "feat(recall): exclude removed mailbox configurations"
```

### Task 3: Remove credentials transactionally and preserve history

**Files:**
- Modify: `recall-admin/src/modules/mail/mailbox-credentials.ts`
- Create: `recall-admin/src/app/api/integrations/mailboxes/[id]/route.ts`
- Create: `recall-admin/tests/integration/mail/mailbox-configuration-delete.test.ts`
- Modify: `recall-admin/src/modules/presentation/audit.ts`

**Interfaces:**
- Produces: `removeMailboxConfiguration(actorId: string, mailboxId: string): Promise<{ id: string }>`.
- Produces: `DELETE /api/integrations/mailboxes/:id` returning `{ mailbox: { id } }` with status 200.
- Consumes: Task 1 schema and Task 2 availability filter.

- [ ] **Step 1: Write failing service integration tests**

Create an administrator, mailbox, user, thread, message, and mail batch. Call `removeMailboxConfiguration` and assert:

```ts
expect(updated.encryptedConfig).toBeNull();
expect(updated.enabled).toBe(false);
expect(updated.configurationDeletedAt).toBeInstanceOf(Date);
expect(await prisma.mailThread.count({ where: { mailboxId } })).toBe(1);
expect(await prisma.mailMessage.count({ where: { mailboxId } })).toBe(1);
expect(await prisma.mailBatch.count({ where: { mailboxId } })).toBe(1);
expect(audit.action).toBe("mailbox.configuration_deleted");
expect(JSON.stringify(audit.metadata)).not.toContain("ciphertext");
```

Add a second test that calls the function twice and expects `MailboxConfigurationNotFoundError` on the second call.

- [ ] **Step 2: Run the focused integration test and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mailbox-configuration-delete.test.ts`

Expected: FAIL because the removal service and error class do not exist.

- [ ] **Step 3: Implement the transactional removal service**

Add `MailboxConfigurationNotFoundError` and implement one `$transaction` that finds a configured mailbox, counts its historical relations, updates only credential/state fields, and creates the audit log.

```ts
export class MailboxConfigurationNotFoundError extends Error {}

export async function removeMailboxConfiguration(
  actorId: string,
  mailboxId: string
): Promise<{ id: string }> {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("integrations:manage");
  }
  assertMemberPermission(actor, "integrations:manage");

  return prisma.$transaction(async (tx) => {
    const mailbox = await tx.mailbox.findFirst({
      where: { id: mailboxId, ...configuredMailboxWhere },
      select: { id: true, emailAddress: true, enabled: true }
    });
    if (!mailbox) throw new MailboxConfigurationNotFoundError();

    const [threads, messages, batches] = await Promise.all([
      tx.mailThread.count({ where: { mailboxId } }),
      tx.mailMessage.count({ where: { mailboxId } }),
      tx.mailBatch.count({ where: { mailboxId } })
    ]);
    await tx.mailbox.update({
      where: { id: mailboxId },
      data: {
        encryptedConfig: null,
        configurationDeletedAt: new Date(),
        enabled: false,
        lastTestedAt: null,
        lastSuccessAt: null,
        lastErrorCode: null,
        lastSyncedAt: null
      }
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "mailbox.configuration_deleted",
        entityType: "Mailbox",
        entityId: mailboxId,
        metadata: {
          emailDomain: mailbox.emailAddress.split("@")[1] ?? "unknown",
          previouslyEnabled: mailbox.enabled,
          preservedThreads: threads,
          preservedMessages: messages,
          preservedBatches: batches
        }
      }
    });
    return { id: mailboxId };
  });
}
```

- [ ] **Step 4: Implement the DELETE route and stable responses**

Use `assertSameOrigin`, `requireRequestPermission(request, "integrations:manage")`, and the service above. Return 401/403 consistently with sibling integration routes, 404 with `MAILBOX_CONFIGURATION_NOT_FOUND`, and 400 with `MAILBOX_CONFIGURATION_DELETE_FAILED` for unexpected failures.

- [ ] **Step 5: Verify service and route behavior GREEN**

Run: `npm run test:integration -- tests/integration/mail/mailbox-configuration-delete.test.ts`

Expected: PASS for preservation, auditing, authorization, 404, and credential removal cases.

- [ ] **Step 6: Commit the deletion API**

```bash
git add recall-admin/src/modules/mail/mailbox-credentials.ts recall-admin/src/app/api/integrations/mailboxes recall-admin/src/modules/presentation/audit.ts recall-admin/tests/integration/mail/mailbox-configuration-delete.test.ts
git commit -m "feat(recall): remove mailbox credentials without deleting history"
```

### Task 4: Render settings from real mailbox data and remove Namecheap

**Files:**
- Create: `recall-admin/src/modules/admin/settings-overview.ts`
- Create: `recall-admin/tests/unit/admin/settings-overview.test.ts`
- Modify: `recall-admin/src/modules/admin/workspace-queries.ts`
- Modify: `recall-admin/src/app/(dashboard)/settings/page.tsx`
- Modify: `recall-admin/src/components/settings/mailbox-settings-form.tsx`
- Modify: `recall-admin/tests/unit/components/mailbox-settings-form.test.tsx`
- Modify: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Modify: `recall-admin/README.md`

**Interfaces:**
- Produces: `buildMailboxIntegrationSummary(mailboxes: Array<{ enabled: boolean }>): { name: "客服邮箱"; configured: boolean; detail: string }`.
- Consumes: Task 2 configured-only mailbox query.

- [ ] **Step 1: Write failing overview and form tests**

Overview assertions:

```ts
expect(buildMailboxIntegrationSummary([])).toEqual({
  name: "客服邮箱",
  configured: false,
  detail: "尚未添加邮箱"
});
expect(buildMailboxIntegrationSummary([
  { enabled: true }, { enabled: false }
])).toEqual({
  name: "客服邮箱",
  configured: true,
  detail: "已添加 2 个邮箱，1 个已启用"
});
```

Form assertions:

```ts
expect(screen.queryByText(/Namecheap/i)).not.toBeInTheDocument();
expect(screen.queryByDisplayValue("mail.privateemail.com")).not.toBeInTheDocument();
expect(screen.getByLabelText("邮箱类型")).toHaveValue("WECOM_MAIL");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run tests/unit/admin/settings-overview.test.ts tests/unit/components/mailbox-settings-form.test.tsx`

Expected: FAIL because the summary helper is missing and the form still defaults to Namecheap.

- [ ] **Step 3: Implement real overview data**

Use `buildMailboxIntegrationSummary(mailboxes)` as the first integration entry. Render `integration.detail` directly instead of deriving generic copy from `configured`. Keep enterprise WeChat app and robot status backed by their existing credentials/environment checks.

- [ ] **Step 4: Remove Namecheap from the form and user-facing copy**

Change the provider schema/type to `z.enum(["WECOM_MAIL", "CUSTOM"])`, remove the Namecheap option, set `defaultValue="WECOM_MAIL"`, default connection name to `企业微信邮箱`, remove `mail.privateemail.com` defaults, and change the heading/button copy to “新增邮箱连接”/“保存邮箱连接”. Update the mail empty state and README to say “企业微信邮箱或其他 SMTP/IMAP 邮箱”.

- [ ] **Step 5: Verify tests GREEN**

Run: `npx vitest run tests/unit/admin/settings-overview.test.ts tests/unit/components/mailbox-settings-form.test.tsx`

Run: `rg -n "Namecheap|mail\.privateemail\.com" recall-admin/src recall-admin/README.md`

Expected: tests PASS; search returns no production UI or README matches (historical specs/tests may still contain the term).

- [ ] **Step 6: Commit real settings UI**

```bash
git add recall-admin/src/modules/admin recall-admin/src/app recall-admin/src/components/settings recall-admin/tests/unit/admin recall-admin/tests/unit/components/mailbox-settings-form.test.tsx recall-admin/README.md
git commit -m "feat(recall): show real mailbox settings state"
```

### Task 5: Add guarded delete interaction

**Files:**
- Modify: `recall-admin/src/components/settings/mailbox-actions.tsx`
- Modify: `recall-admin/tests/unit/components/mailbox-actions.test.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`

**Interfaces:**
- Produces: `MailboxActions({ mailboxId, mailboxName })` with test, sync, and delete actions.
- Consumes: Task 3 DELETE route.

- [ ] **Step 1: Write failing confirmation tests**

Add tests for cancellation and confirmation:

```ts
vi.spyOn(window, "confirm").mockReturnValue(false);
fireEvent.click(screen.getByRole("button", { name: "删除邮箱" }));
expect(fetchMock).not.toHaveBeenCalled();

vi.spyOn(window, "confirm").mockReturnValue(true);
fireEvent.click(screen.getByRole("button", { name: "删除邮箱" }));
await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
  "/api/integrations/mailboxes/mailbox-1",
  { method: "DELETE" }
));
```

Assert the confirmation text says credentials are permanently removed while historical mail and batch records remain.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npx vitest run tests/unit/components/mailbox-actions.test.tsx`

Expected: FAIL because “删除邮箱” is absent.

- [ ] **Step 3: Implement delete UI states**

Extend `busy` with `"delete"`, add the danger button, call `window.confirm`, send DELETE only after confirmation, show “正在删除” while pending, map 404 to “邮箱配置已不存在”, map other failures to “邮箱配置删除失败，原有数据未改变”, and call `router.refresh()` on success. Disable test/sync/delete together while any action is pending.

- [ ] **Step 4: Verify component tests GREEN**

Run: `npx vitest run tests/unit/components/mailbox-actions.test.tsx`

Expected: PASS for existing test/sync behaviors and new cancel/success/failure delete behaviors.

- [ ] **Step 5: Commit delete interaction**

```bash
git add recall-admin/src/components/settings/mailbox-actions.tsx recall-admin/src/components/workspaces/workspace.module.css recall-admin/tests/unit/components/mailbox-actions.test.tsx
git commit -m "feat(recall): add confirmed mailbox credential removal"
```

### Task 6: Full verification and visual QA

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified feature ready for review.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: all unit tests PASS with no unhandled errors.

- [ ] **Step 2: Run relevant integration tests**

Run: `npm run test:integration -- tests/integration/mail/schema.test.ts tests/integration/mail/mailbox-credentials.test.ts tests/integration/mail/mailbox-configuration-delete.test.ts tests/integration/mail/workspace-query.test.ts tests/integration/worker/mail-sync.test.ts`

Expected: all selected integration tests PASS and preserve mail history.

- [ ] **Step 3: Run static verification**

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 4: Verify the settings page visually**

Start the existing development server, open `/settings` as an administrator, and verify desktop and narrow mobile widths. Confirm no Namecheap UI remains, real mailbox counts match the list, the form has no Namecheap defaults, delete confirmation explicitly preserves history, and controls remain readable without overlap.

- [ ] **Step 5: Review the final diff and commit any verification fix**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors and only intended files changed. If verification required a fix, stage only those files and commit with `fix(recall): complete mailbox settings verification`.
