# Geographic Customer Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every synchronized RightToken user is automatically assigned by operational geography, while administrator overrides remain authoritative until explicitly returned to automatic assignment.

**Architecture:** Keep `AssignmentRule` as the only automatic assignment source and add an explicit assignment mode to `UserProfile`. A dedicated owner service performs manual assignment, automatic restoration, open-task transfer, and audit logging in one transaction. The members workspace edits geographic rules through the same assignment-rule API, while user pages expose administrator-only owner controls.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, Zod 4, Vitest, Testing Library, Playwright.

## Global Constraints

- A newly synchronized user must receive an automatic owner during the first processing pass.
- Province / state / region rules take precedence over country rules.
- Unknown or unmatched geography is assigned to the active primary administrator; it must not create an unowned user.
- Manual assignment is allowed only after the automatic pass and remains authoritative across synchronization, location changes, segmentation changes, and rule recalculation.
- Only an explicit “恢复自动分配” action may remove a manual lock.
- Owner changes must update all open tasks in the same database transaction.
- Completed and cancelled task history must not be rewritten.
- Primary administrators and administrators may manage assignments; operators may only view their own assigned users.
- User-facing pages must not expose database fields, null values, internal rule expressions, or technical error codes.
- Use the existing `AssignmentRule` table and rule publishing workflow; do not introduce a second geographic mapping store.

---

### Task 1: Persist automatic versus manual owner state

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729173000_add_owner_assignment_state/migration.sql`
- Create: `src/modules/assignment/owner-state.ts`
- Test: `tests/unit/assignment/owner-state.test.ts`

**Interfaces:**
- Produces: `OwnerAssignmentMode` Prisma enum with `AUTO | MANUAL`.
- Produces: `ownerAssignmentMode`, `ownerAssignedAt`, `ownerAssignedById`, and `ownerAssignmentReason` on `UserProfile`.
- Produces: `isManualOwnerLocked(user: Pick<UserProfile, "ownerAssignmentMode" | "ownerId">): boolean`.
- Consumes: existing `UserProfile.ownerId` and `Member`.

- [ ] **Step 1: Write the failing owner-state unit test**

```ts
import { describe, expect, it } from "vitest";
import { isManualOwnerLocked } from "@/modules/assignment/owner-state";

describe("owner assignment state", () => {
  it("locks only a manual assignment with a valid owner", () => {
    expect(
      isManualOwnerLocked({
        ownerAssignmentMode: "MANUAL",
        ownerId: "operator-1"
      })
    ).toBe(true);
    expect(
      isManualOwnerLocked({
        ownerAssignmentMode: "AUTO",
        ownerId: "operator-1"
      })
    ).toBe(false);
    expect(
      isManualOwnerLocked({
        ownerAssignmentMode: "MANUAL",
        ownerId: null
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npx vitest run tests/unit/assignment/owner-state.test.ts`

Expected: FAIL because `@/modules/assignment/owner-state` does not exist.

- [ ] **Step 3: Add the Prisma enum, fields, relations, and migration**

Add to `prisma/schema.prisma`:

```prisma
enum OwnerAssignmentMode {
  AUTO
  MANUAL

  @@schema("recall")
}

model Member {
  // existing fields and relations remain unchanged
  ownerAssignmentsMade UserProfile[] @relation("UserOwnerAssigner")
}

model UserProfile {
  // existing fields remain unchanged
  ownerAssignmentMode   OwnerAssignmentMode @default(AUTO)
  ownerAssignedAt       DateTime?
  ownerAssignedById     String?
  ownerAssignmentReason String?

  ownerAssignedBy Member? @relation("UserOwnerAssigner", fields: [ownerAssignedById], references: [id], onDelete: SetNull)

  @@index([ownerAssignmentMode, ownerId])
}
```

Create the migration with:

```sql
CREATE TYPE "recall"."OwnerAssignmentMode" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "recall"."UserProfile"
ADD COLUMN "ownerAssignmentMode" "recall"."OwnerAssignmentMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "ownerAssignedAt" TIMESTAMP(3),
ADD COLUMN "ownerAssignedById" TEXT,
ADD COLUMN "ownerAssignmentReason" TEXT;

UPDATE "recall"."UserProfile"
SET "ownerAssignedAt" = COALESCE("updatedAt", "createdAt")
WHERE "ownerId" IS NOT NULL;

CREATE INDEX "UserProfile_ownerAssignmentMode_ownerId_idx"
ON "recall"."UserProfile"("ownerAssignmentMode", "ownerId");

ALTER TABLE "recall"."UserProfile"
ADD CONSTRAINT "UserProfile_ownerAssignedById_fkey"
FOREIGN KEY ("ownerAssignedById")
REFERENCES "recall"."Member"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
```

Run: `npx prisma generate`

Expected: Prisma client generation succeeds.

- [ ] **Step 4: Implement the pure owner-state helper**

Create `src/modules/assignment/owner-state.ts`:

```ts
import type { UserProfile } from "@/generated/prisma/client";

type OwnerState = Pick<
  UserProfile,
  "ownerAssignmentMode" | "ownerId"
>;

export function isManualOwnerLocked(user: OwnerState): boolean {
  return user.ownerAssignmentMode === "MANUAL" && Boolean(user.ownerId);
}
```

- [ ] **Step 5: Run the focused test and static checks**

Run: `npx vitest run tests/unit/assignment/owner-state.test.ts && npm run typecheck`

Expected: PASS and TypeScript exits with code 0.

- [ ] **Step 6: Commit the assignment-state schema**

```bash
git add prisma/schema.prisma prisma/migrations/20260729173000_add_owner_assignment_state/migration.sql src/generated/prisma src/modules/assignment/owner-state.ts tests/unit/assignment/owner-state.test.ts
git commit -m "feat: persist customer owner assignment mode"
```

---

### Task 2: Make automatic assignment mandatory and manual-lock aware

**Files:**
- Modify: `src/modules/assignment/types.ts`
- Modify: `src/modules/assignment/assign-task.ts`
- Modify: `src/worker/handlers/assignment-recalculation.ts`
- Modify: `src/worker/handlers/location-recalculation.ts`
- Modify: `src/worker/handlers/segment-recalculation.ts`
- Test: `tests/integration/assignment/assign-task.test.ts`
- Test: `tests/unit/worker/assignment-recalculation.test.ts`

**Interfaces:**
- Produces: `AssignmentDecision.assignmentMode: "AUTO" | "MANUAL"`.
- Produces: `AssignmentDecision.skippedManual: boolean`.
- Produces: `assignUserOwnerInTransaction(tx, userId, now, options?: { forceAutomatic?: boolean }): Promise<AssignmentDecision>`.
- Consumes: `isManualOwnerLocked`.
- Preserves: all existing callers of `assignUserOwner` and `assignTask`.

- [ ] **Step 1: Add failing integration cases for initial assignment and manual-lock preservation**

Add these assertions to `tests/integration/assignment/assign-task.test.ts`:

```ts
it("assigns the primary administrator when geography has no matching rule", async () => {
  const primary = await prisma.member.findFirstOrThrow({
    where: { role: "PRIMARY_ADMIN", active: true }
  });
  const user = await prisma.userProfile.create({
    data: {
      externalUserId: `unknown-${randomUUID()}`,
      email: `unknown-${randomUUID()}@example.test`,
      emailNormalized: `unknown-${randomUUID()}@example.test`,
      registeredAt: new Date(),
      currentSegment: "G"
    }
  });

  const decision = await assignUserOwner(user.id);

  expect(decision).toMatchObject({
    assigneeId: primary.id,
    assignmentMode: "AUTO",
    skippedManual: false
  });
  await expect(
    prisma.userProfile.findUniqueOrThrow({ where: { id: user.id } })
  ).resolves.toMatchObject({
    ownerId: primary.id,
    ownerAssignmentMode: "AUTO"
  });
});

it("does not overwrite a manually locked owner", async () => {
  await prisma.userProfile.update({
    where: { id: ownerOnlyUserId },
    data: {
      ownerId: southOperatorId,
      ownerAssignmentMode: "MANUAL",
      ownerAssignmentReason: "重点客户由华南团队继续跟进"
    }
  });

  const decision = await assignUserOwner(ownerOnlyUserId);

  expect(decision).toMatchObject({
    assigneeId: southOperatorId,
    assignmentMode: "MANUAL",
    skippedManual: true
  });
  await expect(
    prisma.userProfile.findUniqueOrThrow({
      where: { id: ownerOnlyUserId }
    })
  ).resolves.toMatchObject({
    ownerId: southOperatorId,
    ownerAssignmentMode: "MANUAL"
  });
});
```

- [ ] **Step 2: Run the integration suite and verify the new assertions fail**

Run: `npm run test:integration`

Expected: FAIL because `AssignmentDecision` has no assignment mode and manual assignments are overwritten.

- [ ] **Step 3: Extend the decision type and assignment implementation**

Add to `AssignmentDecision` in `src/modules/assignment/types.ts`:

```ts
assignmentMode: "AUTO" | "MANUAL";
skippedManual: boolean;
```

In `src/modules/assignment/assign-task.ts`, add a manual decision before loading rules:

```ts
function manualDecision(user: UserProfile): AssignmentDecision | null {
  if (!isManualOwnerLocked(user)) return null;
  return {
    assigneeId: user.ownerId,
    poolKey: "manual-owner",
    matchedRuleId: null,
    matchedRuleName: null,
    matchedRulePriority: null,
    usedFallback: false,
    matchedConditions: [],
    assignmentReason:
      user.ownerAssignmentReason ?? "管理员已指定负责人",
    assignmentMode: "MANUAL",
    skippedManual: true
  };
}
```

Normalize decisions returned by `matchRule`:

```ts
const decision = matchRule(
  userToAssignmentContext(user),
  rules,
  workload,
  now,
  defaultOwner?.id ?? null
);
return {
  ...decision,
  assignmentMode: "AUTO",
  skippedManual: false
};
```

Change the automatic user update to:

```ts
data: {
  ownerId: decision.assigneeId,
  ownerAssignmentMode: "AUTO",
  ownerAssignedAt: now,
  ownerAssignedById: null,
  ownerAssignmentReason: decision.assignmentReason
}
```

If `defaultOwner` is missing, throw `PRIMARY_ADMIN_REQUIRED` instead of returning an unowned decision.

- [ ] **Step 4: Exclude manual users from bulk recalculation and count only actual owner changes**

Change the recalculation user filter to:

```ts
where: {
  sourceDeletedAt: null,
  ownerAssignmentMode: "AUTO",
  id: {
    ...(run.lastProcessedUserId
      ? { gt: run.lastProcessedUserId }
      : {}),
    lte: run.upperBoundUserId
  }
}
```

Update worker mocks so automatic decisions include:

```ts
{
  assigneeId: "new-owner",
  assignmentMode: "AUTO",
  skippedManual: false
}
```

- [ ] **Step 5: Run focused and full assignment tests**

Run: `npx vitest run tests/unit/worker/assignment-recalculation.test.ts && npm run test:integration`

Expected: PASS.

- [ ] **Step 6: Commit mandatory automatic assignment**

```bash
git add src/modules/assignment src/worker/handlers tests/integration/assignment/assign-task.test.ts tests/unit/worker/assignment-recalculation.test.ts
git commit -m "feat: protect manual owners during automatic assignment"
```

---

### Task 3: Add transactional manual assignment and automatic restoration

**Files:**
- Create: `src/modules/users/user-owner-service.ts`
- Create: `src/modules/users/owner-errors.ts`
- Test: `tests/integration/users/user-owner-service.test.ts`

**Interfaces:**
- Produces: `manuallyAssignUserOwner(input: { userId: string; actorId: string; targetOwnerId: string; reason: string; now?: Date }): Promise<OwnerChangeResult>`.
- Produces: `restoreAutomaticUserOwner(input: { userId: string; actorId: string; now?: Date }): Promise<OwnerChangeResult>`.
- Produces: `OwnerChangeResult = { userId; previousOwnerId; ownerId; mode; transferredTasks }`.
- Consumes: `assignUserOwnerInTransaction(..., { forceAutomatic: true })` and `openTaskStatuses`.

- [ ] **Step 1: Write failing integration tests for manual assignment and restoration**

Create `tests/integration/users/user-owner-service.test.ts` with three cases:

```ts
it("manually assigns the user and every open task in one operation", async () => {
  const result = await manuallyAssignUserOwner({
    userId,
    actorId: adminId,
    targetOwnerId: operatorBId,
    reason: "用户语言与 B 运营团队更匹配",
    now
  });

  expect(result).toEqual({
    userId,
    previousOwnerId: operatorAId,
    ownerId: operatorBId,
    mode: "MANUAL",
    transferredTasks: 2
  });
  await expect(
    prisma.userProfile.findUniqueOrThrow({ where: { id: userId } })
  ).resolves.toMatchObject({
    ownerId: operatorBId,
    ownerAssignmentMode: "MANUAL",
    ownerAssignedById: adminId,
    ownerAssignmentReason: "用户语言与 B 运营团队更匹配"
  });
  expect(
    await prisma.recallTask.count({
      where: {
        userId,
        status: { in: openTaskStatuses },
        assigneeId: operatorBId
      }
    })
  ).toBe(2);
});

it("does not rewrite completed or cancelled task history", async () => {
  await manuallyAssignUserOwner({
    userId,
    actorId: adminId,
    targetOwnerId: operatorBId,
    reason: "重新安排跟进负责人",
    now
  });
  expect(
    await prisma.recallTask.count({
      where: {
        userId,
        status: { in: ["COMPLETED", "CANCELLED"] },
        assigneeId: operatorAId
      }
    })
  ).toBe(2);
});

it("rejects manual assignment before the first automatic owner exists", async () => {
  await prisma.userProfile.update({
    where: { id: userId },
    data: {
      ownerId: null,
      ownerAssignedAt: null,
      ownerAssignmentMode: "AUTO"
    }
  });

  await expect(
    manuallyAssignUserOwner({
      userId,
      actorId: adminId,
      targetOwnerId: operatorBId,
      reason: "尝试跳过首次自动分配",
      now
    })
  ).rejects.toMatchObject({
    code: "INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED"
  });
});

it("restores automatic assignment and transfers open work", async () => {
  const result = await restoreAutomaticUserOwner({
    userId,
    actorId: adminId,
    now
  });
  expect(result.mode).toBe("AUTO");
  expect(result.ownerId).toBe(operatorAId);
  await expect(
    prisma.userProfile.findUniqueOrThrow({ where: { id: userId } })
  ).resolves.toMatchObject({
    ownerId: operatorAId,
    ownerAssignmentMode: "AUTO",
    ownerAssignedById: null
  });
});
```

- [ ] **Step 2: Run integration tests and verify the service module is missing**

Run: `npm run test:integration`

Expected: FAIL because `user-owner-service.ts` does not exist.

- [ ] **Step 3: Implement role validation, row locking, user update, task transfer, and audit**

Implement the service around one `prisma.$transaction`. Validate:

```ts
if (!["PRIMARY_ADMIN", "ADMIN"].includes(actor.role)) {
  throw new UserOwnerError("FORBIDDEN");
}
if (!target.active) {
  throw new UserOwnerError("TARGET_OWNER_INACTIVE");
}
if (!["PRIMARY_ADMIN", "ADMIN", "OPERATOR"].includes(target.role)) {
  throw new UserOwnerError("TARGET_OWNER_INVALID");
}
if (!reason.trim()) {
  throw new UserOwnerError("REASON_REQUIRED");
}
if (!user.ownerId || !user.ownerAssignedAt) {
  throw new UserOwnerError(
    "INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED"
  );
}
```

Use this open-task update:

```ts
const openTasks = await tx.recallTask.findMany({
  where: {
    userId,
    status: { in: openTaskStatuses }
  },
  select: { id: true, assigneeId: true }
});

await tx.recallTask.updateMany({
  where: { id: { in: openTasks.map((task) => task.id) } },
  data: { assigneeId: targetOwnerId }
});

await tx.taskActivity.createMany({
  data: openTasks.map((task) => ({
    taskId: task.id,
    actorId,
    action: "task.transferred",
    detail: {
      fromAssigneeId: task.assigneeId,
      toAssigneeId: targetOwnerId,
      reason,
      source: "user_owner_change"
    }
  }))
});
```

Write `user.owner_manually_assigned` and `user.owner_auto_restored` audit records with previous owner, new owner, geography snapshot, reason, and transferred task count.

- [ ] **Step 4: Run the integration suite**

Run: `npm run test:integration`

Expected: PASS, including rollback behavior when the target member is inactive.

- [ ] **Step 5: Commit the owner service**

```bash
git add src/modules/users/user-owner-service.ts src/modules/users/owner-errors.ts tests/integration/users/user-owner-service.test.ts
git commit -m "feat: add manual customer assignment service"
```

---

### Task 4: Expose administrator-only owner APIs

**Files:**
- Create: `src/app/api/users/[id]/owner/route.ts`
- Test: `tests/integration/users/user-owner-route.test.ts`

**Interfaces:**
- Produces: `PATCH /api/users/:id/owner` with `{ ownerId, reason }`.
- Produces: `DELETE /api/users/:id/owner` to restore automatic assignment.
- Consumes: `operators:manage`, CSRF validation, and Task 3 services.

- [ ] **Step 1: Write failing route tests**

Test:

```ts
const assigned = await PATCH(
  request("/api/users/user-1/owner", "PATCH", adminToken, {
    ownerId: operatorId,
    reason: "调整为当地运营跟进"
  }),
  { params: Promise.resolve({ id: userId }) }
);
expect(assigned.status).toBe(200);
await expect(assigned.json()).resolves.toMatchObject({
  result: { ownerId: operatorId, mode: "MANUAL" }
});

const forbidden = await PATCH(
  request("/api/users/user-1/owner", "PATCH", operatorToken, {
    ownerId: operatorId,
    reason: "无权调整"
  }),
  { params: Promise.resolve({ id: userId }) }
);
expect(forbidden.status).toBe(403);

const restored = await DELETE(
  request("/api/users/user-1/owner", "DELETE", adminToken),
  { params: Promise.resolve({ id: userId }) }
);
expect(restored.status).toBe(200);
```

- [ ] **Step 2: Run integration tests and verify 404/module failures**

Run: `npm run test:integration`

Expected: FAIL because the owner route does not exist.

- [ ] **Step 3: Implement strict schemas, permissions, CSRF, and user-facing error codes**

Use:

```ts
const ownerSchema = z
  .object({
    ownerId: z.string().min(1),
    reason: z.string().trim().min(1).max(500)
  })
  .strict();
```

Both handlers must call:

```ts
assertSameOrigin(request);
const { member } = await requireRequestPermission(
  request,
  "operators:manage"
);
```

Return only these stable response codes:

```ts
"INVALID_OWNER_CHANGE"
"UNAUTHORIZED"
"FORBIDDEN"
"USER_NOT_FOUND"
"TARGET_OWNER_UNAVAILABLE"
"OWNER_CHANGE_FAILED"
```

- [ ] **Step 4: Run route tests and integration suite**

Run: `npm run test:integration`

Expected: PASS.

- [ ] **Step 5: Commit the owner API**

```bash
git add src/app/api/users/[id]/owner/route.ts tests/integration/users/user-owner-route.test.ts
git commit -m "feat: expose customer owner controls"
```

---

### Task 5: Show and edit assignment state in user pages

**Files:**
- Modify: `src/modules/users/user-queries.ts`
- Modify: `src/modules/users/presentation.ts`
- Create: `src/components/users/user-owner-control.tsx`
- Modify: `src/components/tables/user-table.tsx`
- Modify: `src/app/(dashboard)/users/page.tsx`
- Modify: `src/app/(dashboard)/users/[id]/page.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/unit/components/user-owner-control.test.tsx`
- Test: `tests/unit/users/presentation.test.ts`

**Interfaces:**
- Produces: `ownerAssignmentLabel(mode): "系统分配" | "人工分配"`.
- Produces: `UserOwnerControl` client component.
- Consumes: Task 4 APIs and active member options.

- [ ] **Step 1: Write failing presentation and component tests**

Presentation assertions:

```ts
expect(ownerAssignmentLabel("AUTO")).toBe("系统分配");
expect(ownerAssignmentLabel("MANUAL")).toBe("人工分配");
expect(ownerDisplayName(null)).toBe("主管理员暂管");
```

Component assertions:

```tsx
render(
  <UserOwnerControl
    userId="user-1"
    currentOwnerId="operator-1"
    currentOwnerName="运营甲"
    assignmentMode="MANUAL"
    members={[
      { id: "operator-1", displayName: "运营甲" },
      { id: "operator-2", displayName: "运营乙" }
    ]}
  />
);
expect(screen.getByText("人工分配")).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "恢复自动分配" })
).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and verify missing exports/components**

Run: `npx vitest run tests/unit/users/presentation.test.ts tests/unit/components/user-owner-control.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Extend user queries with assignment state and assigning administrator**

Add to list and detail selections:

```ts
ownerAssignmentMode: true,
ownerAssignedAt: true,
ownerAssignmentReason: true,
ownerAssignedBy: {
  select: {
    id: true,
    displayName: true
  }
}
```

Load active member options only for primary administrators and administrators.

- [ ] **Step 4: Implement the compact owner control**

The component must:

- Show current owner and “系统分配” or “人工分配”.
- Open a compact editor only after “调整负责人”.
- Require new owner and reason.
- Submit `PATCH /api/users/:id/owner`.
- Show “恢复自动分配” only for manual assignments.
- Refresh the route after success.
- Map all API failures to “负责人没有调整，请刷新后重试”.

- [ ] **Step 5: Integrate the control without backend wording**

User list owner cell:

```tsx
<div>
  <strong>{ownerDisplayName(user.owner)}</strong>
  <span className={styles.secondaryText}>
    {ownerAssignmentLabel(user.ownerAssignmentMode)}
  </span>
  {canManageOwners ? (
    <UserOwnerControl
      compact
      userId={user.id}
      currentOwnerId={user.ownerId}
      currentOwnerName={ownerDisplayName(user.owner)}
      assignmentMode={user.ownerAssignmentMode}
      members={members}
    />
  ) : null}
</div>
```

User detail adds assignment time, reason, assigning administrator, and the full control. Replace “公共池” with “主管理员暂管”.

- [ ] **Step 6: Run component tests, typecheck, and lint**

Run: `npx vitest run tests/unit/components/user-owner-control.test.tsx tests/unit/users/presentation.test.ts && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 7: Commit the user assignment interface**

```bash
git add src/modules/users src/components/users src/components/tables/user-table.tsx src/app/'(dashboard)'/users src/components/workspaces/workspace.module.css tests/unit/components/user-owner-control.test.tsx tests/unit/users/presentation.test.ts
git commit -m "feat: let administrators adjust customer owners"
```

---

### Task 6: Configure operator territories from Members and Permissions

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260729190000_mark_member_territory_rules/migration.sql`
- Modify: `src/modules/assignment/types.ts`
- Modify: `src/modules/assignment/match-rule.ts`
- Modify: `src/modules/assignment/assign-task.ts`
- Modify: `src/modules/assignment/publish-rules.ts`
- Modify: `src/modules/admin/workspace-queries.ts`
- Create: `src/modules/assignment/member-territories.ts`
- Create: `src/components/members/member-territory-editor.tsx`
- Modify: `src/app/(dashboard)/members/page.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/unit/assignment/member-territories.test.ts`
- Test: `tests/unit/components/member-territory-editor.test.tsx`

**Interfaces:**
- Produces: `territoriesForMember(memberId, rules): MemberTerritory[]`.
- Produces: `mergeMemberTerritories(memberId, territories, rules): AssignmentRuleInput[]`.
- Produces: `MemberTerritory = { countryCode: string; regions: string[] }`.
- Produces: `AssignmentRule.memberTerritoryManaged` so member-page rules can be replaced without touching advanced rules.
- Consumes: existing `POST /api/automation/assignment-rules` and assignment preview endpoint.

- [ ] **Step 1: Write failing pure transformation tests**

```ts
it("keeps unrelated rules while replacing one member's geographic rules", () => {
  const merged = mergeMemberTerritories(
    "operator-cn",
    [
      { countryCode: "CN", regions: ["广东", "广西"] },
      { countryCode: "RU", regions: [] }
    ],
    existingRules
  );

  expect(merged).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        assigneeId: "operator-cn",
        conditions: {
          countryCodes: ["CN"],
          regionIncludes: ["广东", "广西"]
        }
      }),
      expect.objectContaining({
        assigneeId: "operator-cn",
        conditions: { countryCodes: ["RU"] }
      }),
      expect.objectContaining({ id: "unrelated-rule" })
    ])
  );
});

it("rejects a province assigned to two primary owners", () => {
  expect(() =>
    assertNoTerritoryConflict(conflictingRules)
  ).toThrow("TERRITORY_CONFLICT");
});
```

- [ ] **Step 2: Run focused tests and verify the module is missing**

Run: `npx vitest run tests/unit/assignment/member-territories.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement territory extraction, merge, normalization, and conflict validation**

Add the managed-rule marker:

```prisma
model AssignmentRule {
  // existing fields remain unchanged
  memberTerritoryManaged Boolean @default(false)

  @@index([memberTerritoryManaged, assigneeId])
}
```

Create the migration:

```sql
ALTER TABLE "recall"."AssignmentRule"
ADD COLUMN "memberTerritoryManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AssignmentRule_memberTerritoryManaged_assigneeId_idx"
ON "recall"."AssignmentRule"("memberTerritoryManaged", "assigneeId");
```

Run `npx prisma generate`, then carry `memberTerritoryManaged` through
`AssignmentRuleInput`, `assignmentRuleInputSchema`, `storedRuleToInput`, and
`publishAssignmentRules`.

Normalization rules:

```ts
const countryCode = input.countryCode.trim().toUpperCase();
const regions = [...new Set(
  input.regions.map((region) => region.trim()).filter(Boolean)
)];
```

Generated territory rules must:

- Use country and optional region conditions only.
- Set `memberTerritoryManaged: true`.
- Assign the selected operator as primary owner.
- Keep existing fallback owner and workload fields only when editing an existing territory.
- Put province rules ahead of country-only rules.
- Replace only rules where `memberTerritoryManaged` is true and `assigneeId` equals the selected member.
- Preserve every rule where `memberTerritoryManaged` is false, including advanced geographic rules assigned to the same member.
- Re-number priorities consecutively before publishing.

- [ ] **Step 4: Write and run the failing member editor test**

```tsx
render(
  <MemberTerritoryEditor
    member={{ id: "operator-1", displayName: "运营甲" }}
    initialTerritories={[
      { countryCode: "CN", regions: ["广东"] }
    ]}
    allRules={rules}
  />
);
expect(screen.getByDisplayValue("CN")).toBeInTheDocument();
expect(screen.getByDisplayValue("广东")).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "预览影响" })
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "保存负责地区" })
).toBeInTheDocument();
```

Run: `npx vitest run tests/unit/components/member-territory-editor.test.tsx`

Expected: FAIL.

- [ ] **Step 5: Implement and add the member-page editor**

Each active operator row shows:

- Responsible countries.
- Responsible provinces / states / regions.
- Current owned-user count.
- “设置负责地区”.

The editor uses chip rows for countries and regions, previews via `/api/automation/assignment-rules/preview`, then publishes the merged complete ruleset through `/api/automation/assignment-rules`.

Administrators and primary administrators remain global and do not show territory inputs.

- [ ] **Step 6: Run focused tests, typecheck, and lint**

Run: `npx vitest run tests/unit/assignment/member-territories.test.ts tests/unit/components/member-territory-editor.test.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 7: Commit member territory management**

```bash
git add prisma/schema.prisma prisma/migrations/20260729190000_mark_member_territory_rules/migration.sql src/generated/prisma src/modules/admin/workspace-queries.ts src/modules/assignment src/components/members/member-territory-editor.tsx src/app/'(dashboard)'/members/page.tsx src/components/workspaces/workspace.module.css tests/unit/assignment/member-territories.test.ts tests/unit/components/member-territory-editor.test.tsx
git commit -m "feat: configure operator territories from members"
```

---

### Task 7: Reassign users safely when member access is revoked

**Files:**
- Modify: `src/modules/auth/member-access.ts`
- Modify: `tests/integration/auth/member-routes.test.ts`

**Interfaces:**
- Consumes: automatic assignment service, manual owner state, primary administrator fallback, and open task statuses.
- Produces: revocation result with `reassignedUsers`, `transferredTasks`, and `failedUsers`.

- [ ] **Step 1: Replace the existing release-only expectations with reassignment expectations**

Extend `member-routes.test.ts`:

```ts
expect(response.status).toBe(200);
await expect(response.json()).resolves.toMatchObject({
  revokedSessions: 1,
  reassignedUsers: 1,
  transferredTasks: 1,
  failedUsers: 0
});

const reassignedUser =
  await prisma.userProfile.findUniqueOrThrow({
    where: { id: registeredUserProfileId }
  });
expect(reassignedUser.ownerId).not.toBeNull();
expect(reassignedUser.ownerId).not.toBe(grantedMemberId);

await expect(
  prisma.recallTask.findUniqueOrThrow({
    where: { id: task.id },
    select: { assigneeId: true, status: true }
  })
).resolves.toEqual({
  assigneeId: reassignedUser.ownerId,
  status: "IN_PROGRESS"
});
```

Add a manual-user case asserting that the active primary administrator becomes the temporary owner and the mode remains `MANUAL`.

- [ ] **Step 2: Run integration tests and verify current null-owner behavior fails**

Run: `npm run test:integration`

Expected: FAIL because revocation currently clears owners and tasks.

- [ ] **Step 3: Replace null release with deterministic reassignment**

Inside the existing transaction:

1. Mark the member inactive.
2. Read all users currently owned by that member.
3. For `AUTO` users, run automatic assignment after the member is inactive.
4. For `MANUAL` users, assign the active primary administrator, keep `MANUAL`, and set the reason to “原负责人权限已撤销，由主管理员暂管”.
5. Transfer every open task to the resulting user owner without changing task status.
6. Write `user.owner_reassigned_after_member_revoked` audit records.
7. Return exact counts.

Do not set `ownerId` or open-task `assigneeId` to null.

- [ ] **Step 4: Run integration tests**

Run: `npm run test:integration`

Expected: PASS.

- [ ] **Step 5: Commit safe member revocation**

```bash
git add src/modules/auth/member-access.ts tests/integration/auth/member-routes.test.ts
git commit -m "fix: reassign customers when operator access is revoked"
```

---

### Task 8: Verify the complete assignment workflow and deployment migration

**Files:**
- Create: `tests/e2e/helpers/customer-assignment-fixture.ts`
- Create: `tests/e2e/customer-assignment-workflow.spec.ts`
- Modify: `README.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: an end-to-end acceptance test and deployment checklist.

- [ ] **Step 1: Write the end-to-end workflow**

Create a fixture helper that inserts:

- An active administrator and hashed session token.
- Two active operators.
- A Guangdong user initially owned by operator A.
- One enabled Guangdong assignment rule for operator A.

The helper returns this exact type and deletes its users, sessions, rules, and
members during cleanup:

```ts
export type CustomerAssignmentFixture = {
  sessionToken: string;
  userId: string;
  operatorAId: string;
  operatorBId: string;
  cleanup(): Promise<void>;
};

export async function createCustomerAssignmentFixture(
  pool: pg.Pool
): Promise<CustomerAssignmentFixture>;
```

The Playwright test must use only values returned by that fixture:

```ts
import "dotenv/config";
import { expect, test } from "@playwright/test";
import pg from "pg";
import {
  createCustomerAssignmentFixture,
  type CustomerAssignmentFixture
} from "./helpers/customer-assignment-fixture";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";
let fixture: CustomerAssignmentFixture;

test.beforeAll(async () => {
  fixture = await createCustomerAssignmentFixture(pool);
});

test.afterAll(async () => {
  await fixture.cleanup();
  await pool.end();
});

test("administrator configures territory, overrides owner, and restores automatic assignment", async ({
  context,
  page
}) => {
  await context.addCookies([
    {
      name: "rt_recall_session",
      value: fixture.sessionToken,
      url: `http://127.0.0.1:${e2ePort}`
    }
  ]);

  await page.goto("/members");
  await page
    .getByRole("row", { name: /E2E 运营甲/ })
    .getByRole("button", { name: "设置负责地区" })
    .click();
  await page.getByLabel("国家或地区").fill("CN");
  await page.getByLabel("省 / 州 / 地区").fill("广东");
  await page.getByRole("button", { name: "预览影响" }).click();
  await expect(page.getByText(/预计影响/)).toBeVisible();
  await page.getByRole("button", { name: "保存负责地区" }).click();

  await page.goto(`/users/${fixture.userId}`);
  await page.getByRole("button", { name: "调整负责人" }).click();
  await page
    .getByLabel("新负责人")
    .selectOption(fixture.operatorBId);
  await page.getByLabel("调整原因").fill("测试人工改派");
  await page.getByRole("button", { name: "确认调整" }).click();
  await expect(page.getByText("人工分配")).toBeVisible();

  await page.getByRole("button", { name: "恢复自动分配" }).click();
  await page.getByRole("button", { name: "确认恢复" }).click();
  await expect(page.getByText("系统分配")).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E test and fix only workflow defects**

Run: `npx playwright test tests/e2e/customer-assignment-workflow.spec.ts`

Expected: PASS.

- [ ] **Step 3: Document deployment and migration verification**

Add these exact production steps:

```text
1. Back up the production database.
2. Run npm run db:deploy.
3. Confirm exactly one active PRIMARY_ADMIN exists.
4. Preview the current assignment rules.
5. Run one full assignment recalculation.
6. Confirm every non-deleted UserProfile has ownerId.
7. Confirm MANUAL users retain their owner after a second recalculation.
8. Confirm no open RecallTask has assigneeId NULL.
9. Confirm operators only see users with ownerId equal to their member id.
```

Document the verification queries:

```sql
SELECT COUNT(*)
FROM recall."UserProfile"
WHERE "sourceDeletedAt" IS NULL
  AND "ownerId" IS NULL;

SELECT "ownerAssignmentMode", COUNT(*)
FROM recall."UserProfile"
WHERE "sourceDeletedAt" IS NULL
GROUP BY "ownerAssignmentMode";

SELECT COUNT(*)
FROM recall."RecallTask"
WHERE "status" IN (
  'UNASSIGNED',
  'TODO',
  'IN_PROGRESS',
  'WAITING_USER',
  'PAUSED'
)
AND "assigneeId" IS NULL;
```

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm run test
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

Expected: every command exits with code 0.

- [ ] **Step 5: Review the final diff for user-facing language and migration safety**

Run:

```bash
git diff --check
rg -n "公共池|NULL|未命中规则|ownerAssignmentMode|assigneeId" src/app src/components
git status --short
```

Expected:

- `git diff --check` produces no output.
- The `rg` results contain no visible JSX strings exposing internal terms.
- Only intended assignment, member, user, migration, test, and documentation files are modified.

- [ ] **Step 6: Commit end-to-end verification and docs**

```bash
git add tests/e2e/customer-assignment-workflow.spec.ts README.md docs/deployment.md
git commit -m "test: cover geographic customer assignment workflow"
```
