# F Group Anomaly Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the operational evidence behind F-group classification and show it consistently in the user list, user detail, segment history, and urgent task.

**Architecture:** Extend the RightToken snapshot with a nullable structured anomaly detail, persist its bounded scalar fields on `UserProfile`, and format all operator-facing copy through one pure presentation module. Keep the current anomaly state ephemeral while preserving the generated text in history and tasks.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 7/PostgreSQL, Vitest, Playwright.

## Global Constraints

- Do not read or persist error messages, request bodies, response bodies, headers, tokens, secrets, or raw provider detail.
- Preserve the existing anomaly trigger thresholds and clearing behavior.
- Do not commit or push until the user requests the final unified GitHub submission.

---

### Task 1: Anomaly presentation contract

**Files:**
- Create: `src/modules/anomalies/presentation.ts`
- Test: `tests/unit/anomalies/presentation.test.ts`

**Interfaces:**
- Consumes: nullable structured anomaly fields from `UserProfile` or `RightTokenUserSnapshot`.
- Produces: `presentServiceAnomaly(input)` returning `{ title, summary, detail, taskReason }`.

- [ ] Write failing tests for upstream, routing, network, count formatting, and missing-field fallback.
- [ ] Run `npx vitest run tests/unit/anomalies/presentation.test.ts` and confirm failures are caused by the missing module.
- [ ] Implement category selection and bounded Chinese copy without exposing raw untrusted fields as HTML.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Source snapshot and persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730170000_add_anomaly_details/migration.sql`
- Modify: `src/modules/integrations/righttoken/adapter.ts`
- Modify: `src/modules/integrations/righttoken/database-adapter.ts`
- Modify: `src/modules/integrations/righttoken/reconcile.ts`
- Test: `tests/unit/integrations/righttoken-database-adapter.test.ts`
- Test: `tests/integration/integrations/reconciliation.test.ts`

**Interfaces:**
- Produces: `RightTokenAnomalyDetail` and optional `RightTokenUserSnapshot.anomalyDetail`.
- Persists: phase, type/code, owner, status code, model, platform, request/failure/consecutive counts, and last occurrence time.

- [ ] Extend the adapter unit fixture and assertions first; run the focused unit test and confirm the new assertions fail.
- [ ] Add reconciliation tests for saving an active detail and clearing it when inactive; run the integration test and confirm failure.
- [ ] Add nullable Prisma fields and the matching additive SQL migration.
- [ ] Extend the SQL query with qualifying-error metadata and latest-window metrics while retaining existing thresholds.
- [ ] Map structured database values into the snapshot and persist/clear fields during reconciliation without reading error messages.
- [ ] Run Prisma generation, then rerun both focused test files until green.

### Task 3: F-group reason and urgent task

**Files:**
- Modify: `src/modules/segmentation/resegment-user.ts`
- Modify: `src/worker/handlers/segment-check.ts`
- Test: `tests/integration/worker/segment-check.test.ts`
- Test: `tests/integration/integrations/reconciliation.test.ts`

**Interfaces:**
- Consumes: `presentServiceAnomaly(user)`.
- Produces: actionable F-group `reasonLabel`, `SegmentHistory.reason`, and `RecallTask.reason`.

- [ ] Add failing assertions that a newly classified F user and its urgent task contain the specific reason.
- [ ] Run the focused integration tests and confirm the generic current text causes failure.
- [ ] Replace only F-group reason text with the shared presentation output; keep all other segments unchanged.
- [ ] Rerun focused integration tests and confirm they pass.

### Task 4: User list and detail

**Files:**
- Modify: `src/modules/users/user-queries.ts`
- Modify: `src/components/tables/user-table.tsx`
- Modify: `src/app/(dashboard)/users/[id]/page.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/unit/components/workspaces.test.tsx`
- Test: `tests/integration/ui/workspace-routes.test.ts`

**Interfaces:**
- Consumes: persisted anomaly fields and `presentServiceAnomaly`.
- Produces: compact F-row summary plus a conditional current-anomaly detail section.

- [ ] Add failing component/route assertions for the title, HTTP status, failure ratio, model, and sanitized message.
- [ ] Run the focused UI tests and confirm failure.
- [ ] Select anomaly fields in list queries and render the shared presentation in both surfaces with existing typography and spacing.
- [ ] Rerun focused UI tests and confirm they pass.

### Task 5: Verification

**Files:**
- Modify only files required by failures caused by this feature.

**Interfaces:**
- Produces: evidence that the approved behavior works without regressions.

- [ ] Run `npm test`.
- [ ] Run `npm run test:integration`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Start or reuse localhost and inspect an F-group list row, its user detail, and its urgent task.
- [ ] Review `git diff --check`, `git status --short`, and the requirement checklist; do not commit or push.
