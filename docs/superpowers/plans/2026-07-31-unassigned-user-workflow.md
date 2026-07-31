# 管理员待分配用户工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员第一时间看到未分配用户，并能通过地区规则自动匹配或直接人工指定运营；无可用运营时用户继续保持未分配。

**Architecture:** 保留 `ownerId = null` 作为唯一未分配事实来源，修改自动分配服务以允许空结果，并新增事务级组合分配服务处理“地区更新、自动匹配、人工负责人覆盖”。查询层为管理员提供明确的未分配筛选和首页指标，UI 在现有用户表内提供一次性处理入口。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Prisma/PostgreSQL、Vitest、Testing Library、Playwright。

## Global Constraints

- 仅 `PRIMARY_ADMIN` 和 `ADMIN` 可以查看全局待分配数量和执行分配。
- `OPERATOR` 不能通过查询参数访问全局未分配用户。
- 无规则或无可用运营时必须保持 `ownerId = null`，不得默认分配给主管理员。
- 地区规则自动匹配后，显式人工负责人始终具有最高优先级。
- 所有列表按最近事件、注册时间、ID 从新到旧稳定排序。
- 每次组合分配必须在同一事务中完成并写入审计记录。
- 不新增地区字典、推送通知或自动规则。

---

### Task 1: 允许自动分配产生未分配结果

**Files:**
- Modify: `recall-admin/tests/unit/assignment/match-rule.test.ts`
- Modify: `recall-admin/tests/integration/assignment/assign-task.test.ts`
- Modify: `recall-admin/src/modules/assignment/assign-task.ts`

**Interfaces:**
- Consumes: `matchRule(..., defaultAssigneeId?: string | null): RuleAssignmentDecision`
- Produces: `assignUserOwnerInTransaction(...)` 可返回 `assigneeId: null`，并把用户保存为未分配。

- [ ] **Step 1: 写失败测试**

将原“无地域规则时分配主管理员”集成测试改为：

```ts
it("keeps the user unassigned when geography has no matching owner", async () => {
  const decision = await assignUserOwner(user.id);
  expect(decision).toMatchObject({
    assigneeId: null,
    assignmentMode: "AUTO",
    skippedManual: false,
    assignmentReason: "没有规则命中；进入公共池"
  });
  await expect(
    prisma.userProfile.findUniqueOrThrow({ where: { id: user.id } })
  ).resolves.toMatchObject({
    ownerId: null,
    ownerAssignmentMode: "AUTO",
    ownerAssignedAt: null,
    ownerAssignedById: null
  });
});
```

再增加“旧自动负责人失去匹配规则后被清空”的测试，先给用户设置 `ownerId` 和 `ownerAssignedAt`，强制重算后断言两者为空。

- [ ] **Step 2: 验证测试因现有主管理员兜底而失败**

Run:

```bash
cd recall-admin
npx vitest run tests/integration/assignment/assign-task.test.ts
```

Expected: FAIL，实际 `assigneeId` 为主管理员，或抛出 `ASSIGNMENT_OWNER_REQUIRED`。

- [ ] **Step 3: 最小实现空负责人语义**

在 `decideUserAssignment` 中不再查询或传入主管理员默认负责人：

```ts
const workload = await loadAssignmentWorkload(
  tx,
  rules.flatMap((rule) =>
    [rule.assigneeId, rule.fallbackAssigneeId].filter(
      (id): id is string => Boolean(id)
    )
  )
);
const decision = matchRule(
  userToAssignmentContext(user),
  rules,
  workload,
  now
);
```

删除 `ASSIGNMENT_OWNER_REQUIRED` 断言，并按结果保存：

```ts
data: {
  ownerId: decision.assigneeId,
  ownerAssignmentMode: "AUTO",
  ownerAssignedAt: decision.assigneeId ? now : null,
  ownerAssignedById: null,
  ownerAssignmentReason: decision.assignmentReason
}
```

- [ ] **Step 4: 运行分配规则测试**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/assignment/match-rule.test.ts tests/integration/assignment/assign-task.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add recall-admin/src/modules/assignment/assign-task.ts recall-admin/tests/unit/assignment/match-rule.test.ts recall-admin/tests/integration/assignment/assign-task.test.ts
git commit -m "feat: preserve unassigned users without matching rules"
```

### Task 2: 支持未分配用户首次人工指定负责人

**Files:**
- Modify: `recall-admin/tests/unit/users/user-owner-service.test.ts`
- Modify: `recall-admin/tests/unit/users/user-owner-route.test.ts`
- Modify: `recall-admin/src/modules/users/user-owner-service.ts`
- Modify: `recall-admin/src/modules/users/owner-errors.ts`
- Modify: `recall-admin/src/app/api/users/[id]/owner/route.ts`

**Interfaces:**
- Consumes: `manuallyAssignUserOwner({ userId, actorId, targetOwnerId, reason, now? })`
- Produces: 同一函数接受 `ownerId = null` 的有效用户，返回 `previousOwnerId: null` 并转交开放任务。

- [ ] **Step 1: 把拒绝测试改为首次分配成功测试**

```ts
it("allows an administrator to assign an initially unassigned user", async () => {
  mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
    id: "user-1",
    ownerId: null,
    ownerAssignmentMode: "AUTO",
    ownerAssignedAt: null,
    countryCode: "DE",
    region: null,
    sourceDeletedAt: null
  });

  await expect(
    manuallyAssignUserOwner({
      userId: "user-1",
      actorId: "admin-1",
      targetOwnerId: "operator-2",
      reason: "德国暂由运营乙负责",
      now
    })
  ).resolves.toMatchObject({
    previousOwnerId: null,
    ownerId: "operator-2",
    mode: "MANUAL"
  });
});
```

- [ ] **Step 2: 验证测试以 `INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED` 失败**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/users/user-owner-service.test.ts
```

Expected: FAIL，错误码为 `INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED`。

- [ ] **Step 3: 删除首次自动分配前置条件**

移除：

```ts
if (!user.ownerId || !user.ownerAssignedAt) {
  throw new UserOwnerError("INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED");
}
```

同时从 `UserOwnerErrorCode` 和路由冲突错误映射中删除该错误码。保留目标成员有效性、管理员权限、人工锁定、审计和任务转交逻辑。

- [ ] **Step 4: 运行负责人服务与路由测试**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/users/user-owner-service.test.ts tests/unit/users/user-owner-route.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add recall-admin/src/modules/users/user-owner-service.ts recall-admin/src/modules/users/owner-errors.ts recall-admin/src/app/api/users/[id]/owner/route.ts recall-admin/tests/unit/users/user-owner-service.test.ts recall-admin/tests/unit/users/user-owner-route.test.ts
git commit -m "feat: allow initial manual user ownership"
```

### Task 3: 新增事务级地区与负责人组合分配

**Files:**
- Create: `recall-admin/src/modules/users/resolve-user-assignment.ts`
- Create: `recall-admin/src/modules/users/assignment-errors.ts`
- Create: `recall-admin/src/app/api/users/[id]/assignment/route.ts`
- Create: `recall-admin/tests/unit/users/resolve-user-assignment.test.ts`
- Create: `recall-admin/tests/unit/users/user-assignment-route.test.ts`
- Modify: `recall-admin/src/modules/users/user-location-service.ts`
- Modify: `recall-admin/src/modules/users/user-owner-service.ts`

**Interfaces:**
- Produces:

```ts
type ResolveUserAssignmentInput = {
  userId: string;
  actorId: string;
  countryCode?: string;
  region?: string | null;
  targetOwnerId?: string;
  reason: string;
  now?: Date;
};

type ResolveUserAssignmentResult = {
  userId: string;
  countryCode: string | null;
  region: string | null;
  ownerId: string | null;
  ownerAssignmentMode: "AUTO" | "MANUAL";
  matchedRuleId: string | null;
  transferredTasks: number;
};

resolveUserAssignment(
  input: ResolveUserAssignmentInput
): Promise<ResolveUserAssignmentResult>;
```

- [ ] **Step 1: 写组合服务失败测试**

测试三个独立行为：

```ts
it("uses the location rule when only geography is supplied", async () => {
  const result = await resolveUserAssignment({
    userId: "user-1",
    actorId: "admin-1",
    countryCode: "CN",
    region: "广东",
    reason: "确认地区",
    now
  });
  expect(result).toMatchObject({
    countryCode: "CN",
    region: "广东",
    ownerId: "operator-south",
    ownerAssignmentMode: "AUTO"
  });
});

it("keeps the user unassigned when the supplied location has no rule", async () => {
  const result = await resolveUserAssignment({
    userId: "user-1",
    actorId: "admin-1",
    countryCode: "DE",
    reason: "确认地区",
    now
  });
  expect(result.ownerId).toBeNull();
});

it("prefers the explicit owner over a matching location rule", async () => {
  const result = await resolveUserAssignment({
    userId: "user-1",
    actorId: "admin-1",
    countryCode: "CN",
    region: "广东",
    targetOwnerId: "operator-manual",
    reason: "指定专人负责",
    now
  });
  expect(result).toMatchObject({
    ownerId: "operator-manual",
    ownerAssignmentMode: "MANUAL"
  });
});
```

每个测试还断言 `auditLog.create` 的事件名为 `user.assignment_resolved`，并包含调整前后地区、负责人、命中规则和转交任务数。

- [ ] **Step 2: 验证服务尚不存在**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/users/resolve-user-assignment.test.ts
```

Expected: FAIL，无法导入 `resolve-user-assignment`。

- [ ] **Step 3: 实现事务级编排服务**

服务必须：

```ts
return prisma.$transaction(async (tx) => {
  await lockUser(tx, input.userId);
  const before = await loadAuthorizedUserAndOptionalOwner(tx, input);

  if (input.countryCode) {
    await updateManualLocationInTransaction(tx, {
      user: before.user,
      actorId: before.actor.id,
      countryCode: input.countryCode,
      region: input.region,
      reason,
      now
    });
  }

  const automatic = input.countryCode
    ? await assignUserOwnerInTransaction(tx, input.userId, now, {
        forceAutomatic: true
      })
    : null;

  const finalOwner = input.targetOwnerId
    ? await assignManualOwnerInTransaction(tx, {
        userId: input.userId,
        actorId: before.actor.id,
        targetOwnerId: input.targetOwnerId,
        reason,
        now
      })
    : automatic;

  await tx.auditLog.create({
    data: {
      actorId: before.actor.id,
      action: "user.assignment_resolved",
      entityType: "UserProfile",
      entityId: input.userId,
      metadata: buildAssignmentAuditMetadata(before, finalState)
    }
  });

  return finalState;
});
```

将现有地区更新和人工负责人更新的事务内部部分提取为可复用的 `...InTransaction` 函数，外部原接口仍各自开启事务，保持兼容。组合服务只写一条组合审计事件，内部函数通过 `writeAudit: false` 避免重复审计。

- [ ] **Step 4: 写路由失败测试**

路由测试覆盖：

```ts
expect((await PATCH(validRequest, context)).status).toBe(200);
expect((await PATCH(operatorRequest, context)).status).toBe(403);
expect((await PATCH(noCountryAndNoOwner, context)).status).toBe(400);
expect((await PATCH(regionWithoutCountry, context)).status).toBe(400);
expect((await PATCH(inactiveOwnerRequest, context)).status).toBe(409);
```

- [ ] **Step 5: 验证路由测试失败**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/users/user-assignment-route.test.ts
```

Expected: FAIL，路由模块不存在。

- [ ] **Step 6: 实现路由校验与错误映射**

请求 schema：

```ts
const schema = z.object({
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/u).optional(),
  region: z.string().trim().max(120).optional(),
  ownerId: z.string().min(1).optional(),
  reason: z.string().trim().min(1).max(500)
}).strict().superRefine((value, context) => {
  if (!value.countryCode && !value.ownerId) {
    context.addIssue({ code: "custom", message: "location or owner required" });
  }
  if (value.region && !value.countryCode) {
    context.addIssue({ code: "custom", message: "country required for region" });
  }
});
```

路由执行同源校验和 `operators:manage` 权限校验，然后调用 `resolveUserAssignment`。

- [ ] **Step 7: 运行组合服务与接口测试**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/users/resolve-user-assignment.test.ts tests/unit/users/user-assignment-route.test.ts tests/unit/users/user-location-service.test.ts tests/unit/users/user-owner-service.test.ts
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add recall-admin/src/modules/users/resolve-user-assignment.ts recall-admin/src/modules/users/assignment-errors.ts recall-admin/src/modules/users/user-location-service.ts recall-admin/src/modules/users/user-owner-service.ts recall-admin/src/app/api/users/[id]/assignment/route.ts recall-admin/tests/unit/users/resolve-user-assignment.test.ts recall-admin/tests/unit/users/user-assignment-route.test.ts
git commit -m "feat: resolve user territory and owner together"
```

### Task 4: 增加未分配查询和管理员首页提醒

**Files:**
- Modify: `recall-admin/src/modules/users/user-queries.ts`
- Modify: `recall-admin/src/app/(dashboard)/users/page.tsx`
- Modify: `recall-admin/src/modules/reports/dashboard-query.ts`
- Modify: `recall-admin/src/app/(dashboard)/dashboard/page.tsx`
- Modify: `recall-admin/src/components/dashboard/dashboard-overview.tsx`
- Modify: `recall-admin/src/components/dashboard/dashboard.module.css`
- Modify: `recall-admin/tests/integration/ui/user-task-scope.test.ts`
- Modify: `recall-admin/tests/unit/components/dashboard.test.tsx`

**Interfaces:**
- Produces: `UserFilters.ownerState?: "unassigned"`。
- Produces: `DashboardSnapshot.metrics.unassignedUsers: number`。
- Produces: `DashboardOverview` 的 `isAdministrator: boolean` 属性。

- [ ] **Step 1: 写未分配筛选失败测试**

在用户查询集成测试创建管理员、运营甲、运营乙、未分配用户，断言：

```ts
const adminPage = await findUsers(admin, {
  ownerState: "unassigned"
});
expect(adminPage.items.map((user) => user.id)).toEqual([
  newestUnassignedUserId,
  olderUnassignedUserId
]);

const operatorPage = await findUsers(operator, {
  ownerState: "unassigned"
});
expect(operatorPage.items).toEqual([]);
```

- [ ] **Step 2: 验证查询测试失败**

Run:

```bash
cd recall-admin
npx vitest run tests/integration/ui/user-task-scope.test.ts
```

Expected: FAIL，`ownerState` 尚未定义或未过滤。

- [ ] **Step 3: 实现查询语义和页面参数映射**

```ts
export type UserFilters = {
  // existing fields
  ownerState?: "unassigned";
};
```

在 `buildUserWhere` 中加入：

```ts
filters.ownerState === "unassigned"
  ? { ownerId: null }
  : filters.ownerId
    ? { ownerId: filters.ownerId }
    : {}
```

运营人员已有 `{ ownerId: viewer.id }` 范围条件，与 `ownerId: null` 同时生效时自然返回空集。

页面把 `ownerId=__UNASSIGNED__` 映射成 `ownerState: "unassigned"`，表头下拉增加：

```ts
{ value: "__UNASSIGNED__", label: "未分配" }
```

- [ ] **Step 4: 写管理员首页失败测试**

给 `DashboardSnapshot.metrics` 增加 `unassignedUsers: 12`，断言管理员能看到：

```ts
expect(
  screen.getByRole("link", { name: /待分配用户 12/ })
).toHaveAttribute("href", "/users?ownerId=__UNASSIGNED__");
```

运营人员渲染时断言该指标不存在。

- [ ] **Step 5: 验证首页测试失败**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/components/dashboard.test.tsx
```

Expected: FAIL，页面没有“待分配用户”指标。

- [ ] **Step 6: 实现管理员指标**

`getDashboardSnapshot` 仅对管理员执行：

```ts
prisma.userProfile.count({
  where: { sourceDeletedAt: null, ownerId: null }
})
```

运营人员的 `unassignedUsers` 固定为 `0`。`DashboardPage` 传入：

```tsx
<DashboardOverview
  isAdministrator={member.role !== "OPERATOR"}
  memberName={member.displayName}
  now={now}
  snapshot={snapshot}
/>
```

管理员的指标卡：

```tsx
<MetricCard
  label="待分配用户"
  value={metrics.unassignedUsers.toLocaleString("zh-CN")}
  note={metrics.unassignedUsers ? "需要确认地区或指定运营" : "所有用户均已有负责人"}
  icon={UserRoundPlus}
  tone={metrics.unassignedUsers ? "warning" : "positive"}
  href="/users?ownerId=__UNASSIGNED__"
/>
```

CSS 指标网格允许五张卡片在桌面端等宽，在窄屏自动换行。

- [ ] **Step 7: 运行查询和首页测试**

Run:

```bash
cd recall-admin
npx vitest run tests/integration/ui/user-task-scope.test.ts tests/unit/components/dashboard.test.tsx
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add recall-admin/src/modules/users/user-queries.ts recall-admin/src/app/(dashboard)/users/page.tsx recall-admin/src/modules/reports/dashboard-query.ts recall-admin/src/app/(dashboard)/dashboard/page.tsx recall-admin/src/components/dashboard/dashboard-overview.tsx recall-admin/src/components/dashboard/dashboard.module.css recall-admin/tests/integration/ui/user-task-scope.test.ts recall-admin/tests/unit/components/dashboard.test.tsx
git commit -m "feat: surface unassigned users to administrators"
```

### Task 5: 在用户列表完成分配

**Files:**
- Create: `recall-admin/src/components/users/user-assignment-control.tsx`
- Create: `recall-admin/tests/unit/components/user-assignment-control.test.tsx`
- Modify: `recall-admin/src/components/tables/user-table.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Modify: `recall-admin/tests/e2e/navigation.spec.ts`

**Interfaces:**
- Consumes: `PATCH /api/users/:id/assignment`。
- Produces: 未分配用户的“立即分配”编辑器。

- [ ] **Step 1: 写组件失败测试**

测试：

```ts
render(
  <UserAssignmentControl
    userId="user-1"
    currentCountryCode={null}
    currentRegion={null}
    members={[{ id: "operator-1", displayName: "华南运营" }]}
  />
);

await user.click(screen.getByRole("button", { name: "立即分配" }));
await user.type(screen.getByLabelText("国家代码"), "CN");
await user.type(screen.getByLabelText("省份或地区"), "广东");
await user.type(screen.getByLabelText("分配原因"), "确认地区");
await user.click(screen.getByRole("button", { name: "确认分配" }));

expect(fetch).toHaveBeenCalledWith(
  "/api/users/user-1/assignment",
  expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({
      countryCode: "CN",
      region: "广东",
      reason: "确认地区"
    })
  })
);
```

再测试仅选择负责人、同时选择地区和负责人、没有选择任何目标时按钮禁用，以及接口成功后 `router.refresh()`。

- [ ] **Step 2: 验证组件尚不存在**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/components/user-assignment-control.test.tsx
```

Expected: FAIL，无法导入组件。

- [ ] **Step 3: 实现分配编辑器**

组件状态：

```ts
const [countryCode, setCountryCode] = useState(currentCountryCode ?? "");
const [region, setRegion] = useState(currentRegion ?? "");
const [ownerId, setOwnerId] = useState("");
const [reason, setReason] = useState("");
```

提交体只包含用户实际填写的可选字段：

```ts
const payload = {
  ...(countryCode.trim()
    ? {
        countryCode: countryCode.trim().toUpperCase(),
        ...(region.trim() ? { region: region.trim() } : {})
      }
    : {}),
  ...(ownerId ? { ownerId } : {}),
  reason: reason.trim()
};
```

按钮仅在 `(countryCode.trim() || ownerId) && reason.trim()` 时启用。成功后关闭编辑器并刷新；失败显示“用户仍处于未分配状态，请重试”。

- [ ] **Step 4: 在用户表接入**

当 `canManageOwners && !user.ownerId` 时渲染：

```tsx
<UserAssignmentControl
  userId={user.id}
  currentCountryCode={user.countryCode}
  currentRegion={user.region}
  members={members}
/>
```

已分配用户继续使用 `UserOwnerControl`，不改变已有调整与恢复自动分配功能。

- [ ] **Step 5: 增加导航验收断言**

管理员用户中心断言负责人筛选存在“未分配”选项，并在待分配 fixture 行中看到“立即分配”。运营人员页面断言不出现该按钮。

- [ ] **Step 6: 运行组件及页面测试**

Run:

```bash
cd recall-admin
npx vitest run tests/unit/components/user-assignment-control.test.tsx tests/unit/components/dashboard.test.tsx tests/integration/ui/user-task-scope.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add recall-admin/src/components/users/user-assignment-control.tsx recall-admin/src/components/tables/user-table.tsx recall-admin/src/components/workspaces/workspace.module.css recall-admin/tests/unit/components/user-assignment-control.test.tsx recall-admin/tests/e2e/navigation.spec.ts
git commit -m "feat: resolve unassigned users from user list"
```

### Task 6: 全量验证与浏览器验收

**Files:**
- Modify only if a verification failure is caused by this feature.

**Interfaces:**
- Consumes: all feature behavior from Tasks 1–5.
- Produces: verified, clean branch ready for handoff.

- [ ] **Step 1: 运行管理台单元和集成测试**

Run:

```bash
cd recall-admin
npm test
```

Expected: all test files pass。

- [ ] **Step 2: 运行静态检查和生产构建**

Run separately:

```bash
cd recall-admin
npm run lint
npm run typecheck
npm run build
```

Expected: each command exits `0`，生产路由包含 `/api/users/[id]/assignment`。

- [ ] **Step 3: 浏览器验收**

启动本地管理台，创建隔离的管理员、运营、分配规则和待分配用户 fixture，依次验证：

```text
管理员首页 → 待分配用户数量 → 点击进入未分配筛选
仅填 CN/广东 → 自动匹配华南运营 → 用户离开待分配列表
仅填 DE → 没有规则 → 用户仍为未分配
直接选择运营 → 人工负责人 → 用户离开待分配列表
运营人员登录 → 不显示待分配指标和立即分配按钮
```

验收后按 fixture 唯一 ID 清理测试数据，不删除既有用户数据。

- [ ] **Step 4: 检查工作区**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；仅包含计划内变更，最终提交后工作区为空。

- [ ] **Step 5: 提交验收修正**

只有在步骤 1–4 发现并修复了本功能问题时，才逐一暂存实际修正文件并以
`fix: complete unassigned user workflow verification` 创建提交；没有修正时不创建空提交。
