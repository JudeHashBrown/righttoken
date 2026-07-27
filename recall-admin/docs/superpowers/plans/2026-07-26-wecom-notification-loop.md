# RightToken 企微通知闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有企微群机器人基础上增加企业微信自建应用直发、成员映射、按负责人路由、紧急群发和失败升级，形成可本地验证的通知闭环。

**Architecture:** 使用现有 `IntegrationCredential` 加密保存自建应用和机器人配置；企业微信客户端只负责令牌与消息发送，通知服务负责按任务最新负责人生成幂等通知意图，Worker 负责投递、错误分类、重试和最终失败升级。数据库显式区分 `WECOM_APP` 与 `WECOM_ROBOT`，历史 `WECOM` 数据迁移为机器人通知。

**Tech Stack:** Next.js 16、TypeScript、Prisma/PostgreSQL、pg-boss、Vitest、React Testing Library、Docker Compose。

## Global Constraints

- 当前只在本地分支开发，不提交、不推送 GitHub。
- 生产凭据、真实企微 UserID、真实邮箱和 IP 不得写入仓库或测试快照。
- 企微外部消息不得包含完整邮箱、注册 IP 或任何密钥。
- 普通/重要任务直发负责人；紧急任务同时直发负责人和运营群。
- 无负责人或无企微映射时升级主管理员和运营群。
- 外部渠道失败不得影响后台任务和站内通知。
- 开发测试只使用本地模拟企微服务器和虚构成员。

---

### Task 1: 增加企微成员映射与独立通知渠道

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260726150000_wecom_app_notifications/migration.sql`
- Regenerate: `src/generated/prisma/**`
- Test: `tests/integration/notifications/schema.test.ts`

**Interfaces:**
- Produces: `Member.wecomUserId: string | null`
- Produces: `NotificationChannel.WECOM_APP`
- Produces: `NotificationChannel.WECOM_ROBOT`

- [ ] **Step 1: 写失败的数据库结构测试**

```ts
it("stores a unique WeCom UserID and distinct app/robot intents", async () => {
  const member = await prisma.member.create({
    data: {
      email: `wecom-${randomUUID()}@example.test`,
      displayName: "企微测试运营",
      passwordHash: "not-used",
      role: "OPERATOR",
      wecomUserId: `wecom-${randomUUID()}`
    }
  });
  expect(member.wecomUserId).not.toBeNull();
  expect(["WECOM_APP", "WECOM_ROBOT"]).toContain("WECOM_APP");
});
```

- [ ] **Step 2: 运行测试并确认因字段/枚举不存在而失败**

Run:

```bash
DATABASE_URL=postgresql://righttoken:righttoken@127.0.0.1:55432/righttoken_recall \
npx vitest run tests/integration/notifications/schema.test.ts
```

Expected: FAIL，Prisma 类型或字段不存在。

- [ ] **Step 3: 修改 Prisma 模型和迁移**

```prisma
enum NotificationChannel {
  IN_APP
  WECOM_APP
  WECOM_ROBOT
  EMAIL
}

model Member {
  wecomUserId String? @unique
}
```

迁移必须把历史 `NotificationIntent.channel = 'WECOM'` 转换为 `WECOM_ROBOT`，再替换旧枚举，不能删除历史通知。

- [ ] **Step 4: 生成客户端、部署迁移并运行结构测试**

Run:

```bash
npx prisma generate
npm run db:deploy
npx vitest run tests/integration/notifications/schema.test.ts
```

Expected: PASS。

---

### Task 2: 实现企业微信自建应用客户端

**Files:**
- Create: `src/modules/notifications/adapters/wecom-app.ts`
- Modify: `src/modules/notifications/types.ts`
- Test: `tests/unit/notifications/wecom-app.test.ts`

**Interfaces:**
- Produces: `wecomAppConfigSchema`
- Produces: `createWecomAppAdapter(config, options?)`
- Produces: `WecomDeliveryError`
- Consumes: `NotificationAdapter`

- [ ] **Step 1: 写令牌获取和文本卡片发送的失败测试**

测试必须断言：

```ts
expect(fetchImpl).toHaveBeenNthCalledWith(
  1,
  expect.stringContaining("/cgi-bin/gettoken"),
  expect.any(Object)
);
expect(fetchImpl).toHaveBeenNthCalledWith(
  2,
  expect.stringContaining("/cgi-bin/message/send?access_token="),
  expect.objectContaining({
    method: "POST",
    body: expect.stringContaining('"msgtype":"textcard"')
  })
);
```

- [ ] **Step 2: 写令牌缓存、过期刷新和错误分类测试**

覆盖：

- 两次发送复用未过期令牌。
- 令牌错误刷新一次再发送。
- 网络、429、5xx 为可重试错误。
- 凭据错误和无效成员为不可重试错误。
- 消息体包含任务链接但不包含完整邮箱和 IP。

- [ ] **Step 3: 运行测试并确认模块不存在或行为缺失**

Run:

```bash
npx vitest run tests/unit/notifications/wecom-app.test.ts
```

Expected: FAIL。

- [ ] **Step 4: 实现最小客户端**

```ts
export const wecomAppConfigSchema = z.object({
  corpId: z.string().trim().min(1),
  agentId: z.string().trim().regex(/^\d+$/),
  secret: z.string().trim().min(1)
}).strict();
```

客户端使用 5 秒超时，缓存 `access_token` 至供应商过期时间前 60 秒。适配器渠道固定为 `WECOM_APP`，接收人使用后台成员的 `wecomUserId`。

- [ ] **Step 5: 运行测试并确认通过**

Run:

```bash
npx vitest run tests/unit/notifications/wecom-app.test.ts
```

Expected: PASS。

---

### Task 3: 配置自建应用与群机器人

**Files:**
- Modify: `src/app/api/integrations/wecom/route.ts`
- Modify: `src/app/api/integrations/wecom/test/route.ts`
- Create: `src/app/api/integrations/wecom/app/route.ts`
- Create: `src/app/api/integrations/wecom/app/test/route.ts`
- Modify: `src/components/settings/wecom-settings-form.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Test: `tests/integration/notifications/wecom-integration-routes.test.ts`
- Test: `tests/unit/components/wecom-settings-form.test.tsx`

**Interfaces:**
- Robot save: `POST /api/integrations/wecom`
- Robot test: `POST /api/integrations/wecom/test`
- App save: `POST /api/integrations/wecom/app`
- App test: `POST /api/integrations/wecom/app/test`

- [ ] **Step 1: 写接口失败测试**

断言：

- 只有具备 `integrations:manage` 权限的成员可以保存。
- Secret 保存后不出现在响应、数据库元数据或审计日志。
- 应用测试只允许向请求中明确提供的内部测试 `wecomUserId` 发送无用户信息消息。
- 测试失败保存脱敏错误代码。

- [ ] **Step 2: 写设置表单失败测试**

断言页面包含两个紧凑模块：

- 企业微信应用：连接名称、CorpID、AgentID、Secret、测试成员 UserID。
- 运营群机器人：连接名称、Webhook。

Secret/Webhook 保存成功后清空输入框，不回显完整值。

- [ ] **Step 3: 运行测试并确认失败**

Run:

```bash
npx vitest run \
  tests/integration/notifications/wecom-integration-routes.test.ts \
  tests/unit/components/wecom-settings-form.test.tsx
```

- [ ] **Step 4: 实现接口与前端表单**

应用配置保存为：

```ts
await saveIntegrationCredential(actorId, {
  kind: "WECOM_APP",
  displayName,
  enabled,
  config: { corpId, agentId, secret },
  metadata: { corpIdSuffix: corpId.slice(-4), agentId }
});
```

前端只显示“已配置/未配置、最后测试、最后成功、错误状态”，不展示内部鉴权流程。

- [ ] **Step 5: 运行测试并确认通过**

Expected: PASS。

---

### Task 4: 增加后台成员与企微 UserID 映射

**Files:**
- Create: `src/app/api/members/[id]/wecom/route.ts`
- Modify: `src/app/(dashboard)/members/page.tsx`
- Create: `src/components/members/member-wecom-mapping-form.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/integration/auth/member-wecom-route.test.ts`
- Test: `tests/unit/components/member-wecom-mapping-form.test.tsx`

**Interfaces:**
- Produces: `PATCH /api/members/:id/wecom`
- Request: `{ wecomUserId: string | null }`
- Response: `{ member: { id, wecomUserId } }`

- [ ] **Step 1: 写权限、唯一性和清除映射的失败测试**

验证：

- 管理员可以设置运营成员映射。
- 普通运营不能修改映射。
- 重复 UserID 返回 409。
- 空字符串归一化为 `null`。
- 停用成员可以保留历史映射，但不会接收新通知。

- [ ] **Step 2: 写非技术成员页面测试**

页面仅展示“已映射、未映射、已停用”和可编辑 UserID，不展示数据库字段名或渠道枚举。

- [ ] **Step 3: 运行测试并确认失败**

- [ ] **Step 4: 实现接口和紧凑表单**

服务端使用 Zod 校验：

```ts
const inputSchema = z.object({
  wecomUserId: z.string().trim().min(1).max(128).nullable()
}).strict();
```

- [ ] **Step 5: 运行测试并确认通过**

---

### Task 5: 按最新负责人生成企微应用和群机器人通知

**Files:**
- Modify: `src/modules/notifications/notification-service.ts`
- Modify: `src/modules/notifications/policy-config.ts`
- Modify: `src/modules/tasks/create-triggered-task.ts`
- Modify: `src/modules/mail/sync-mailbox.ts`
- Test: `tests/integration/notifications/delivery.test.ts`
- Test: `tests/unit/notifications/redact-notification.test.ts`

**Interfaces:**
- Produces: `createTaskNotificationIntents(taskId, now, appUrl)`
- Produces: `createNotificationEscalationIntents(taskId, reason, now)`

- [ ] **Step 1: 写普通/重要任务直发负责人失败测试**

期望通知集合：

```ts
[
  { channel: "IN_APP", recipient: member.id },
  { channel: "WECOM_APP", recipient: member.wecomUserId }
]
```

通知策略开启邮件时再增加 `EMAIL`。

- [ ] **Step 2: 写紧急任务双通道和无映射升级失败测试**

紧急任务包含：

```ts
[
  { channel: "WECOM_APP", recipient: owner.wecomUserId },
  { channel: "WECOM_ROBOT", recipient: "integration:wecom-robot" }
]
```

无负责人或无映射时，自建应用接收人为主管理员 `wecomUserId`，并始终增加群机器人通知。

- [ ] **Step 3: 写幂等与隐私测试**

相同 `taskId + channel + recipient` 只能有一条通知意图。所有外部渠道 payload 不得包含完整邮箱和注册 IP。

- [ ] **Step 4: 运行测试并确认失败**

- [ ] **Step 5: 实现通知路由**

读取任务时必须包含：

```ts
assignee: {
  select: {
    id: true,
    email: true,
    active: true,
    wecomUserId: true
  }
}
```

路由始终基于任务当前负责人，不复制用户旧负责人。

- [ ] **Step 6: 运行相关测试并确认通过**

---

### Task 6: 投递、重试和最终失败升级

**Files:**
- Modify: `src/worker/handlers/notification-delivery.ts`
- Modify: `src/modules/notifications/notification-service.ts`
- Create: `src/modules/notifications/dead-letter-escalation.ts`
- Test: `tests/unit/worker/notification-delivery.test.ts`
- Test: `tests/integration/notifications/dead-letter-escalation.test.ts`

**Interfaces:**
- Consumes: `WECOM_APP`, `WECOM_ROBOT`, `EMAIL` 待发送意图
- Produces: 最终失败的站内和主管理员邮件通知

- [ ] **Step 1: 写适配器注册和渠道投递失败测试**

Worker 同时加载：

- `WECOM_APP`
- `WECOM_ROBOT`
- `EMAIL`

- [ ] **Step 2: 写错误分类失败测试**

`sendNotificationIntent` 必须保留适配器错误代码：

- 可重试：`FAILED + nextAttemptAt`
- 不可重试：`DEAD_LETTER + nextAttemptAt null`
- 达到最大次数：`DEAD_LETTER`

- [ ] **Step 3: 写最终失败升级失败测试**

每条原始意图最多生成一次：

- 主管理员站内通知
- 主管理员邮件通知
- 机器人可用且不是机器人自身失败时的运营群通知

- [ ] **Step 4: 实现最小错误分类和升级服务**

适配器错误必须暴露：

```ts
class NotificationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean
  ) {
    super(code);
  }
}
```

数据库只保存稳定错误码，不保存供应商响应正文或凭据。

- [ ] **Step 5: 运行测试并确认通过**

---

### Task 7: 本地模拟企微闭环与发布验证

**Files:**
- Create: `tests/contract/wecom-notification-loop.test.ts`
- Modify: `.env.example`
- Modify: `docs/deployment.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/runbooks/local-development.md`

**Interfaces:**
- Uses: 本地模拟 token/message/webhook 端点
- Verifies: 配置、成员映射、路由、投递、重试、升级全链路

- [ ] **Step 1: 创建本地模拟企微契约测试**

场景：

1. 配置虚构 CorpID、AgentID、Secret。
2. 映射虚构运营 `wecomUserId`。
3. 创建普通、F 组和无负责人任务。
4. 检查直发、群发、链接和脱敏。
5. 模拟 429 后成功。
6. 模拟无效凭据并检查邮件/后台升级。

- [ ] **Step 2: 运行完整通知测试**

Run:

```bash
npx vitest run tests/unit/notifications tests/unit/worker \
  tests/integration/notifications tests/contract/wecom-notification-loop.test.ts
```

Expected: PASS。

- [ ] **Step 3: 运行全项目质量检查**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run worker:build
git diff --check
```

Expected: 全部通过，无警告和差异格式错误。

- [ ] **Step 4: 重建本地容器并应用迁移**

Run:

```bash
docker compose up -d --build
docker compose ps
```

Expected: 数据库、Web、Worker 全部 healthy。

- [ ] **Step 5: 使用虚构成员做本地验收**

验证普通任务只直发负责人，F 组任务直发加群发，无映射任务升级主管理员；所有消息均不包含完整邮箱和 IP。

## 计划自检

- 设计中的自建应用、群机器人、成员映射、隐私、重试、失败升级和界面均有对应任务。
- 渠道名称、接口路径和配置种类在各任务中保持一致。
- 没有真实凭据、真实企微成员或生产数据依赖。
- 没有要求提交或推送 GitHub。
