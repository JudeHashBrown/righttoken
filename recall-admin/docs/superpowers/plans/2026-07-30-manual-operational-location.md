# Manual Operational Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators manually confirm and lock a user's operational location without removing the independent ability to override that user's owner.

**Architecture:** Persist an `AUTO | MANUAL` location mode on `UserProfile`, protect manual locations in every automated write path, and add a transactional location service for manual confirmation and automatic restoration. Reuse the existing assignment engine and open-task transfer behavior so an automatic owner follows the effective location while a manually locked owner remains unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Zod 4, Vitest, Testing Library.

## Global Constraints

- Location mode and owner mode are independent.
- Automated events and batch recalculation must never overwrite a manual location.
- Confirming or restoring a location immediately recalculates only an automatically assigned owner.
- Owner changes and open-task transfers occur in the same transaction as the location change.
- Completed and cancelled tasks retain historical assignees.
- Only active primary administrators and administrators can change location.
- The existing assignment rule engine remains the only owner-routing source.
- Use inline progressive editing and the existing workspace form controls; do not add a modal.

---

### Task 1: Persist and present location mode

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730120000_add_location_assignment_state/migration.sql`
- Modify: `src/modules/users/presentation.ts`
- Test: `tests/unit/users/presentation.test.ts`

**Interfaces:**
- Produces: Prisma enum `LocationAssignmentMode = AUTO | MANUAL`.
- Produces: `locationAssignmentMode`, `locationAssignedAt`, `locationAssignedById`, `locationAssignmentReason` on `UserProfile`.
- Produces: `locationAssignmentLabel(mode): "系统判定" | "人工确认"`.

- [ ] **Step 1: Add a failing presentation test**

```ts
expect(locationAssignmentLabel("AUTO")).toBe("系统判定");
expect(locationAssignmentLabel("MANUAL")).toBe("人工确认");
```

- [ ] **Step 2: Verify the focused test fails**

Run: `npx vitest run tests/unit/users/presentation.test.ts`

Expected: FAIL because `locationAssignmentLabel` is not exported.

- [ ] **Step 3: Add the enum, fields, relations, index, and migration**

```prisma
enum LocationAssignmentMode {
  AUTO
  MANUAL

  @@schema("recall")
}

model Member {
  locationAssignmentsMade UserProfile[] @relation("UserLocationAssigner")
}

model UserProfile {
  locationAssignmentMode   LocationAssignmentMode @default(AUTO)
  locationAssignedAt       DateTime?
  locationAssignedById     String?
  locationAssignmentReason String?
  locationAssignedBy Member? @relation("UserLocationAssigner", fields: [locationAssignedById], references: [id], onDelete: SetNull)

  @@index([locationAssignmentMode, countryCode, region])
}
```

The SQL migration creates the enum, adds the four columns, foreign key and index without rewriting existing effective location values.

- [ ] **Step 4: Implement the label helper**

```ts
export function locationAssignmentLabel(
  mode: "AUTO" | "MANUAL"
): string {
  return mode === "MANUAL" ? "人工确认" : "系统判定";
}
```

- [ ] **Step 5: Generate Prisma types and verify**

Run: `npx prisma generate && npx vitest run tests/unit/users/presentation.test.ts && npm run typecheck`

Expected: Prisma generation succeeds, focused test passes, and TypeScript exits with code 0.

---

### Task 2: Add the transactional manual-location service

**Files:**
- Create: `src/modules/users/location-errors.ts`
- Create: `src/modules/users/user-location-service.ts`
- Modify: `src/modules/users/user-owner-service.ts`
- Create: `src/modules/users/transfer-open-user-tasks.ts`
- Test: `tests/unit/users/user-location-service.test.ts`
- Modify: `tests/unit/users/user-owner-service.test.ts`

**Interfaces:**
- Produces: `manuallyAssignUserLocation(input): Promise<LocationChangeResult>`.
- Produces: `restoreAutomaticUserLocation(input, dependencies?): Promise<LocationChangeResult>`.
- Produces: `transferOpenUserTasks(tx, input): Promise<number>`.
- Consumes: `assignUserOwnerInTransaction`, `recalculateStoredUserLocation`, active location rules and the GeoIP resolver.

- [ ] **Step 1: Write failing service tests**

Cover these separate behaviors with transaction-client fakes:

```ts
it("locks a manual location and recalculates an automatic owner", async () => {
  // AUTO owner: expect countryCode/region and MANUAL location metadata,
  // assignUserOwnerInTransaction(..., { forceAutomatic: true }),
  // open-task transfer and user.location_manually_assigned audit.
});

it("keeps a manually assigned owner when location changes", async () => {
  // MANUAL owner: expect no assignment-engine call and no task transfer.
});

it("restores an automatic location from stored source facts", async () => {
  // Expect effective location AUTO metadata and automatic-owner recalculation.
});
```

- [ ] **Step 2: Verify the service tests fail because the service is missing**

Run: `npx vitest run tests/unit/users/user-location-service.test.ts`

Expected: FAIL resolving `@/modules/users/user-location-service`.

- [ ] **Step 3: Extract reusable open-task transfer**

Move the existing open-status query, task update and `task.transferred` activity creation from `user-owner-service.ts` into:

```ts
export async function transferOpenUserTasks(
  tx: TransactionClient,
  input: {
    userId: string;
    actorId: string;
    ownerId: string;
    reason: string;
    now: Date;
  }
): Promise<number>;
```

Keep existing owner-service behavior and tests unchanged.

- [ ] **Step 4: Implement manual confirmation**

Normalize `countryCode` with `trim().toUpperCase()`, normalize an empty region to `null`, require a non-empty reason, lock the user row, validate the actor, update location metadata, and:

```ts
const shouldReassignOwner =
  user.ownerAssignmentMode === "AUTO";
```

When true, run the existing assignment engine with `forceAutomatic: true`, then transfer open tasks only if the owner changed.

- [ ] **Step 5: Implement automatic restoration**

Decrypt the stored registration IP, load active location rules, call `recalculateStoredUserLocation`, save the automatic result, clear manual attribution fields, and apply the same owner-mode rule as manual confirmation.

- [ ] **Step 6: Verify services**

Run: `npx vitest run tests/unit/users/user-location-service.test.ts tests/unit/users/user-owner-service.test.ts && npm run typecheck`

Expected: all focused tests pass and TypeScript exits with code 0.

---

### Task 3: Expose the administrator-only location API

**Files:**
- Create: `src/app/api/users/[id]/location/route.ts`
- Test: `tests/unit/users/user-location-route.test.ts`

**Interfaces:**
- Consumes: `manuallyAssignUserLocation`, `restoreAutomaticUserLocation`.
- Produces: `PATCH /api/users/:id/location` and `DELETE /api/users/:id/location`.

- [ ] **Step 1: Write failing route tests**

```ts
it("confirms a location for an administrator", async () => {
  // PATCH { countryCode: "cn", region: " 广东 ", reason: "客户确认" }
  // expects normalized service input and a 200 result.
});

it("rejects an invalid country or empty reason", async () => {
  // expects 400 INVALID_LOCATION_CHANGE and no service call.
});

it("restores automatic location determination", async () => {
  // DELETE expects restoreAutomaticUserLocation and a 200 result.
});
```

- [ ] **Step 2: Verify the route tests fail because the route is missing**

Run: `npx vitest run tests/unit/users/user-location-route.test.ts`

Expected: FAIL resolving the new route.

- [ ] **Step 3: Implement validation, permission and error mapping**

Use:

```ts
const locationSchema = z.object({
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/u),
  region: z.string().trim().max(120).optional(),
  reason: z.string().trim().min(1).max(500)
}).strict();
```

Require same-origin requests and `operators:manage`. Map authorization to 401/403, missing/deleted users to 404, invalid state conflicts to 409, validation to 400 and unexpected failures to a non-technical error code.

- [ ] **Step 4: Verify the route**

Run: `npx vitest run tests/unit/users/user-location-route.test.ts && npm run typecheck`

Expected: focused tests pass and TypeScript exits with code 0.

---

### Task 4: Protect manual locations from automated writes

**Files:**
- Modify: `src/modules/users/apply-event.ts`
- Modify: `src/worker/handlers/location-recalculation.ts`
- Modify: `tests/integration/users/ingest-event.test.ts`
- Create or modify: `tests/unit/worker/location-recalculation.test.ts`

**Interfaces:**
- Consumes: `UserProfile.locationAssignmentMode`.
- Preserves: original IP facts may update while effective manual `countryCode` and `region` stay locked.

- [ ] **Step 1: Add failing ingestion and batch tests**

```ts
it("does not overwrite a manually confirmed location from a later profile event", async () => {
  // User MANUAL CN/广东 receives a newer US/California source event.
  // Effective location remains CN/广东; other profile facts still update.
});

it("skips a manual location during batch recalculation without failing the run", async () => {
  // Resolver returns another country; effective location stays unchanged;
  // processed/succeeded counters advance and no automatic owner call occurs.
});
```

- [ ] **Step 2: Verify both new tests fail for the expected overwrite**

Run: `npm run test:integration -- tests/integration/users/ingest-event.test.ts`

Run: `npx vitest run tests/unit/worker/location-recalculation.test.ts`

Expected: assertions show manual effective location is overwritten.

- [ ] **Step 3: Gate event effective-location writes**

In `applyFacts`, write `countryCode`, `region`, `locationSource`, `locationRuleId` and `locationEvaluatedAt` only when `locationAssignmentMode === "AUTO"`. Continue writing `ipCountryCode`, `ipRegion`, encrypted registration IP and unrelated facts in both modes.

- [ ] **Step 4: Skip manual users in the batch handler**

For `MANUAL` users, increment processed and succeeded counts, advance `lastProcessedUserId`, and do not resolve, update effective location, or call owner/task assignment.

- [ ] **Step 5: Verify automated-write protection**

Run: `npm run test:integration`

Run: `npx vitest run tests/unit/worker/location-recalculation.test.ts`

Expected: all integration tests and focused worker tests pass.

---

### Task 5: Add the location controls and status to user pages

**Files:**
- Create: `src/components/users/user-location-control.tsx`
- Modify: `src/app/(dashboard)/users/[id]/page.tsx`
- Modify: `src/components/tables/user-table.tsx`
- Modify: `src/modules/users/user-queries.ts`
- Modify: `src/components/workspaces/workspace.module.css`
- Create: `tests/unit/components/user-location-control.test.tsx`
- Modify: `tests/unit/users/presentation.test.ts`

**Interfaces:**
- Produces: `UserLocationControl`.
- Consumes: `PATCH` and `DELETE /api/users/:id/location`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("keeps location and owner actions separate", () => {
  // Location control exposes 确认所属地区 and not 调整负责人.
});

it("requires country and reason before confirming", async () => {
  // Fill country CN and reason, submit PATCH with normalized payload.
});

it("restores an artificial location", async () => {
  // MANUAL mode shows 恢复自动判定 and submits DELETE.
});
```

- [ ] **Step 2: Verify the component tests fail because the component is missing**

Run: `npx vitest run tests/unit/components/user-location-control.test.tsx`

Expected: FAIL resolving the new component.

- [ ] **Step 3: Implement the inline control**

Use existing `.select`, `.input`, `.textarea`, `.button`, `.secondaryButton`, `.inlineActions`, error and hint styles. Preserve entered values on request failure. Give every control a unique label and expose errors with `role="alert"`.

- [ ] **Step 4: Add the detail-page state and actions**

Display `系统判定` or `人工确认` beside the effective location. Show manual reason, confirmer and time. Render `UserLocationControl` only for administrators, while retaining `UserOwnerControl` unchanged in the owner area.

- [ ] **Step 5: Add list status**

Select `locationAssignmentMode` in `userListSelect` and show “人工确认” as secondary copy in the location column. Keep editing on the detail page to avoid two dense editors in the table.

- [ ] **Step 6: Verify UI behavior**

Run: `npx vitest run tests/unit/components/user-location-control.test.tsx tests/unit/components/user-owner-control.test.tsx tests/unit/users/presentation.test.ts && npm run typecheck`

Expected: focused tests pass and TypeScript exits with code 0.

---

### Task 6: Complete regression verification and operational docs

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Documents: the independence of manual location and manual owner modes.

- [ ] **Step 1: Update operator-facing documentation**

Document:

- “确认所属地区” locks the effective operational location.
- “调整负责人” remains a separate action.
- Restoring automatic location does not unlock a manual owner.
- Restoring automatic owner does not unlock a manual location.

- [ ] **Step 2: Run static and unit verification**

Run: `npm run lint && npm run typecheck && npm test`

Expected: all commands exit with code 0.

- [ ] **Step 3: Run integration and production build verification**

Run: `npm run test:integration && npm run build`

Expected: integration suite passes and the Next.js production build completes.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only scoped feature files are changed.
