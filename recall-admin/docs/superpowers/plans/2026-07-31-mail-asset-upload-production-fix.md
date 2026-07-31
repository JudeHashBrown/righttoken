# Mail Asset Upload Production Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production mail image and image-attachment uploads by enforcing and wiring private S3-compatible storage, with a clear operator-facing error when storage is unavailable.

**Architecture:** Extend the existing server environment schema and Compose contract instead of adding a second storage path. Keep storage failures inside the mail asset boundary by translating configuration failures into one stable service error consumed by the existing API and editor.

**Tech Stack:** Next.js 16, TypeScript, Zod, Prisma, AWS SDK S3, Vitest, Docker Compose.

## Global Constraints

- Production storage is private S3 or S3-compatible object storage only.
- Supported uploads remain JPG, PNG, and WebP images, maximum 5 MB each.
- No real credentials are committed.
- Database rows are created only after object storage writes succeed.

---

### Task 1: Production storage configuration contract

**Files:**
- Modify: `src/lib/env/server.ts`
- Modify: `tests/unit/env/server.test.ts`
- Modify: `../deploy/docker-compose.recall.yml`
- Modify: `../deploy/recall.env.example`
- Modify: `tests/unit/config/compose-files.test.ts`

**Interfaces:**
- Consumes: `parseServerEnv(input)` and the `x-recall-environment` Compose anchor.
- Produces: parsed `MAIL_ASSET_*` fields and mapped `RECALL_MAIL_ASSET_*` deployment variables.

- [ ] Write tests requiring production S3 configuration and every Compose mapping.
- [ ] Run the focused tests and confirm they fail because the fields and mappings are absent.
- [ ] Add the environment schema fields, cross-field production validation, Compose mappings, and blank-safe example values.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Stable upload failure

**Files:**
- Modify: `src/modules/mail/assets/asset-service.ts`
- Modify: `src/app/api/mail/assets/route.ts`
- Modify: `src/components/mail/mail-rich-editor.tsx`
- Modify: `tests/unit/modules/mail/mail-asset-service.test.ts`
- Modify: `tests/unit/api/mail-asset-routes.test.ts`
- Modify: `tests/unit/components/mail-rich-editor.test.tsx`

**Interfaces:**
- Consumes: `getMailAssetStorage()` and `MailAssetServiceError`.
- Produces: `MAIL_ASSET_STORAGE_UNAVAILABLE`, returned as HTTP 503 and displayed as “图片存储暂不可用，请联系管理员”.

- [ ] Write service, route, and component tests for a storage configuration failure.
- [ ] Run the focused tests and confirm the expected error-code assertions fail.
- [ ] Wrap storage initialization errors, map the stable code to 503, and add the Chinese UI message.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Deployment documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`
- Modify: `docs/runbooks/deployment.md`

**Interfaces:**
- Consumes: the production variable names established in Task 1.
- Produces: exact deployment and smoke-test instructions without credentials.

- [ ] Document required production S3 variables and a post-deploy upload smoke test.
- [ ] Run mail asset, environment, and Compose focused tests.
- [ ] Run the full unit suite, lint, typecheck, and production build.
- [ ] Inspect the final diff for secrets, unrelated changes, and whitespace errors.
