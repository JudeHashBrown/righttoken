# B Group Operations Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent B-group operations workspace where authorized operators can find checkout-started unpaid users and manage email, contact details, one-time USD 1.43 coupons, and maintenance history without leaving the page.

**Architecture:** Add user-owned contact, coupon, and maintenance records to the recall database; derive the current B-group episode from `SegmentHistory`; and expose focused services/API routes used by one server-rendered workspace with client-side inline editors. Reuse `MailMessage`, `MailBatchRecipient`, mail delivery synchronization, existing authorization helpers, and the existing RightToken integration boundary.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Zod 4, CSS Modules, Vitest/Testing Library, Playwright.

## Global Constraints

- B-group eligibility is `currentSegment = B`, source user not deleted, and within the viewer's authorized user scope.
- The left queue is approximately 176 px wide and sorts newest checkout/B-group entry first with null timestamps last.
- Email and maintenance editors expand to the full available right-side workspace width.
- Contact details persist across segment changes; email and maintenance completion are scoped to the current segment episode; coupon completion is permanent.
- A USD 1.43 coupon can be successfully granted at most once per user.
- Knowledge-sharing and product-update emails create idempotent maintenance records only after successful send.
- A missing coupon integration must surface as unavailable and must never create a false successful grant.
- Phone numbers must not appear in application logs or error metadata.
- Reuse existing permission and suppression checks; do not bypass `mail:send-reviewed` or `tasks:work`.
- UI copy is Chinese and must not expose internal rule versions, database fields, secret configuration, or stack traces.

---

## File Structure

**Create**

- `prisma/migrations/20260806150000_add_b_group_operations/migration.sql` — persistence for contacts, maintenance records, coupon grants, and mail purpose.
- `src/modules/b-group/types.ts` — page DTOs and progress types.
- `src/modules/b-group/current-episode.ts` — current segment-episode boundary calculation.
- `src/modules/b-group/workspace-query.ts` — authorized B-group queue/detail query.
- `src/modules/b-group/contact-service.ts` — validate and persist WeChat/TG/phone data.
- `src/modules/b-group/maintenance-service.ts` — manual and mail-derived maintenance creation.
- `src/modules/b-group/coupon-service.ts` — idempotent USD 1.43 coupon orchestration.
- `src/modules/b-group/coupon-issuer.ts` — real HTTP issuer availability and request contract.
- `src/app/api/b-group/users/[id]/contact/route.ts` — contact update endpoint.
- `src/app/api/b-group/users/[id]/maintenance/route.ts` — manual maintenance endpoint.
- `src/app/api/b-group/users/[id]/coupon/route.ts` — one-time coupon endpoint.
- `src/app/(dashboard)/groups/b/page.tsx` — server page and initial data loading.
- `src/components/b-group/b-group-workspace.tsx` — queue selection/search and detail shell.
- `src/components/b-group/b-group-progress.tsx` — compact five-step progress chain.
- `src/components/b-group/b-group-mail-panel.tsx` — full-width embedded mail composer wrapper.
- `src/components/b-group/b-group-contact-panel.tsx` — contact editor.
- `src/components/b-group/b-group-coupon-panel.tsx` — coupon confirmation/result UI.
- `src/components/b-group/b-group-maintenance-panel.tsx` — full-width manual form and record list.
- `src/components/b-group/b-group.module.css` — page-specific responsive styling.
- `tests/unit/b-group/current-episode.test.ts`
- `tests/unit/b-group/workspace-query.test.ts`
- `tests/unit/b-group/contact-service.test.ts`
- `tests/unit/b-group/maintenance-service.test.ts`
- `tests/unit/b-group/coupon-service.test.ts`
- `tests/unit/components/b-group-workspace.test.tsx`
- `tests/integration/b-group-operations.test.ts`
- `tests/e2e/b-group-workspace.spec.ts`

**Modify**

- `prisma/schema.prisma` — new enums/models/relations and mail-purpose fields.
- `src/modules/mail/send-request-schema.ts` — accept mail purpose.
- `src/modules/mail/send-reviewed-mail.ts` — store purpose and create mail-derived maintenance after successful send.
- `src/modules/mail/process-mail-batch.ts` — pass batch purpose into per-user send.
- `src/modules/mail/create-mail-batch.ts` — persist purpose.
- `src/components/mail/mail-composer.tsx` — allow embedded fixed-user mode and purpose selection.
- `src/components/layout/app-sidebar.tsx` — add B-group navigation under overview.
- `src/components/layout/app-header.tsx` — map `/groups/b` to the B-group title.
- `tests/unit/components/app-sidebar.test.tsx`
- `tests/unit/components/app-header.test.tsx`
- `tests/e2e/navigation.spec.ts`

---

### Task 1: Persistence model and generated client

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260806150000_add_b_group_operations/migration.sql`
- Test: `tests/integration/b-group-operations.test.ts`

**Interfaces:**
- Produces: `MailPurpose`, `MaintenanceSource`, `CouponGrantStatus`, `UserContact`, `UserMaintenanceRecord`, and `CouponGrant` Prisma types.
- Produces: unique `UserContact.userId`, unique `UserMaintenanceRecord.sourceMessageId`, and unique `CouponGrant.userId` constraints.

- [ ] **Step 1: Write the failing schema integration assertions**

```ts
it("persists one contact, one coupon grant, and idempotent mail maintenance per user", async () => {
  const contact = await prisma.userContact.create({
    data: { userId, wechatId: "righttoken-user", updatedById: memberId }
  });
  expect(contact.wechatId).toBe("righttoken-user");

  await prisma.couponGrant.create({
    data: { userId, requestedById: memberId, amountMinor: 143, currency: "USD", idempotencyKey: `b143:${userId}`, status: "PENDING" }
  });
  await expect(prisma.couponGrant.create({
    data: { userId, requestedById: memberId, amountMinor: 143, currency: "USD", idempotencyKey: `b143-duplicate:${userId}`, status: "PENDING" }
  })).rejects.toMatchObject({ code: "P2002" });
});
```

- [ ] **Step 2: Run the integration test and verify missing models fail**

Run: `npm run test:integration -- tests/integration/b-group-operations.test.ts`

Expected: FAIL because the Prisma models do not exist.

- [ ] **Step 3: Add exact schema models and enums**

```prisma
enum MailPurpose {
  PAYMENT_FOLLOW_UP
  KNOWLEDGE_SHARE
  PRODUCT_UPDATE
  CAMPAIGN
  OTHER
  @@schema("recall")
}

enum MaintenanceSource {
  MANUAL
  MAIL
  @@schema("recall")
}

enum CouponGrantStatus {
  PENDING
  SUCCEEDED
  FAILED
  @@schema("recall")
}

model UserContact {
  id               String   @id @default(cuid())
  userId           String   @unique
  wechatId         String?
  telegramHandle   String?
  phoneCountryCode String?
  phoneNumber      String?
  updatedById      String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  user      UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  updatedBy Member      @relation("UserContactUpdater", fields: [updatedById], references: [id], onDelete: Restrict)
  @@schema("recall")
}

model UserMaintenanceRecord {
  id              String            @id @default(cuid())
  userId          String
  source          MaintenanceSource
  sourceMessageId String?           @unique
  actorId         String?
  occurredAt      DateTime
  body            String
  createdAt       DateTime          @default(now())
  user          UserProfile  @relation(fields: [userId], references: [id], onDelete: Cascade)
  sourceMessage MailMessage? @relation(fields: [sourceMessageId], references: [id], onDelete: SetNull)
  actor         Member?      @relation("MaintenanceActor", fields: [actorId], references: [id], onDelete: SetNull)
  @@index([userId, occurredAt])
  @@schema("recall")
}

model CouponGrant {
  id               String            @id @default(cuid())
  userId           String            @unique
  requestedById    String
  amountMinor      Int
  currency         String
  idempotencyKey   String            @unique
  status           CouponGrantStatus @default(PENDING)
  externalCouponId String?
  failureCode      String?
  grantedAt        DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  user        UserProfile @relation(fields: [userId], references: [id], onDelete: Restrict)
  requestedBy Member      @relation("CouponGrantRequester", fields: [requestedById], references: [id], onDelete: Restrict)
  @@schema("recall")
}
```

Add the corresponding relations, add `purpose MailPurpose @default(OTHER)` to `MailMessage` and `MailBatch`, and create SQL with matching PostgreSQL enums, columns, foreign keys, indexes, and unique constraints.

- [ ] **Step 4: Generate the client and run the schema test**

Run: `npx prisma generate && npm run test:integration -- tests/integration/b-group-operations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260806150000_add_b_group_operations/migration.sql tests/integration/b-group-operations.test.ts src/generated/prisma
git commit -m "feat: add B group operations persistence"
```

### Task 2: Current segment episode and B-group workspace query

**Files:**
- Create: `src/modules/b-group/types.ts`
- Create: `src/modules/b-group/current-episode.ts`
- Create: `src/modules/b-group/workspace-query.ts`
- Test: `tests/unit/b-group/current-episode.test.ts`
- Test: `tests/unit/b-group/workspace-query.test.ts`

**Interfaces:**
- Produces: `currentSegmentEpisodeStartedAt(user): Date`.
- Produces: `getBGroupWorkspace(viewer, query, selectedUserId): Promise<BGroupWorkspaceData>`.
- Consumes: existing `authorizedUserScope`, `SegmentHistory`, mail messages, contact, coupon, and maintenance records.

- [ ] **Step 1: Write failing episode and progress tests**

```ts
expect(currentSegmentEpisodeStartedAt({
  currentSegment: "B",
  registeredAt: new Date("2026-08-01T00:00:00Z"),
  segmentHistory: [
    { toSegment: "B", changedAt: new Date("2026-08-03T00:00:00Z") },
    { toSegment: "C", changedAt: new Date("2026-08-02T00:00:00Z") },
    { toSegment: "B", changedAt: new Date("2026-08-01T12:00:00Z") }
  ]
})).toEqual(new Date("2026-08-03T00:00:00Z"));
```

```ts
expect(progress.mailComplete).toBe(true);
expect(progress.maintenanceComplete).toBe(false);
expect(progress.contactComplete).toBe(true);
expect(progress.couponComplete).toBe(true);
```

- [ ] **Step 2: Run the unit tests and verify failure**

Run: `npm test -- tests/unit/b-group/current-episode.test.ts tests/unit/b-group/workspace-query.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement episode and DTO boundaries**

```ts
export function currentSegmentEpisodeStartedAt(input: {
  currentSegment: SegmentCode;
  registeredAt: Date;
  segmentHistory: Array<{ toSegment: SegmentCode; changedAt: Date }>;
}): Date {
  return input.segmentHistory
    .filter((entry) => entry.toSegment === input.currentSegment)
    .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())[0]
    ?.changedAt ?? input.registeredAt;
}
```

Define `BGroupWorkspaceData` with `users`, `selectedUser`, `episodeStartedAt`, `progress`, `mailStats`, `contact`, `coupon`, and `maintenanceRecords`. Query only authorized current B users, search by numeric sequence/external ID or case-insensitive email, order by `checkoutStartedAt desc nulls last`, and compute current-episode mail/maintenance completion.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/unit/b-group/current-episode.test.ts tests/unit/b-group/workspace-query.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/b-group tests/unit/b-group/current-episode.test.ts tests/unit/b-group/workspace-query.test.ts
git commit -m "feat: query B group operations workspace"
```

### Task 3: Contact and manual maintenance writes

**Files:**
- Create: `src/modules/b-group/contact-service.ts`
- Create: `src/modules/b-group/maintenance-service.ts`
- Create: `src/app/api/b-group/users/[id]/contact/route.ts`
- Create: `src/app/api/b-group/users/[id]/maintenance/route.ts`
- Test: `tests/unit/b-group/contact-service.test.ts`
- Test: `tests/unit/b-group/maintenance-service.test.ts`

**Interfaces:**
- Produces: `saveUserContact(actorId, userId, input)`.
- Produces: `addManualMaintenanceRecord(actorId, userId, input)`.
- Produces: `recordMailMaintenance(messageId)` used by Task 4.

- [ ] **Step 1: Write failing validation and authorization tests**

```ts
await expect(saveUserContact(actorId, userId, {
  wechatId: "",
  telegramHandle: " ",
  phoneCountryCode: "",
  phoneNumber: ""
})).rejects.toThrow("CONTACT_METHOD_REQUIRED");

expect(normalizeContact({ telegramHandle: "  @righttoken  ", phoneCountryCode: " 65 ", phoneNumber: "1234 5678" }))
  .toMatchObject({ telegramHandle: "@righttoken", phoneCountryCode: "+65", phoneNumber: "12345678" });
```

```ts
const record = await addManualMaintenanceRecord(actorId, userId, {
  occurredAt: "2026-08-06",
  body: "用户表示周五再次尝试支付"
});
expect(record.source).toBe("MANUAL");
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/unit/b-group/contact-service.test.ts tests/unit/b-group/maintenance-service.test.ts`

Expected: FAIL because the services do not exist.

- [ ] **Step 3: Implement normalized writes and audit logs**

```ts
export const contactInputSchema = z.object({
  wechatId: z.string().trim().max(100).nullable(),
  telegramHandle: z.string().trim().max(100).nullable(),
  phoneCountryCode: z.string().trim().regex(/^\+?\d{1,4}$/).nullable(),
  phoneNumber: z.string().trim().regex(/^\d{5,20}$/).nullable()
}).superRefine((value, ctx) => {
  if (!value.wechatId && !value.telegramHandle && !value.phoneNumber) {
    ctx.addIssue({ code: "custom", message: "CONTACT_METHOD_REQUIRED" });
  }
});
```

Both services must load the actor and user in a transaction, apply the same operator ownership/task authorization used by `addUserNote`, write an audit log without phone plaintext, and return display-safe DTOs. Manual maintenance accepts a Shanghai-calendar date, stores the corresponding timestamp, trims content to 2,000 characters, and records the actor.

- [ ] **Step 4: Implement CSRF-protected API routes**

Use `assertSameOrigin`, `requireRequestPermission(request, "tasks:work")`, strict Zod parsing, 201/200 success responses, and stable codes: `INVALID_CONTACT`, `CONTACT_SAVE_FAILED`, `INVALID_MAINTENANCE`, and `MAINTENANCE_SAVE_FAILED`.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/b-group/contact-service.test.ts tests/unit/b-group/maintenance-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/b-group/contact-service.ts src/modules/b-group/maintenance-service.ts src/app/api/b-group tests/unit/b-group/contact-service.test.ts tests/unit/b-group/maintenance-service.test.ts
git commit -m "feat: save B group contacts and maintenance"
```

### Task 4: Mail purpose and automatic maintenance synchronization

**Files:**
- Modify: `src/modules/mail/send-request-schema.ts`
- Modify: `src/modules/mail/send-reviewed-mail.ts`
- Modify: `src/modules/mail/create-mail-batch.ts`
- Modify: `src/modules/mail/process-mail-batch.ts`
- Modify: `src/components/mail/mail-composer.tsx`
- Test: `tests/unit/b-group/maintenance-service.test.ts`
- Test: existing mail unit/integration suites affected by request shapes.

**Interfaces:**
- Consumes: `recordMailMaintenance(messageId)` from Task 3.
- Produces: successful knowledge/product messages with exactly one linked maintenance record.

- [ ] **Step 1: Add failing mail synchronization tests**

```ts
await recordMailMaintenance(knowledgeMessage.id);
await recordMailMaintenance(knowledgeMessage.id);
expect(await prisma.userMaintenanceRecord.count({
  where: { sourceMessageId: knowledgeMessage.id }
})).toBe(1);

await recordMailMaintenance(paymentFollowUpMessage.id);
expect(await prisma.userMaintenanceRecord.count({
  where: { sourceMessageId: paymentFollowUpMessage.id }
})).toBe(0);
```

- [ ] **Step 2: Run affected tests and verify failure**

Run: `npm test -- tests/unit/b-group/maintenance-service.test.ts tests/unit/modules/mail`

Expected: FAIL because purpose is not stored and auto-maintenance is absent.

- [ ] **Step 3: Thread `purpose` through direct and batch mail**

Add `purpose: z.enum(["PAYMENT_FOLLOW_UP", "KNOWLEDGE_SHARE", "PRODUCT_UPDATE", "CAMPAIGN", "OTHER"]).default("OTHER")` to send/batch schemas. Persist it on `MailBatch`, pass it through `processMailBatch`, and persist it on each `MailMessage`. Expose a labeled purpose select in `MailComposer` with Chinese choices.

- [ ] **Step 4: Create maintenance only after successful send**

After the final `MailMessage` update to `SENT`, call `recordMailMaintenance(message.id)`. The function returns without writing unless purpose is `KNOWLEDGE_SHARE` or `PRODUCT_UPDATE`, status is sent, and `userId` is present. Use the unique `sourceMessageId` constraint plus upsert to guarantee idempotency.

- [ ] **Step 5: Run mail and maintenance tests**

Run: `npm test -- tests/unit/b-group/maintenance-service.test.ts tests/unit/modules/mail`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/mail src/components/mail/mail-composer.tsx tests/unit/b-group/maintenance-service.test.ts tests/unit/modules/mail
git commit -m "feat: sync maintenance from successful mail"
```

### Task 5: Safe one-time coupon issuance

**Files:**
- Create: `src/modules/b-group/coupon-issuer.ts`
- Create: `src/modules/b-group/coupon-service.ts`
- Create: `src/app/api/b-group/users/[id]/coupon/route.ts`
- Test: `tests/unit/b-group/coupon-service.test.ts`

**Interfaces:**
- Produces: `getCouponIssuer(): CouponIssuer | null`.
- Produces: `grantBGroupCoupon(actorId, userId, issuer)` returning `SUCCEEDED`, `FAILED`, or `UNAVAILABLE`.
- HTTP contract: POST configured endpoint with `{ externalUserId, amountMinor: 143, currency: "USD", idempotencyKey }`, expect `{ couponId: string }`.

- [ ] **Step 1: Write failing idempotency and unavailable tests**

```ts
expect(await grantBGroupCoupon(actorId, userId, null)).toEqual({ status: "UNAVAILABLE" });
expect(await prisma.couponGrant.count({ where: { userId } })).toBe(0);

const first = await grantBGroupCoupon(actorId, userId, fakeIssuer);
const second = await grantBGroupCoupon(actorId, userId, fakeIssuer);
expect(first.status).toBe("SUCCEEDED");
expect(second).toMatchObject({ status: "SUCCEEDED", alreadyGranted: true });
expect(fakeIssuer.issue).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/unit/b-group/coupon-service.test.ts`

Expected: FAIL because coupon services do not exist.

- [ ] **Step 3: Implement the issuer and transaction state machine**

Read `RIGHTTOKEN_COUPON_ENDPOINT` and `RIGHTTOKEN_COUPON_TOKEN`; return `null` unless both exist. Never log the token or phone/contact data. Create a PENDING row before the external call, use `b-group-143:<userId>` as the idempotency key, update to SUCCEEDED with `externalCouponId` and `grantedAt`, or FAILED with a stable non-sensitive failure code. On unique conflict, return the existing grant and never call the issuer twice for an existing SUCCEEDED record.

- [ ] **Step 4: Implement the API route**

Require same origin and `tasks:work`. Return 503 `COUPON_SERVICE_UNAVAILABLE`, 200 for already granted, 201 for newly granted, and 502 `COUPON_GRANT_FAILED` for external failure.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/unit/b-group/coupon-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/b-group/coupon-issuer.ts src/modules/b-group/coupon-service.ts src/app/api/b-group/users/[id]/coupon/route.ts tests/unit/b-group/coupon-service.test.ts
git commit -m "feat: add one-time B group coupon grant"
```

### Task 6: B-group page and inline operation panels

**Files:**
- Create: `src/app/(dashboard)/groups/b/page.tsx`
- Create: `src/components/b-group/b-group-workspace.tsx`
- Create: `src/components/b-group/b-group-progress.tsx`
- Create: `src/components/b-group/b-group-mail-panel.tsx`
- Create: `src/components/b-group/b-group-contact-panel.tsx`
- Create: `src/components/b-group/b-group-coupon-panel.tsx`
- Create: `src/components/b-group/b-group-maintenance-panel.tsx`
- Create: `src/components/b-group/b-group.module.css`
- Test: `tests/unit/components/b-group-workspace.test.tsx`

**Interfaces:**
- Consumes: `getBGroupWorkspace`, contact/maintenance/coupon APIs, and embedded `MailComposer` fixed to the selected user.
- Produces: `/groups/b` page and responsive master-detail workspace.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<BGroupWorkspace initialData={fixture} mailComposerConfig={mailConfig} />);
expect(screen.getByRole("heading", { name: "已发起支付但未完成" })).toBeInTheDocument();
expect(screen.getByPlaceholderText("关键词或序号")).toBeInTheDocument();
expect(screen.getByText("#10428")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /登记联系方式/ })).toHaveAttribute("data-complete", "true");
```

Add interactions that select another user, filter by email/sequence, open only one full-width panel at a time, save contact, add a maintenance record, show coupon unavailable, and preserve entered form content on request failure.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- tests/unit/components/b-group-workspace.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the server page and workspace state**

`page.tsx` calls `requireWorkspaceMember("/groups/b")`, parses `q` and `userId`, loads workspace data plus enabled mailboxes/templates, and renders the client workspace. The workspace keeps a 176 px queue, selects the first visible user by default, and uses URL search parameters so reload/back navigation preserves selection and search.

- [ ] **Step 4: Implement compact progress and full-width panels**

Render the identity plus four operation buttons with arrow separators. Apply success styling from server-derived progress, use `aria-expanded`/`aria-controls`, and display one panel at a time. Contact uses WeChat/TG/country code/phone fields; coupon confirms USD 1.43; maintenance has date/content form and a full-width descending list; mail reuses the composer in fixed-user embedded mode.

- [ ] **Step 5: Implement responsive and accessible states**

Use existing design tokens, 150–200 ms state transitions, visible focus rings, non-color completion indicators, skeleton/empty/error states, wrapping steps without arrows below the desktop breakpoint, and no fixed max-width on mail/maintenance panels.

- [ ] **Step 6: Run component tests**

Run: `npm test -- tests/unit/components/b-group-workspace.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/groups/b src/components/b-group tests/unit/components/b-group-workspace.test.tsx
git commit -m "feat: build B group operations workspace"
```

### Task 7: Navigation and end-to-end behavior

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/app-header.tsx`
- Modify: `tests/unit/components/app-sidebar.test.tsx`
- Modify: `tests/unit/components/app-header.test.tsx`
- Modify: `tests/e2e/navigation.spec.ts`
- Create: `tests/e2e/b-group-workspace.spec.ts`

**Interfaces:**
- Produces: discoverable B-group navigation and browser-level workflow coverage.

- [ ] **Step 1: Add failing navigation tests**

```ts
expect(screen.getByRole("link", { name: "B组" })).toHaveAttribute("href", "/groups/b");
expect(titleForPath("/groups/b")).toBe("B组 · 已发起支付但未完成");
```

- [ ] **Step 2: Run navigation tests and verify failure**

Run: `npm test -- tests/unit/components/app-sidebar.test.tsx tests/unit/components/app-header.test.tsx`

Expected: FAIL because the route is absent from navigation/title mappings.

- [ ] **Step 3: Add the nested B-group navigation item and title mapping**

Place “B组” directly after “用户运营概览” in the operations group. Keep `/dashboard` active only on the overview and `/groups/b` active only on B-group page.

- [ ] **Step 4: Add browser workflow coverage**

Test that an authorized operator can open `/groups/b`, search/select a user, open contact and maintenance panels without navigation, save a manual record, and see completion state. Test coupon unavailable behavior without integration credentials and confirm no false “已送” state.

- [ ] **Step 5: Run navigation and E2E tests**

Run: `npm test -- tests/unit/components/app-sidebar.test.tsx tests/unit/components/app-header.test.tsx && npm run test:e2e -- tests/e2e/navigation.spec.ts tests/e2e/b-group-workspace.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout tests/unit/components/app-sidebar.test.tsx tests/unit/components/app-header.test.tsx tests/e2e/navigation.spec.ts tests/e2e/b-group-workspace.spec.ts
git commit -m "feat: add B group workspace navigation"
```

### Task 8: Full verification and visual QA

**Files:**
- Modify only files needed to fix verification findings within this feature.

**Interfaces:**
- Produces: a release-ready B-group workspace with verified migration, types, behavior, accessibility, and responsive layout.

- [ ] **Step 1: Apply the migration to the development database**

Run: `npm run db:deploy`

Expected: migration `20260806150000_add_b_group_operations` applied successfully.

- [ ] **Step 2: Run static checks and unit tests**

Run: `npm run typecheck && npm run lint && npm test`

Expected: all commands exit 0.

- [ ] **Step 3: Run integration and production build checks**

Run: `npm run test:integration && npm run build && npm run worker:build`

Expected: all commands exit 0.

- [ ] **Step 4: Run focused E2E tests**

Run: `npm run test:e2e -- tests/e2e/navigation.spec.ts tests/e2e/b-group-workspace.spec.ts`

Expected: all selected browser tests pass.

- [ ] **Step 5: Inspect the live page at desktop and narrow widths**

Run the development server, open `/groups/b`, and verify at 1440×900 and 820×1180 that the queue is compact, progress pills do not overflow, arrows disappear when wrapping, full-width panels use available space, keyboard focus is visible, and no internal implementation copy appears.

- [ ] **Step 6: Run final diff checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended feature files changed.

- [ ] **Step 7: Commit final verification fixes**

```bash
git add prisma src tests
git commit -m "fix: harden B group operations workspace"
```
