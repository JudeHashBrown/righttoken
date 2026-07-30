# Member Revocation Handover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an administrator to choose an active successor before revoking a member, then atomically transfer every owned customer and unfinished task to that successor.

**Architecture:** Extend the existing member-access service with a required `successorId`, validate the successor before mutation, and perform member deactivation, session deletion, customer handover, task handover, and audits in one Prisma transaction. The members page supplies active successor candidates to the existing revocation component, which sends the selected ID to the existing DELETE endpoint.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, PostgreSQL, Vitest, Testing Library.

## Global Constraints

- A successor is required before revocation.
- The successor must be an active member and cannot be the revoked member.
- All customers owned by the revoked member become manually assigned to the successor.
- All unfinished tasks move to the successor without changing task status.
- Completed and cancelled tasks retain their historical assignee.
- Every database change is atomic and audited.
- Existing role rules remain unchanged: primary administrators manage administrators and operators; administrators manage operators only.

---

### Task 1: Validate the successor in the member-access contract

**Files:**
- Modify: `src/modules/auth/member-access.ts`
- Modify: `tests/unit/auth/member-access.test.ts`

**Interfaces:**
- Consumes: existing `MemberAccessStore.findMember(id)` and `canManageRole`.
- Produces: `revokeMemberAccess(actorId, targetId, successorId, store?)` and `MemberAccessStore.revokeAccess({ actorId, targetId, successorId })`.

- [ ] **Step 1: Write failing service-contract tests**

Add tests asserting that a missing, inactive, nonexistent, or target-equal successor raises the stable error codes:

```ts
await expect(
  revokeMemberAccess("primary", "operator", "", store)
).rejects.toMatchObject({ code: "SUCCESSOR_REQUIRED" });

await expect(
  revokeMemberAccess("primary", "operator", "missing", store)
).rejects.toMatchObject({ code: "SUCCESSOR_NOT_FOUND" });

await expect(
  revokeMemberAccess("primary", "operator", "inactive", store)
).rejects.toMatchObject({ code: "SUCCESSOR_INACTIVE" });

await expect(
  revokeMemberAccess("primary", "operator", "operator", store)
).rejects.toMatchObject({ code: "SUCCESSOR_SAME_AS_TARGET" });
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npx vitest run tests/unit/auth/member-access.test.ts
```

Expected: FAIL because `revokeMemberAccess` does not accept or validate a successor.

- [ ] **Step 3: Extend types and validation**

Add these errors:

```ts
| "SUCCESSOR_REQUIRED"
| "SUCCESSOR_NOT_FOUND"
| "SUCCESSOR_INACTIVE"
| "SUCCESSOR_SAME_AS_TARGET"
```

Change the store call to:

```ts
revokeAccess(input: {
  actorId: string;
  targetId: string;
  successorId: string;
}): Promise<MemberAccessRevocationResult>;
```

Load actor, target, and successor together. Validate the actor and target with existing rules, then validate successor presence, existence, active state, and identity before calling the store.

- [ ] **Step 4: Verify the focused tests pass**

Run:

```bash
npx vitest run tests/unit/auth/member-access.test.ts
```

Expected: all member-access tests PASS.

- [ ] **Step 5: Commit**

```bash
git add recall-admin/src/modules/auth/member-access.ts recall-admin/tests/unit/auth/member-access.test.ts
git commit -m "feat: require a successor for member revocation"
```

---

### Task 2: Atomically hand over customers and unfinished tasks

**Files:**
- Modify: `src/modules/auth/member-access.ts`
- Modify: `tests/unit/auth/member-access-revocation.test.ts`
- Modify: `tests/integration/auth/member-routes.test.ts`

**Interfaces:**
- Consumes: validated `successorId`.
- Produces: `MemberAccessRevocationResult.successor` with `id`, `displayName`, and `email`.

- [ ] **Step 1: Replace the current automatic-reassignment regression test**

Configure the transaction mock with an active successor and assert:

```ts
expect(tx.userProfile.updateMany).toHaveBeenCalledWith({
  where: { ownerId: "operator-old" },
  data: expect.objectContaining({
    ownerId: "operator-new",
    ownerAssignmentMode: "MANUAL",
    ownerAssignedById: "admin-1",
    ownerAssignmentReason:
      "原负责人权限已撤销，由指定成员接管"
  })
});

expect(tx.recallTask.updateMany).toHaveBeenCalledWith({
  where: {
    assigneeId: "operator-old",
    status: { in: expect.any(Array) }
  },
  data: { assigneeId: "operator-new" }
});
```

Also assert that no update changes task status and that completed/cancelled statuses are absent from the open-status list.

- [ ] **Step 2: Verify the transaction test fails**

Run:

```bash
npx vitest run tests/unit/auth/member-access-revocation.test.ts
```

Expected: FAIL because the current implementation recalculates automatic users instead of handing everything to the selected successor.

- [ ] **Step 3: Implement one-transaction handover**

Inside `PrismaMemberAccessStore.revokeAccess`:

1. Load the active successor in the same transaction.
2. Deactivate the target member and delete their sessions.
3. Update all users with `ownerId: targetId`:

```ts
{
  ownerId: successor.id,
  ownerAssignmentMode: "MANUAL",
  ownerAssignedAt: now,
  ownerAssignedById: actorId,
  ownerAssignmentReason:
    "原负责人权限已撤销，由指定成员接管"
}
```

4. Update every task assigned to the target whose status is one of `UNASSIGNED`, `TODO`, `IN_PROGRESS`, `WAITING_USER`, or `PAUSED`, changing only `assigneeId`.
5. Write the aggregate audit record with target, successor, customer count, task count, and revoked-session count.
6. Return successor identity and counts.

The bulk task update intentionally includes legacy tasks whose customer owner does not match the revoked member. Completed and cancelled tasks do not match the status filter.

- [ ] **Step 4: Update integration expectations**

The route integration test must assert that the user owner and unfinished task assignee both equal the selected successor, the task stays `IN_PROGRESS`, and completed/cancelled history is unchanged.

- [ ] **Step 5: Verify focused tests**

Run:

```bash
npx vitest run \
  tests/unit/auth/member-access-revocation.test.ts \
  tests/unit/auth/member-access.test.ts
```

Expected: all focused unit tests PASS.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/src/modules/auth/member-access.ts recall-admin/tests/unit/auth/member-access-revocation.test.ts recall-admin/tests/integration/auth/member-routes.test.ts
git commit -m "feat: hand over work when revoking member access"
```

---

### Task 3: Accept successor selection in the API

**Files:**
- Modify: `src/app/api/members/[id]/access/route.ts`
- Create: `tests/unit/api/member-access-route.test.ts`

**Interfaces:**
- Consumes: JSON `{ successorId: string }`.
- Produces: HTTP 200 with handover counts and successor identity, or stable HTTP 400/404/409 errors for invalid successor input.

- [ ] **Step 1: Write route tests**

Mock `revokeMemberAccess` and assert:

```ts
expect(revokeMemberAccess).toHaveBeenCalledWith(
  "admin-1",
  "operator-old",
  "operator-new"
);
```

Add separate tests for missing successor, nonexistent successor, inactive successor, and successor equal to target.

- [ ] **Step 2: Verify route tests fail**

Run:

```bash
npx vitest run tests/unit/api/member-access-route.test.ts
```

Expected: FAIL because the route ignores the request body.

- [ ] **Step 3: Parse and map the request**

Use a strict Zod schema:

```ts
const revokeSchema = z.object({
  successorId: z.string().trim().min(1)
}).strict();
```

Pass the parsed successor to `revokeMemberAccess`. Return `SUCCESSOR_REQUIRED` for malformed input and map successor lookup/state errors to non-500 responses without exposing internal details.

- [ ] **Step 4: Verify route tests pass**

Run:

```bash
npx vitest run tests/unit/api/member-access-route.test.ts
```

Expected: all route tests PASS.

- [ ] **Step 5: Commit**

```bash
git add recall-admin/src/app/api/members/[id]/access/route.ts recall-admin/tests/unit/api/member-access-route.test.ts
git commit -m "feat: accept member handover target"
```

---

### Task 4: Add the handover selector to the members page

**Files:**
- Modify: `src/app/(dashboard)/members/page.tsx`
- Modify: `src/components/members/member-access-actions.tsx`
- Modify: `tests/unit/components/member-access-actions.test.tsx`

**Interfaces:**
- Consumes: `successorOptions: Array<{ id; displayName; email; role }>` containing active members other than the row member.
- Produces: DELETE request body `{ successorId }`.

- [ ] **Step 1: Write failing component tests**

Assert that:

- opening confirmation shows a required “工作接管人” selector;
- the selector labels include email;
- the confirm button is disabled before selection;
- selecting a successor submits:

```ts
{
  method: "DELETE",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ successorId: "operator-new" })
}
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
npx vitest run tests/unit/components/member-access-actions.test.tsx
```

Expected: FAIL because the current confirmation has no selector.

- [ ] **Step 3: Implement the selector**

Pass all active members from the page. In each row, remove the target member from the options. Render labels as:

```text
姓名 · 邮箱 · 角色
```

Update the warning copy to state that customers and unfinished tasks move to the selected member while completed/cancelled history remains unchanged.

- [ ] **Step 4: Verify component tests pass**

Run:

```bash
npx vitest run tests/unit/components/member-access-actions.test.tsx
```

Expected: all member-access action tests PASS.

- [ ] **Step 5: Commit**

```bash
git add recall-admin/src/app/'(dashboard)'/members/page.tsx recall-admin/src/components/members/member-access-actions.tsx recall-admin/tests/unit/components/member-access-actions.test.tsx
git commit -m "feat: choose a member work successor"
```

---

### Task 5: Regression verification and deployment note

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: completed handover flow.
- Produces: operator-facing and deployment verification instructions.

- [ ] **Step 1: Document the handover**

State that revocation requires a successor, transfers all owned customers and unfinished tasks, locks customer ownership as manual, and preserves completed/cancelled history.

- [ ] **Step 2: Run complete verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npx prisma validate
npm run build
git diff --check
```

Expected:

- all unit tests pass;
- TypeScript and ESLint exit with code 0;
- Prisma schema is valid;
- Next.js production build succeeds;
- no whitespace errors.

- [ ] **Step 3: Run PostgreSQL integration tests when the local database is available**

Run:

```bash
npm run test:integration
```

Expected: member route integration verifies the atomic handover. If the desktop sandbox blocks local PostgreSQL access, report the environment limitation explicitly and do not describe the integration suite as passed.

- [ ] **Step 4: Commit documentation**

```bash
git add recall-admin/README.md recall-admin/docs/deployment.md
git commit -m "docs: explain member work handover"
```
