# 任务异常原因高亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 F 组任务详情页用黄底展示中文异常结论和安全的上游原始错误信息。

**Architecture:** 从 RightToken 错误日志抽取安全的错误消息，随现有异常详情同步到 `UserProfile`。由纯展示函数完成诊断映射，任务查询返回异常字段，服务端任务页面渲染黄色错误卡。

**Tech Stack:** Next.js 16、React 19、TypeScript、Prisma/PostgreSQL、Vitest、Testing Library。

## Global Constraints

- 原始错误优先级为 `upstream_error_message`、`error_message`、`upstream_error_detail`。
- 不读取或显示 `error_body`、请求正文或请求头。
- 错误文本按纯文本展示，规范空白并限制 500 字符。
- 无明确原因时必须显示“未返回可识别的具体错误类型”。
- 不执行 `git add`、`git commit` 或 `git push`。

---

### Task 1: 保存原始错误消息

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260731200000_add_anomaly_error_message/migration.sql`
- Modify: `src/modules/integrations/righttoken/adapter.ts`
- Modify: `src/modules/integrations/righttoken/database-adapter.ts`
- Modify: `src/modules/integrations/righttoken/reconcile.ts`
- Modify: `src/modules/anomalies/persistence.ts`
- Modify: `src/modules/users/event-schema.ts`
- Modify: `src/modules/users/apply-event.ts`
- Test: `tests/unit/integrations/righttoken-database-adapter.test.ts`
- Test: `tests/integration/integrations/reconciliation.test.ts`
- Test: `tests/integration/users/ingest-event.test.ts`

**Interfaces:**
- Produces: `UserProfile.anomalyErrorMessage: string | null`.
- Produces: `RightTokenAnomalyDetail.errorMessage: string | null`.

- [x] **Step 1: Add failing adapter, reconciliation and event tests**

Assert the newest qualifying error returns `errorMessage: "no accounts available"`, reconciliation stores it, and a recovery event clears it.

- [x] **Step 2: Run focused tests and verify RED**

Run:
`npx vitest run tests/unit/integrations/righttoken-database-adapter.test.ts`

Run:
`npm run test:integration -- tests/integration/integrations/reconciliation.test.ts tests/integration/users/ingest-event.test.ts`

Expected: FAIL because `anomalyErrorMessage` and `errorMessage` do not exist.

- [x] **Step 3: Add schema, migration and source extraction**

Add `anomalyErrorMessage String?` to `UserProfile`. In `qualifying_error_logs`, select:

```sql
COALESCE(
  NULLIF(BTRIM(error_log.upstream_error_message), ''),
  NULLIF(BTRIM(error_log.error_message), ''),
  NULLIF(BTRIM(error_log.upstream_error_detail), '')
) AS error_message
```

Normalize whitespace and truncate to 500 characters before returning the snapshot.

- [x] **Step 4: Persist and clear the field**

Map `errorMessage` in reconciliation and `service.anomaly`; add it to `clearedAnomalyDetails`.

- [x] **Step 5: Generate Prisma and verify focused tests GREEN**

Run: `npx prisma generate`

Run the focused unit and integration commands from Step 2. Expected: PASS.

---

### Task 2: 生成中文诊断

**Files:**
- Modify: `src/modules/anomalies/presentation.ts`
- Test: `tests/unit/anomalies/presentation.test.ts`

**Interfaces:**
- Extends: `ServiceAnomalyPresentationInput.anomalyErrorMessage`.
- Produces: `ServiceAnomalyPresentation.diagnosis` and `rawError`.

- [x] **Step 1: Add failing diagnosis tests**

Cover `no accounts available`, quota/balance, network timeout, routing, internal, upstream and unknown errors. Assert raw text is preserved and unknown input returns the explicit fallback.

- [x] **Step 2: Run test and verify RED**

Run: `npx vitest run tests/unit/anomalies/presentation.test.ts`

Expected: FAIL because `diagnosis` and `rawError` do not exist.

- [x] **Step 3: Implement deterministic diagnosis mapping**

Normalize error message and error type to lowercase matching text. Prefer exact high-signal phrases, then network/routing/ownership categories, and finally the unknown fallback.

- [x] **Step 4: Run test and verify GREEN**

Run the command from Step 2. Expected: PASS.

---

### Task 3: 在任务页黄底显示具体错误

**Files:**
- Create: `src/components/tasks/task-anomaly-highlight.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `src/modules/tasks/task-queries.ts`
- Modify: `src/app/(dashboard)/tasks/[id]/page.tsx`
- Create: `tests/unit/components/task-anomaly-highlight.test.tsx`

**Interfaces:**
- Consumes: `ServiceAnomalyPresentation`.
- Produces: `TaskAnomalyHighlight`.

- [x] **Step 1: Add failing component test**

Render a presentation with diagnosis `上游无可用账号` and raw error `no accounts available`; assert `具体错误` and both values are visible.

- [x] **Step 2: Run test and verify RED**

Run: `npx vitest run tests/unit/components/task-anomaly-highlight.test.tsx`

Expected: FAIL because the component does not exist.

- [x] **Step 3: Implement the yellow highlight**

Render a semantic status block using a pale yellow background, amber border, dark readable text, and a separate raw-error line. Add anomaly fields to the task user select and render the component below the task reason when `presentServiceAnomaly(task.user)` is non-null.

- [x] **Step 4: Run component and page-related tests**

Run:
`npx vitest run tests/unit/components/task-anomaly-highlight.test.tsx tests/unit/anomalies/presentation.test.ts`

Expected: PASS.

---

### Task 4: 完整验证

**Files:**
- Verify all files from Tasks 1–3.

**Interfaces:**
- No new interfaces.

- [x] **Step 1: Run regression checks**

Run:

```bash
npm test
npm run test:integration
npm run lint
npm run typecheck
npm run build
npm run worker:build
git diff --check
```

Expected: every command exits with code 0.

- [x] **Step 2: Verify localhost visually**

Open an F-group task at `http://localhost:3000/tasks/<id>`. Confirm the yellow card displays the Chinese diagnosis, original error and supporting metadata without HTML interpretation.

- [x] **Step 3: Confirm Git remains untouched**

Run: `git status --short --branch` and `git diff --cached --quiet`.

Expected: changes remain unstaged on the current branch.

---

### Task 5: 修复异常恢复后黄底卡消失

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260731213000_add_task_anomaly_snapshot/migration.sql`
- Create: `src/modules/anomalies/task-presentation.ts`
- Modify: `src/modules/tasks/create-triggered-task.ts`
- Modify: `src/app/(dashboard)/tasks/[id]/page.tsx`
- Modify: `prisma/seed.ts`
- Test: `tests/unit/anomalies/task-presentation.test.ts`
- Test: `tests/integration/tasks/task-lifecycle.test.ts`

- [x] **Step 1: Reproduce the disappearing card**

Confirm the existing F task has `anomalyActive=false` and no current anomaly details, causing `presentServiceAnomaly(task.user)` to return `null`.

- [x] **Step 2: Add failing snapshot and legacy-task tests**

Assert a stored task snapshot remains visible after the user anomaly clears, and a legacy service-anomaly task displays an explicit unknown-error highlight instead of hiding the card.

- [x] **Step 3: Persist and present task anomaly snapshots**

Store the safe anomaly fields on new F tasks, prefer the snapshot on the task page, and retain a fallback for old tasks.

- [x] **Step 4: Update and verify the local F task**

Apply the migration and seed update, restart localhost, and visually confirm the normal task page displays `上游无可用账号` and `no accounts available` without temporary user-state changes.

- [x] **Step 5: Run full regression checks**

Run unit, integration, lint, typecheck, production build, worker build, schema validation and `git diff --check`.
