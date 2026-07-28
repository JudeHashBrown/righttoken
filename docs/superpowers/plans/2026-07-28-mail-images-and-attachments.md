# Mail Images and Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure inline images and image attachments to mail templates, outgoing replies, and incoming conversation display.

**Architecture:** Store image bytes behind a `MailAssetStorage` interface with local-disk and private S3 implementations, while PostgreSQL stores metadata and immutable template/message relationships. The editor persists sanitized HTML plus a plain-text fallback; SMTP resolves asset references into CID attachments, and IMAP parsing stores safe incoming images before rendering them through an authenticated asset endpoint.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/PostgreSQL, Nodemailer, Mailparser, Sharp, AWS SDK S3 client, sanitize-html, Vitest, Testing Library.

## Global Constraints

- Supported image formats are JPEG, PNG, and WebP only.
- Reject SVG, GIF, and files whose detected format does not match an allowed image format.
- Maximum image size is 5 MB, maximum 10 images per message, maximum 20 MB total.
- Store image bytes in local development storage or private S3-compatible object storage, never PostgreSQL.
- Send both HTML and plain-text bodies.
- Inline images use CID attachments; ordinary image attachments do not use CID.
- Do not automatically load remote images from inbound email HTML.
- Operators retain existing task/user scope restrictions for upload, preview, download, and sending.

---

### Task 1: Persist Mail Assets and Immutable Relationships

**Files:**
- Modify: `recall-admin/prisma/schema.prisma`
- Create: `recall-admin/prisma/migrations/20260728120000_add_mail_assets/migration.sql`
- Modify: `recall-admin/src/generated/prisma/`
- Test: `recall-admin/tests/integration/mail-asset-schema.test.ts`

**Interfaces:**
- Produces: Prisma models `MailAsset`, `MailTemplateAsset`, `MailMessageAsset`.
- Produces: enum `MailAssetDisposition` with `INLINE` and `ATTACHMENT`.
- Produces: nullable `bodyHtml` on `MailTemplate` and `MailMessage`.

- [ ] **Step 1: Write the failing schema integration test**

```ts
it("persists one asset for an immutable template version and sent message", async () => {
  const asset = await prisma.mailAsset.create({
    data: {
      storageKey: "mail-assets/asset-1.webp",
      fileName: "guide.webp",
      contentType: "image/webp",
      byteSize: 1024,
      sha256: "a".repeat(64),
      width: 800,
      height: 600,
      createdById: member.id
    }
  });
  const templateAsset = await prisma.mailTemplateAsset.create({
    data: {
      templateId: template.id,
      assetId: asset.id,
      disposition: "INLINE",
      cid: `${asset.id}@righttoken`,
      sortOrder: 0
    }
  });
  expect(templateAsset.assetId).toBe(asset.id);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:integration -- mail-asset-schema`

Expected: FAIL because `mailAsset` and the relationship models do not exist.

- [ ] **Step 3: Add Prisma schema and SQL migration**

Add these model responsibilities:

```prisma
enum MailAssetDisposition {
  INLINE
  ATTACHMENT

  @@schema("recall")
}

model MailAsset {
  id          String   @id @default(cuid())
  storageKey  String   @unique
  fileName    String
  contentType String
  byteSize    Int
  sha256      String
  width       Int
  height      Int
  createdById String?
  createdAt   DateTime @default(now())

  templateUsages MailTemplateAsset[]
  messageUsages  MailMessageAsset[]

  @@index([createdById, createdAt])
  @@schema("recall")
}
```

Add `bodyHtml String?` and asset relations to both mail content models. Relationship rows use unique `[templateId, assetId, disposition]` and `[messageId, assetId, disposition]` constraints, a stable optional CID, and `sortOrder`.

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run:

```bash
npx prisma generate
npm run test:integration -- mail-asset-schema
```

Expected: schema test passes.

- [ ] **Step 5: Commit**

```bash
git add recall-admin/prisma recall-admin/src/generated/prisma recall-admin/tests/integration/mail-asset-schema.test.ts
git commit -m "feat: persist mail image assets"
```

---

### Task 2: Validate Images and Implement Storage Adapters

**Files:**
- Modify: `recall-admin/package.json`
- Modify: `recall-admin/package-lock.json`
- Create: `recall-admin/src/modules/mail/assets/types.ts`
- Create: `recall-admin/src/modules/mail/assets/image-normalizer.ts`
- Create: `recall-admin/src/modules/mail/assets/local-storage.ts`
- Create: `recall-admin/src/modules/mail/assets/s3-storage.ts`
- Create: `recall-admin/src/modules/mail/assets/storage-factory.ts`
- Test: `recall-admin/tests/unit/modules/mail/image-normalizer.test.ts`
- Test: `recall-admin/tests/unit/modules/mail/mail-asset-storage.test.ts`

**Interfaces:**
- Produces: `MailAssetStorage` with `put(key, bytes, contentType)`, `get(key)`, `delete(key)`, and `exists(key)`.
- Produces: `normalizeMailImage(input)` returning normalized bytes, MIME type, extension, width, height, byte size, and SHA-256.
- Produces: `getMailAssetStorage()` selected by `MAIL_ASSET_STORAGE`.

- [ ] **Step 1: Install the required storage and HTML-sanitizing dependencies**

Run:

```bash
npm install @aws-sdk/client-s3 sanitize-html
npm install --save-dev @types/sanitize-html
```

Expected: package files record the new dependencies.

- [ ] **Step 2: Write failing image validation tests**

Cover:

```ts
it("normalizes JPEG, PNG, and WebP and strips metadata", async () => {});
it("rejects SVG and GIF", async () => {});
it("rejects an image over 5 MB", async () => {});
it("detects content from bytes rather than the browser MIME value", async () => {});
```

- [ ] **Step 3: Run the validation tests and verify RED**

Run: `npm test -- tests/unit/modules/mail/image-normalizer.test.ts`

Expected: FAIL because `normalizeMailImage` does not exist.

- [ ] **Step 4: Implement image normalization**

Use Sharp metadata for validation, rotate from EXIF orientation, strip metadata, and re-encode to the detected safe format. Throw stable errors:

```ts
export type MailImageErrorCode =
  | "MAIL_IMAGE_UNSUPPORTED"
  | "MAIL_IMAGE_TOO_LARGE"
  | "MAIL_IMAGE_INVALID";
```

- [ ] **Step 5: Write failing storage contract tests**

Run identical put/get/exists/delete assertions against a temporary local directory and a mocked S3 client.

- [ ] **Step 6: Implement storage adapters and verify GREEN**

Local storage must prevent `..` traversal and create parent directories. S3 storage must use `PutObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, and `DeleteObjectCommand`. `getMailAssetStorage()` fails closed in production when required S3 settings are absent.

Run:

```bash
npm test -- tests/unit/modules/mail/image-normalizer.test.ts tests/unit/modules/mail/mail-asset-storage.test.ts
npm run typecheck
```

Expected: both test files and typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add recall-admin/package.json recall-admin/package-lock.json recall-admin/src/modules/mail/assets recall-admin/tests/unit/modules/mail
git commit -m "feat: validate and store mail images"
```

---

### Task 3: Add Authorized Upload, Preview, and Download APIs

**Files:**
- Create: `recall-admin/src/modules/mail/assets/asset-service.ts`
- Create: `recall-admin/src/app/api/mail/assets/route.ts`
- Create: `recall-admin/src/app/api/mail/assets/[id]/route.ts`
- Test: `recall-admin/tests/unit/api/mail-asset-routes.test.ts`
- Test: `recall-admin/tests/unit/modules/mail/mail-asset-service.test.ts`

**Interfaces:**
- Produces: `createMailAsset({ actorId, file })`.
- Produces: `readMailAsset({ actor, assetId, disposition })`.
- Produces: `POST /api/mail/assets` multipart endpoint.
- Produces: `GET /api/mail/assets/:id?download=1` authenticated endpoint.

- [ ] **Step 1: Write failing permission and upload tests**

Assert that inactive/unauthorized members receive 401/403, supported files return 201 metadata, invalid types return `MAIL_IMAGE_UNSUPPORTED`, and oversized files return `MAIL_IMAGE_TOO_LARGE`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/api/mail-asset-routes.test.ts tests/unit/modules/mail/mail-asset-service.test.ts
```

Expected: FAIL because the routes and service do not exist.

- [ ] **Step 3: Implement asset creation and authorized reads**

Create a random storage key, normalize the image, write bytes first, then create the metadata row. If the database write fails, remove the stored object. Preview/download authorization requires either `mail:manage-templates` or `mail:send-reviewed`; operators may read assets connected to their owned/assigned mail scope or assets they uploaded.

- [ ] **Step 4: Implement route responses**

The upload response is:

```ts
{
  asset: {
    id: string;
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    byteSize: number;
    width: number;
    height: number;
    previewUrl: string;
  }
}
```

The read response includes `Content-Type`, `Content-Length`, `X-Content-Type-Options: nosniff`, `Cache-Control: private`, and safe inline/download disposition.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/unit/api/mail-asset-routes.test.ts tests/unit/modules/mail/mail-asset-service.test.ts
npm run typecheck
```

Expected: route and service tests pass.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/src/app/api/mail/assets recall-admin/src/modules/mail/assets/asset-service.ts recall-admin/tests/unit
git commit -m "feat: add secure mail image APIs"
```

---

### Task 4: Build the Shared Rich Mail Editor

**Files:**
- Create: `recall-admin/src/modules/mail/rich-content.ts`
- Create: `recall-admin/src/components/mail/mail-rich-editor.tsx`
- Create: `recall-admin/src/components/mail/mail-asset-list.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Test: `recall-admin/tests/unit/modules/mail/rich-content.test.ts`
- Test: `recall-admin/tests/unit/components/mail-rich-editor.test.tsx`

**Interfaces:**
- Produces: `sanitizeMailHtml(html)` and `mailHtmlToText(html)`.
- Produces: `MailEditorAsset` with id, name, MIME, size, disposition, CID, and preview URL.
- Produces: controlled `MailRichEditor` returning `{ bodyHtml, bodyText, assets }`.

- [ ] **Step 1: Write failing HTML policy tests**

Assert that allowed paragraphs, emphasis, lists, links, and `img[data-mail-asset-id]` survive; scripts, inline event handlers, iframe, style, data URLs, and remote image URLs are removed.

- [ ] **Step 2: Write failing editor interaction tests**

Assert that the editor has “插入正文图片” and “添加图片附件”, uploads using multipart form data, inserts a returned asset at the selection, lists attachments, removes assets, and displays Chinese validation errors.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/modules/mail/rich-content.test.ts tests/unit/components/mail-rich-editor.test.tsx
```

Expected: FAIL because the HTML policy and editor do not exist.

- [ ] **Step 4: Implement safe rich content helpers**

Use `sanitize-html` on the server with an explicit tag/attribute allowlist. Represent inline assets as:

```html
<img data-mail-asset-id="asset-id" alt="说明文字">
```

Never allow arbitrary `src` values in stored HTML.

- [ ] **Step 5: Implement the editor UI**

Use a compact toolbar and content-editable body with accessible labels. Keep attachment rows below the body, not in a nested card. Upload immediately when a file is selected, show progress, and preserve content on errors.

- [ ] **Step 6: Verify GREEN and UI quality**

Run:

```bash
npm test -- tests/unit/modules/mail/rich-content.test.ts tests/unit/components/mail-rich-editor.test.tsx
npm run typecheck
npm run lint
```

Expected: tests, typecheck, and lint pass.

- [ ] **Step 7: Commit**

```bash
git add recall-admin/src/modules/mail/rich-content.ts recall-admin/src/components/mail recall-admin/src/components/workspaces/workspace.module.css recall-admin/tests/unit
git commit -m "feat: add rich mail image editor"
```

---

### Task 5: Version Images with Public Mail Templates

**Files:**
- Modify: `recall-admin/src/modules/mail/template-schema.ts`
- Modify: `recall-admin/src/modules/mail/template-service.ts`
- Modify: `recall-admin/src/modules/mail/workspace-query.ts`
- Modify: `recall-admin/src/components/mail/mail-template-tabs.tsx`
- Modify: `recall-admin/src/components/mail/mail-template-manager.tsx`
- Modify: `recall-admin/src/components/mail/mail-template-library.tsx`
- Modify: `recall-admin/tests/unit/api/mail-template-routes.test.ts`
- Modify: `recall-admin/tests/unit/components/mail-template-library.test.tsx`
- Create: `recall-admin/tests/integration/mail-template-assets.test.ts`

**Interfaces:**
- Template requests consume `bodyHtml`, `bodyText`, and `assets`.
- Template summaries expose immutable asset references for the latest version.

- [ ] **Step 1: Extend tests before production code**

Add assertions that creating and publishing a template accepts safe HTML and image relations, rejects more than 10 assets or 20 MB total, and copies no stale relations from the prior version. Component tests assert that selected templates load their images and attachments.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/api/mail-template-routes.test.ts tests/unit/components/mail-template-library.test.tsx
npm run test:integration -- mail-template-assets
```

Expected: FAIL because template contracts only accept `bodyText`.

- [ ] **Step 3: Update schema, service, and queries**

Sanitize HTML server-side, verify every asset exists, enforce count/total size, and create `MailTemplateAsset` rows in the same transaction as the immutable version. Return ordered asset metadata from workspace queries.

- [ ] **Step 4: Replace template textareas with `MailRichEditor`**

Both new-template and existing-template views use the shared editor. Publishing sends the final HTML, text fallback, and current asset relationships.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/unit/api/mail-template-routes.test.ts tests/unit/components/mail-template-library.test.tsx
npm run test:integration -- mail-template-assets
npm run typecheck
```

Expected: unit, integration, and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/src/modules/mail recall-admin/src/components/mail recall-admin/tests
git commit -m "feat: add images to mail templates"
```

---

### Task 6: Send HTML, CID Images, and Image Attachments

**Files:**
- Modify: `recall-admin/src/modules/mail/types.ts`
- Modify: `recall-admin/src/modules/integrations/email/smtp-sender.ts`
- Modify: `recall-admin/src/modules/mail/reply-request-schema.ts`
- Modify: `recall-admin/src/modules/mail/reply-to-thread.ts`
- Modify: `recall-admin/src/modules/mail/send-request-schema.ts`
- Modify: `recall-admin/src/modules/mail/send-reviewed-mail.ts`
- Modify: `recall-admin/src/components/mail/mail-reply-editor.tsx`
- Modify: `recall-admin/tests/unit/modules/integrations/smtp-sender.test.ts`
- Modify: `recall-admin/tests/unit/modules/mail/reply-to-thread.test.ts`
- Modify: `recall-admin/tests/unit/components/mail-reply-editor.test.tsx`

**Interfaces:**
- `OutboundMailboxMessage` gains `html` and binary `attachments`.
- Reply requests consume `bodyHtml` and asset relations.
- SMTP attachments use Nodemailer-compatible `{ filename, content, contentType, cid?, disposition }`.

- [ ] **Step 1: Write failing SMTP and reply tests**

Assert that safe HTML references become `cid:...`, storage bytes are passed to Nodemailer, inline assets have CID, ordinary attachments have `attachment` disposition, plain text is always present, and a missing asset blocks sending with `MAIL_ASSET_MISSING`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/modules/integrations/smtp-sender.test.ts tests/unit/modules/mail/reply-to-thread.test.ts tests/unit/components/mail-reply-editor.test.tsx
```

Expected: FAIL because outbound messages are text-only.

- [ ] **Step 3: Extend SMTP transport and sending services**

Resolve and read all assets before creating the SMTP request. Save `bodyHtml` and `MailMessageAsset` rows with the draft. On SMTP failure, retain the draft and relations. On success, update the existing draft rather than creating another message.

- [ ] **Step 4: Upgrade reply editor**

Selecting a template loads its HTML and assets. Operators may remove or add images without mutating the template. Submission preserves the editor after failure and clears only after success.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/unit/modules/integrations/smtp-sender.test.ts tests/unit/modules/mail/reply-to-thread.test.ts tests/unit/components/mail-reply-editor.test.tsx
npm run typecheck
```

Expected: SMTP, reply service, component, and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/src/modules recall-admin/src/components/mail recall-admin/tests/unit
git commit -m "feat: send mail images and attachments"
```

---

### Task 7: Parse and Display Incoming Images Safely

**Files:**
- Modify: `recall-admin/src/modules/mail/types.ts`
- Modify: `recall-admin/src/modules/mail/adapters/smtp-imap.ts`
- Modify: `recall-admin/src/modules/mail/sync-mailbox.ts`
- Modify: `recall-admin/src/modules/mail/workspace-query.ts`
- Modify: `recall-admin/src/components/mail/mail-conversation-detail.tsx`
- Modify: `recall-admin/src/components/workspaces/workspace.module.css`
- Modify: `recall-admin/tests/unit/modules/mail/smtp-imap-adapter.test.ts`
- Modify: `recall-admin/tests/unit/modules/mail/sync-mailbox.test.ts`
- Create: `recall-admin/tests/unit/components/mail-conversation-detail.test.tsx`

**Interfaces:**
- `MailboxMessage` exposes sanitized-source HTML and binary image attachments.
- Workspace message detail exposes safe `bodyHtml`, ordered assets, and `externalImagesBlocked`.

- [ ] **Step 1: Write failing inbound parsing tests**

Use MIME fixtures for one CID image, one ordinary image attachment, one external remote image, and one dangerous script. Assert correct disposition/CID, external-image blocking, and pure-text fallback.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/unit/modules/mail/smtp-imap-adapter.test.ts tests/unit/modules/mail/sync-mailbox.test.ts tests/unit/components/mail-conversation-detail.test.tsx
```

Expected: FAIL because inbound messages expose only plain text.

- [ ] **Step 3: Extend IMAP parsing and synchronization**

Parse image attachments into memory only within configured limits. Normalize and store accepted images, create message/asset relationships, sanitize HTML, replace CID references with controlled asset markers, and fall back to text if asset processing fails.

- [ ] **Step 4: Render safe conversation content**

Render sanitized HTML only. Replace controlled asset markers with authorized `/api/mail/assets/:id` URLs. Show ordinary attachments with filename, size, preview, and download. Show “已阻止外部图片” when applicable.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/unit/modules/mail/smtp-imap-adapter.test.ts tests/unit/modules/mail/sync-mailbox.test.ts tests/unit/components/mail-conversation-detail.test.tsx
npm run typecheck
npm run lint
```

Expected: inbound parsing, sync, display, typecheck, and lint pass.

- [ ] **Step 6: Commit**

```bash
git add recall-admin/src/modules/mail recall-admin/src/components recall-admin/tests/unit
git commit -m "feat: display inbound mail images"
```

---

### Task 8: Document Configuration and Verify the Complete Workflow

**Files:**
- Modify: `recall-admin/.env.example`
- Modify: `recall-admin/README.md`
- Modify: `recall-admin/.gitignore`
- Create: `recall-admin/tests/e2e/mail-images-workflow.spec.ts`

**Interfaces:**
- Documents local and S3 storage configuration.
- Provides one browser workflow covering template upload through received-mail display.

- [ ] **Step 1: Add configuration documentation**

Document all `MAIL_ASSET_*` variables, private bucket requirements, the local `.data/mail-assets` directory, file limits, and the production requirement to use S3 storage. Ignore `.data/mail-assets`.

- [ ] **Step 2: Add the end-to-end workflow**

The test creates a template with an inline image and attachment, applies it to a reply, verifies the request payload, and verifies a fixture inbound message displays its CID image and attachment without loading the remote tracker.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

Expected: every command exits 0 with no test failures.

- [ ] **Step 4: Manually verify localhost**

Open:

```text
http://localhost:3101/mail?view=templates
http://localhost:3101/mail?view=replies
```

Verify image upload, inline placement, attachment list, responsive layout, clear errors, and conversation image rendering.

- [ ] **Step 5: Commit**

```bash
git add recall-admin/.env.example recall-admin/README.md recall-admin/.gitignore recall-admin/tests/e2e/mail-images-workflow.spec.ts
git commit -m "docs: configure mail image storage"
```
