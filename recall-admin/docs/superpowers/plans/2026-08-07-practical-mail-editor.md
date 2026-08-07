# Practical Mail Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the minimum missing formatting and common business-file attachments to the existing mail composer.

**Architecture:** Extend the current private mail-asset pipeline with a focused document normalizer, then add native formatting controls to the current visual editor. Preserve the existing sanitizer, storage, authorization, preview, and sending paths.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Prisma, sanitize-html, Nodemailer.

## Global Constraints

- Do not replace the editor framework or add a new editor dependency.
- Allow only PDF, DOC, DOCX, XLS, and XLSX as non-image attachments.
- Enforce 10 MB per document, 10 assets per message, and 20 MB total.
- Provide only ordered list, left/center/right alignment, and 12/14/18/24 px sizes.
- Preserve private storage, authorization, HTML sanitization, and current visual design.
- Do not push to GitHub.

---

### Task 1: Common business attachments

**Files:**
- Create: `src/modules/mail/assets/document-normalizer.ts`
- Modify: `src/modules/mail/assets/asset-service.ts`
- Modify: `src/app/api/mail/assets/route.ts`
- Modify: `src/components/mail/mail-rich-editor.tsx`
- Modify: `src/components/mail/mail-asset-list.tsx`
- Test: `tests/unit/modules/mail/document-normalizer.test.ts`
- Test: `tests/unit/modules/mail/mail-asset-service.test.ts`
- Test: `tests/unit/api/mail-asset-routes.test.ts`
- Test: `tests/unit/components/mail-rich-editor.test.tsx`

**Interfaces:**
- Produces: `normalizeMailDocument({ bytes, fileName, claimedContentType }): NormalizedMailDocument`.
- Produces stable `MAIL_FILE_UNSUPPORTED`, `MAIL_FILE_TOO_LARGE`, and `MAIL_FILE_INVALID` service errors.

- [ ] Write failing normalizer tests for valid PDF, OLE DOC/XLS, OOXML DOCX/XLSX, mismatched signatures, unsupported extensions, and files over 10 MB.
- [ ] Run `npm test -- tests/unit/modules/mail/document-normalizer.test.ts` and confirm failures are caused by the missing normalizer.
- [ ] Implement signature-aware normalization, SHA-256 metadata, canonical MIME types/extensions, and safe filenames.
- [ ] Add failing service/API/component tests for document persistence, status mapping, accepted file types, attachment labels, and user-facing errors.
- [ ] Route image files through the existing image normalizer and business documents through the new document normalizer; keep dimensions `0 x 0` for documents.
- [ ] Run the four focused test files and confirm all pass.
- [ ] Commit only Task 1 files with `feat: support common mail attachments`.

### Task 2: Essential formatting controls

**Files:**
- Create: `src/modules/mail/editor-format.ts`
- Modify: `src/components/mail/mail-rich-editor.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `src/modules/mail/html-policy.ts`
- Test: `tests/unit/mail/editor-format.test.ts`
- Test: `tests/unit/components/mail-rich-editor.test.tsx`
- Test: `tests/unit/modules/mail/html-policy.test.ts`

**Interfaces:**
- Produces: fixed font-size options `12px | 14px | 18px | 24px` and command helpers for ordered lists and three alignments.

- [ ] Write failing tests for the four size mappings, ordered-list command, three alignment commands, and normalized inline font markup.
- [ ] Run focused tests and confirm failures are caused by missing formatting behavior.
- [ ] Implement the minimal command helper and normalization needed to serialize stable email HTML.
- [ ] Add toolbar buttons/select controls with accessible Chinese labels and existing focus/disabled styling.
- [ ] Add failing sanitizer tests proving ordered lists, alignment, and font sizes survive while dangerous CSS remains blocked.
- [ ] Run component, formatter, and HTML-policy tests until green.
- [ ] Commit only Task 2 files with `feat: add essential mail formatting`.

### Task 3: Verification and handoff

**Files:**
- Modify only if verification exposes a defect in the feature files above.

- [ ] Run `npm test -- tests/unit/modules/mail/document-normalizer.test.ts tests/unit/modules/mail/mail-asset-service.test.ts tests/unit/api/mail-asset-routes.test.ts tests/unit/components/mail-rich-editor.test.tsx tests/unit/mail/editor-format.test.ts tests/unit/modules/mail/html-policy.test.ts`.
- [ ] Run `npm test -- --run` and record totals.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect `git status --short` to ensure unrelated work is untouched.
- [ ] Do not push; report the local commits and verification results for user review.
