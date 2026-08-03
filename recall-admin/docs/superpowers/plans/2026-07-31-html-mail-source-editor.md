# HTML Mail Source Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe full-document HTML source editing, isolated final preview, external HTTPS images, and loss-aware switching while preserving the existing rich-text, template, reply, single-send, and bulk-send workflows.

**Architecture:** Introduce one server-safe HTML processing module that produces sanitized HTML, plain text, diagnostics, and visual-editor compatibility. All preview, template persistence, asset resolution, and SMTP paths call this shared policy. Extend the existing `MailRichEditor` into a three-mode editor without creating parallel content models.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod, sanitize-html, Nodemailer, Vitest, Testing Library, Playwright.

## Global Constraints

- Keep the current `bodyHtml`, `bodyText`, and mail asset database fields; no migration is required.
- Support complete documents with `DOCTYPE`, `html`, `head`, `style`, table layout, inline CSS, and media queries.
- Remove scripts, forms, frames, active content, event handlers, dangerous URLs, CSS imports, CSS expressions, and script URLs on the server.
- Permit only HTTPS external images; do not download or proxy them.
- Preserve CID-backed uploaded images and the current limits of 10 images and 20 MB total.
- Preview must render the same sanitized HTML used by send and must use a sandboxed iframe.
- Continue enforcing permissions, review, suppression, pause, contact-frequency, unresolved-variable, and mailbox checks.
- Always send a readable plain-text alternative.
- Use test-first development for every behavior change.

## File Structure

- Create `src/modules/mail/html-policy.ts`: canonical HTML sanitization, diagnostics, text derivation, external-image analysis, and rich-editor compatibility.
- Create `src/modules/mail/preview-schema.ts`: strict preview request schema.
- Create `src/app/api/mail/preview/route.ts`: authenticated same-origin preview API.
- Create `src/components/mail/mail-html-preview.tsx`: sandboxed preview and diagnostic summary.
- Modify `src/modules/mail/rich-content.ts`: delegate existing public helpers to the canonical policy.
- Modify `src/modules/mail/outbound-assets.ts`: preserve approved HTTPS external images while resolving uploaded image references to CID.
- Modify `src/components/mail/mail-rich-editor.tsx`: visual/source/preview modes, HTML import, and loss warning.
- Modify `src/components/mail/mail-composer.tsx`: load template HTML instead of rebuilding it from text.
- Modify template and reply editor call sites only where props or status output change.
- Modify `src/components/workspaces/workspace.module.css`: mode tabs, source textarea, preview, and diagnostics.
- Add focused unit, API, component, integration, and end-to-end tests.

---

### Task 1: Canonical HTML Mail Policy

**Files:**
- Create: `src/modules/mail/html-policy.ts`
- Modify: `src/modules/mail/rich-content.ts`
- Test: `tests/unit/modules/mail/html-policy.test.ts`

**Interfaces:**
- Produces: `processMailHtml(input: string): ProcessedMailHtml`.
- Produces: `ProcessedMailHtml = { html: string; text: string; diagnostics: MailHtmlDiagnostics; visualEditorCompatible: boolean }`.
- Produces: `MailHtmlDiagnostics = { removedTags: string[]; removedAttributes: string[]; blockedUrls: number; externalImageCount: number; hasDangerousContent: boolean }`.
- Existing callers keep using `sanitizeMailHtml`, `mailHtmlToText`, and `mailAssetIdsInHtml`.

- [ ] **Step 1: Write failing policy tests**

Create tests that assert full document preservation, static email CSS preservation, active-content removal, HTTPS-only external images, uploaded-asset markers, diagnostics, plain-text generation, and visual-editor compatibility:

```ts
import { describe, expect, it } from "vitest";
import { processMailHtml } from "@/modules/mail/html-policy";

describe("processMailHtml", () => {
  it("preserves a complete static email document", () => {
    const result = processMailHtml(`<!DOCTYPE html>
      <html><head><style>
        @media (max-width: 600px) { .card { width: 100% !important; } }
      </style></head><body>
        <table role="presentation" style="width:100%"><tr><td>你好</td></tr></table>
      </body></html>`);
    expect(result.html).toMatch(/^<!DOCTYPE html>/i);
    expect(result.html).toContain("<html>");
    expect(result.html).toContain("@media");
    expect(result.html).toContain("<table");
    expect(result.text).toBe("你好");
  });

  it("removes active content and dangerous URLs", () => {
    const result = processMailHtml(`
      <script>alert(1)</script>
      <form><input value="secret"></form>
      <a href="javascript:alert(1)" onclick="alert(2)">危险链接</a>
      <p style="background:expression(alert(3))">正文</p>
    `);
    expect(result.html).not.toMatch(/script|form|input|onclick|javascript:|expression/i);
    expect(result.diagnostics.hasDangerousContent).toBe(true);
    expect(result.diagnostics.blockedUrls).toBeGreaterThan(0);
  });

  it("allows https images and rejects other external sources", () => {
    const result = processMailHtml(`
      <img src="https://cdn.example.test/guide.png" alt="guide">
      <img src="http://cdn.example.test/insecure.png">
      <img src="file:///tmp/private.png">
      <img data-mail-asset-id="asset_1" alt="upload">
    `);
    expect(result.html).toContain("https://cdn.example.test/guide.png");
    expect(result.html).not.toContain("http://");
    expect(result.html).not.toContain("file://");
    expect(result.html).toContain('data-mail-asset-id="asset_1"');
    expect(result.diagnostics.externalImageCount).toBe(1);
  });

  it("marks complex documents as unsafe for lossless visual editing", () => {
    expect(processMailHtml("<p>简单正文</p>").visualEditorCompatible).toBe(true);
    expect(
      processMailHtml("<html><head><style>.x{color:red}</style></head><body><table><tr><td>复杂</td></tr></table></body></html>")
        .visualEditorCompatible
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```bash
npm test -- tests/unit/modules/mail/html-policy.test.ts
```

Expected: FAIL because `@/modules/mail/html-policy` does not exist.

- [ ] **Step 3: Implement the canonical processor**

Create `html-policy.ts` with:

```ts
import sanitizeHtml from "sanitize-html";

export type MailHtmlDiagnostics = {
  removedTags: string[];
  removedAttributes: string[];
  blockedUrls: number;
  externalImageCount: number;
  hasDangerousContent: boolean;
};

export type ProcessedMailHtml = {
  html: string;
  text: string;
  diagnostics: MailHtmlDiagnostics;
  visualEditorCompatible: boolean;
};

const activeTags = new Set([
  "script", "iframe", "frame", "frameset", "object", "embed",
  "form", "input", "button", "select", "textarea", "video", "audio", "svg"
]);

export function processMailHtml(input: string): ProcessedMailHtml {
  // Preserve a leading doctype, collect active tags/event attributes/blocked
  // URLs before cleaning, sanitize allowed static email tags and attributes,
  // sanitize style attributes and style element text, restore one doctype,
  // derive readable text, and detect structures the visual editor cannot
  // round-trip without loss.
}
```

The implementation must use explicit allowlists for document, table, text, link, and image tags. It must use `sanitize-html` transform hooks to:

- preserve only `https:` link/image URLs plus `mailto:` links;
- preserve `data-mail-asset-id` images without a `src`;
- strip all `on*` attributes;
- sanitize `style` attributes;
- sanitize `<style>` contents by removing `@import`, `expression(`, `javascript:`, `vbscript:`, `behavior:`, `-moz-binding`, and non-HTTPS `url(...)`;
- collect deterministic sorted diagnostics.

Update `rich-content.ts` so `sanitizeMailHtml(value)` returns `processMailHtml(value).html`, `mailHtmlToText(value)` returns `.text`, and `mailAssetIdsInHtml(value)` scans `.html`.

- [ ] **Step 4: Run policy and existing rich-content tests**

Run:

```bash
npm test -- tests/unit/modules/mail/html-policy.test.ts tests/unit/modules/mail/outbound-assets.test.ts
```

Expected: PASS with no warnings.

- [ ] **Step 5: Commit the policy**

```bash
git add src/modules/mail/html-policy.ts src/modules/mail/rich-content.ts tests/unit/modules/mail/html-policy.test.ts
git commit -m "feat: add safe HTML mail policy"
```

---

### Task 2: Shared Preview API

**Files:**
- Create: `src/modules/mail/preview-schema.ts`
- Create: `src/app/api/mail/preview/route.ts`
- Test: `tests/unit/mail/preview-schema.test.ts`
- Test: `tests/unit/api/mail-preview-route.test.ts`

**Interfaces:**
- Consumes: `processMailHtml`.
- Produces: `mailPreviewRequestSchema`.
- Produces: `POST /api/mail/preview`.
- Response: `{ html, text, diagnostics, visualEditorCompatible, unresolvedVariables, canSend }`.

- [ ] **Step 1: Write failing schema and route tests**

Test strict input and the route’s shared policy output:

```ts
expect(mailPreviewRequestSchema.safeParse({
  subject: "欢迎回来",
  bodyHtml: "<p>你好，[称呼]</p>",
  assets: []
}).success).toBe(true);

expect(mailPreviewRequestSchema.safeParse({
  subject: "欢迎",
  bodyHtml: "<p>正文</p>",
  extra: true
}).success).toBe(false);
```

Mock `requireRequestPermission` and assert:

```ts
const response = await POST(requestWith({
  subject: "欢迎，[称呼]",
  bodyHtml: '<p>正文</p><script>alert(1)</script>',
  assets: []
}));
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({
  html: expect.not.stringContaining("<script"),
  diagnostics: { hasDangerousContent: true },
  unresolvedVariables: ["[称呼]"],
  canSend: false
});
```

- [ ] **Step 2: Run preview tests and verify RED**

Run:

```bash
npm test -- tests/unit/mail/preview-schema.test.ts tests/unit/api/mail-preview-route.test.ts
```

Expected: FAIL because the schema and route do not exist.

- [ ] **Step 3: Implement schema and route**

Use a strict Zod object:

```ts
export const mailPreviewRequestSchema = z.object({
  subject: z.string().max(200).default(""),
  bodyHtml: z.string().max(200_000),
  assets: z.array(mailAssetReferenceSchema).max(10).default([])
}).strict();
```

The route must:

- call `assertSameOrigin`;
- require `mail:send-reviewed`;
- parse JSON safely;
- call `processMailHtml`;
- collect bracket variables from subject and processed text;
- return `canSend` only when processed text is non-empty and variables are resolved;
- map authorization failures to 401/403 and invalid input to 400.

- [ ] **Step 4: Run preview tests**

Run:

```bash
npm test -- tests/unit/mail/preview-schema.test.ts tests/unit/api/mail-preview-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the preview API**

```bash
git add src/modules/mail/preview-schema.ts src/app/api/mail/preview/route.ts tests/unit/mail/preview-schema.test.ts tests/unit/api/mail-preview-route.test.ts
git commit -m "feat: add HTML mail preview API"
```

---

### Task 3: Three-Mode Mail Editor

**Files:**
- Create: `src/components/mail/mail-html-preview.tsx`
- Modify: `src/components/mail/mail-rich-editor.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Test: `tests/unit/components/mail-rich-editor.test.tsx`
- Test: `tests/unit/components/mail-html-preview.test.tsx`

**Interfaces:**
- Consumes: `POST /api/mail/preview`.
- Produces: `MailHtmlPreview`.
- Extends `MailRichEditor` without changing `MailRichContent`.

- [ ] **Step 1: Write failing component tests**

Add tests for:

```ts
fireEvent.click(screen.getByRole("button", { name: "HTML 源码" }));
fireEvent.change(screen.getByLabelText("HTML 邮件源码"), {
  target: { value: "<!DOCTYPE html><html><body><h1>欢迎</h1></body></html>" }
});
expect(screen.getByTestId("value")).toHaveTextContent("<!DOCTYPE html>");

fireEvent.click(screen.getByRole("button", { name: "发送预览" }));
await waitFor(() =>
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/mail/preview",
    expect.objectContaining({ method: "POST" })
  )
);
expect(screen.getByTitle("HTML 邮件发送预览")).toHaveAttribute("sandbox", "");
```

Test HTML import using a `File` named `template.html`.

Test a complex document response with `visualEditorCompatible: false`; clicking “可视化编辑” must call `window.confirm`, stay in source mode on cancel, and switch only on confirm.

- [ ] **Step 2: Run component tests and verify RED**

Run:

```bash
npm test -- tests/unit/components/mail-rich-editor.test.tsx tests/unit/components/mail-html-preview.test.tsx
```

Expected: FAIL because mode buttons, source input, preview, and import do not exist.

- [ ] **Step 3: Implement the preview component**

`MailHtmlPreview` accepts:

```ts
type MailHtmlPreviewProps = {
  html: string;
  loading: boolean;
  error: string | null;
  diagnostics: MailHtmlDiagnostics | null;
  unresolvedVariables: string[];
};
```

Render the HTML with:

```tsx
<iframe
  sandbox=""
  srcDoc={html}
  title="HTML 邮件发送预览"
/>
```

Show green checks, external-image warning, removed-content summary, unresolved variables, loading, and preview failure states outside the iframe.

- [ ] **Step 4: Implement editor modes and import**

Add `mode: "VISUAL" | "SOURCE" | "PREVIEW"` state, a source textarea, a hidden `.html,.htm,text/html` file input, debounced preview state, and mode buttons.

Source changes must update:

```ts
onChange({
  ...value,
  bodyHtml: event.target.value,
  bodyText: value.bodyText
});
```

Preview responses replace `bodyText` with the server-derived text but must not silently replace the user’s source editor text. Before visual-mode conversion, request or reuse a preview result and confirm if `visualEditorCompatible` is false.

- [ ] **Step 5: Add editor styles**

Add focused classes for the mode tab bar, active tab, monospace source textarea, import control, preview grid, sandboxed iframe, checks, and warnings. Reuse existing spacing, colors, buttons, and responsive breakpoints.

- [ ] **Step 6: Run component tests**

Run:

```bash
npm test -- tests/unit/components/mail-rich-editor.test.tsx tests/unit/components/mail-html-preview.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the editor**

```bash
git add src/components/mail/mail-html-preview.tsx src/components/mail/mail-rich-editor.tsx src/components/workspaces/workspace.module.css tests/unit/components/mail-rich-editor.test.tsx tests/unit/components/mail-html-preview.test.tsx
git commit -m "feat: add HTML source and preview mail editor"
```

---

### Task 4: Preserve HTML Across Templates, Replies, and Composition

**Files:**
- Modify: `src/components/mail/mail-composer.tsx`
- Modify: `src/components/mail/mail-template-manager.tsx`
- Modify: `src/components/mail/mail-template-library.tsx`
- Modify: `src/components/mail/mail-reply-editor.tsx`
- Test: `tests/unit/components/mail-composer.test.tsx`
- Test: `tests/unit/components/mail-template-library.test.tsx`
- Test: `tests/unit/components/mail-reply-editor.test.tsx`

**Interfaces:**
- Consumes: unchanged `MailRichContent` and enhanced `MailRichEditor`.
- Produces: HTML-preserving template selection and submission for all editor call sites.

- [ ] **Step 1: Write failing HTML-preservation tests**

Update composer template fixtures to include:

```ts
{
  id: "template-html",
  name: "完整 HTML",
  subject: "欢迎",
  bodyText: "欢迎使用",
  bodyHtml: "<!DOCTYPE html><html><head><style>.hero{color:#2563eb}</style></head><body><h1 class=\"hero\">欢迎使用</h1></body></html>",
  assets: []
}
```

Select the template and assert the send request contains its original `bodyHtml`. Add equivalent template-publish and reply-send assertions.

- [ ] **Step 2: Run call-site tests and verify RED**

Run:

```bash
npm test -- tests/unit/components/mail-composer.test.tsx tests/unit/components/mail-template-library.test.tsx tests/unit/components/mail-reply-editor.test.tsx
```

Expected: composer test FAIL because `selectTemplate` rebuilds HTML from `bodyText`.

- [ ] **Step 3: Extend composer template shape and selection**

Change `ComposerTemplate` to:

```ts
type ComposerTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  assets: MailRichContent["assets"];
};
```

Replace `setContent(initialRichContent(template.bodyText))` with:

```ts
setContent({
  bodyHtml: template.bodyHtml,
  bodyText: template.bodyText,
  assets: template.assets
});
```

Ensure server query mapping supplies `bodyHtml` and assets.

- [ ] **Step 4: Verify every editor call site**

Confirm template manager, template library, and reply editor pass `bodyHtml`, `bodyText`, and assets unchanged through create, publish, update, and send requests. Adjust only missing mappings identified by the failing tests.

- [ ] **Step 5: Run call-site tests**

Run:

```bash
npm test -- tests/unit/components/mail-composer.test.tsx tests/unit/components/mail-template-library.test.tsx tests/unit/components/mail-reply-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit HTML preservation**

```bash
git add src/components/mail/mail-composer.tsx src/components/mail/mail-template-manager.tsx src/components/mail/mail-template-library.tsx src/components/mail/mail-reply-editor.tsx tests/unit/components/mail-composer.test.tsx tests/unit/components/mail-template-library.test.tsx tests/unit/components/mail-reply-editor.test.tsx
git commit -m "fix: preserve HTML across mail workflows"
```

---

### Task 5: Preserve HTTPS Images Through Asset Resolution and SMTP

**Files:**
- Modify: `src/modules/mail/outbound-assets.ts`
- Modify: `src/modules/mail/send-reviewed-mail.ts`
- Modify: `src/modules/mail/create-mail-batch.ts`
- Test: `tests/unit/modules/mail/outbound-assets.test.ts`
- Test: `tests/unit/mail/smtp-imap.test.ts`
- Test: `tests/integration/mail/thread-reply.test.ts`
- Test: `tests/integration/mail/retry-mail-batch.test.ts`

**Interfaces:**
- Consumes: `processMailHtml`.
- Produces: `resolveOutboundMailAssets` preserving approved external image `src` values and converting only uploaded assets to CID.

- [ ] **Step 1: Write failing outbound delivery tests**

Assert:

```ts
const result = await resolveOutboundMailAssets({
  bodyHtml: `
    <img src="https://cdn.example.test/external.png">
    <img data-mail-asset-id="asset-inline">
  `,
  assets: [{ id: "asset-inline", disposition: "INLINE", sortOrder: 0 }]
}, dependencies);

expect(result.html).toContain("https://cdn.example.test/external.png");
expect(result.html).toContain("cid:asset-inline@righttoken");
```

Add SMTP assertion that `sendMail` receives both `text` and the complete sanitized `html`.

- [ ] **Step 2: Run outbound and SMTP tests and verify RED**

Run:

```bash
npm test -- tests/unit/modules/mail/outbound-assets.test.ts tests/unit/mail/smtp-imap.test.ts
```

Expected: FAIL because the current sanitizer strips all image `src` values.

- [ ] **Step 3: Update outbound asset resolution**

Use `processMailHtml(input.bodyHtml).html` as the safe base. Walk only images containing `data-mail-asset-id`, validate them against the claimed asset list, and replace those images with CID sources. Leave previously approved HTTPS external `src` values unchanged.

Return the canonical safe HTML for persistence and the CID-resolved HTML for delivery:

```ts
return {
  bodyHtml: safeHtml,
  html: deliveryHtml,
  attachments,
  messageAssets
};
```

- [ ] **Step 4: Confirm single, reply, batch, and retry paths use the canonical output**

Keep `sendReviewedMail` as the single-send/reply delivery boundary. Ensure batch creation freezes processed HTML and batch retry reads the frozen HTML instead of reloading a mutable template.

- [ ] **Step 5: Run unit and integration mail tests**

Run:

```bash
npm test -- tests/unit/modules/mail/outbound-assets.test.ts tests/unit/mail/smtp-imap.test.ts
npm run test:integration -- tests/integration/mail/thread-reply.test.ts tests/integration/mail/retry-mail-batch.test.ts
```

Expected: PASS. If integration prerequisites are unavailable, the runner must report an explicit skipped environment check rather than a product assertion failure.

- [ ] **Step 6: Commit delivery support**

```bash
git add src/modules/mail/outbound-assets.ts src/modules/mail/send-reviewed-mail.ts src/modules/mail/create-mail-batch.ts tests/unit/modules/mail/outbound-assets.test.ts tests/unit/mail/smtp-imap.test.ts tests/integration/mail/thread-reply.test.ts tests/integration/mail/retry-mail-batch.test.ts
git commit -m "feat: deliver safe complete HTML mail"
```

---

### Task 6: End-to-End Acceptance and Regression Verification

**Files:**
- Create: `tests/e2e/html-mail-workflow.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete HTML editing and preview workflow.
- Produces: browser acceptance coverage and operator documentation.

- [ ] **Step 1: Write the failing browser workflow**

The test must:

1. Open the mail composer fixture.
2. Switch to HTML source.
3. import or paste a complete responsive table template.
4. Open send preview.
5. assert external-image warning and iframe content.
6. send to the fixture user.
7. open sent mail and assert the stored HTML layout is shown safely.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/html-mail-workflow.spec.ts
```

Expected: FAIL at the first missing workflow assertion before final UI adjustments.

- [ ] **Step 3: Complete accessibility and operator copy**

Ensure mode controls expose selected state, source textarea has a persistent label, import restrictions are described, preview status uses `role="status"`, failures use `role="alert"`, and keyboard focus remains visible.

Add a concise README section describing visual mode, source mode, preview, imported HTML, external-image warnings, and the visual-mode loss warning.

- [ ] **Step 4: Run all verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e -- tests/e2e/html-mail-workflow.spec.ts
```

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 5: Commit acceptance coverage**

```bash
git add tests/e2e/html-mail-workflow.spec.ts README.md
git commit -m "test: cover HTML mail authoring workflow"
```
