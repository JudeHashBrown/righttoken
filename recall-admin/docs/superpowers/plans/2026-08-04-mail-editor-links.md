# Mail Editor Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible insert, edit, and remove hyperlink controls to the visual mail editor while preserving the existing server-side HTML security boundary.

**Architecture:** Keep URL normalization/validation in a small pure module and let the visual editor manage selection restoration plus a compact link dialog. The existing `processMailHtml` sanitizer remains authoritative and receives regression coverage for generated link attributes and unsafe schemes.

**Tech Stack:** React 19, TypeScript 5.9, contentEditable DOM Range API, lucide-react, sanitize-html, Vitest/Testing Library, Playwright.

## Global Constraints

- Allow only `https://` and `mailto:` links from the visual editor.
- Normalize a plain domain to `https://`; reject `http://`, `javascript:`, `data:`, and every other scheme with a clear error.
- With no selected text, use the normalized address as visible link text.
- Generated links open in a new window and include `rel="noopener noreferrer"`.
- Visual, source, and preview modes must preserve safe links consistently.
- Server-side HTML sanitization remains the final security boundary.
- Do not add a new editor dependency.
- No GitHub push without an explicit user instruction.

---

## File Structure

- `src/modules/mail/editor-link.ts`: pure URL normalization and validation.
- `src/components/mail/mail-rich-editor.tsx`: selection capture/restoration, link dialog, insert/edit/remove operations.
- `src/components/workspaces/workspace.module.css`: dialog and active-link toolbar styling consistent with the existing mail editor.
- `src/modules/mail/html-policy.ts`: only the minimal attribute hardening required for all safe external links.
- Unit and E2E tests verify DOM behavior, sanitization, mode round-trips, and preview output.

### Task 1: Add pure link normalization and sanitizer regression coverage

**Files:**
- Create: `src/modules/mail/editor-link.ts`
- Create: `tests/unit/mail/editor-link.test.ts`
- Modify: `src/modules/mail/html-policy.ts`
- Modify: `tests/unit/modules/mail/html-policy.test.ts`

**Interfaces:**
- Produces: `normalizeEditorLink(raw: string): { ok: true; href: string } | { ok: false; code: "EMPTY_LINK" | "UNSAFE_LINK" | "INVALID_LINK" }`.
- Consumes: raw dialog input.

- [ ] **Step 1: Write failing normalization and sanitizer tests**

```ts
it.each([
  ["example.com/path", { ok: true, href: "https://example.com/path" }],
  ["https://example.com/path", { ok: true, href: "https://example.com/path" }],
  ["mailto:help@example.com", { ok: true, href: "mailto:help@example.com" }]
])("normalizes %s", (raw, expected) => {
  expect(normalizeEditorLink(raw)).toEqual(expected);
});

it.each(["http://example.com", "javascript:alert(1)", "data:text/html,x"])(
  "rejects unsafe scheme %s",
  (raw) => expect(normalizeEditorLink(raw)).toEqual({ ok: false, code: "UNSAFE_LINK" })
);

it("hardens safe external links", () => {
  const result = processMailHtml('<a href="https://example.com">帮助</a>');
  expect(result.html).toContain('target="_blank"');
  expect(result.html).toContain('rel="noopener noreferrer"');
});
```

- [ ] **Step 2: Run focused unit tests and verify RED**

Run: `npm test -- tests/unit/mail/editor-link.test.ts tests/unit/modules/mail/html-policy.test.ts`

Expected: FAIL because the normalizer is absent and safe links are not always hardened.

- [ ] **Step 3: Implement normalization and unconditional safe-link hardening**

```ts
export type EditorLinkResult =
  | { ok: true; href: string }
  | { ok: false; code: "EMPTY_LINK" | "UNSAFE_LINK" | "INVALID_LINK" };

export function normalizeEditorLink(raw: string): EditorLinkResult {
  const value = raw.trim();
  if (!value) return { ok: false, code: "EMPTY_LINK" };
  const candidate = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
    ? value
    : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "mailto:") {
      return { ok: false, code: "UNSAFE_LINK" };
    }
    return { ok: true, href: url.toString() };
  } catch {
    return { ok: false, code: "INVALID_LINK" };
  }
}
```

In `transformAttributes`, when an `<a>` has a safe `href`, set `target="_blank"` and `rel="noopener noreferrer"` regardless of source attributes; when unsafe, remove `href`, `target`, and `rel` together.

- [ ] **Step 4: Run focused unit tests and verify GREEN**

Run: `npm test -- tests/unit/mail/editor-link.test.ts tests/unit/modules/mail/html-policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/editor-link.ts src/modules/mail/html-policy.ts tests/unit/mail/editor-link.test.ts tests/unit/modules/mail/html-policy.test.ts
git commit -m "feat: validate mail editor links"
```

### Task 2: Add insert, edit, and remove link controls to the visual editor

**Files:**
- Modify: `src/components/mail/mail-rich-editor.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `tests/unit/components/mail-rich-editor.test.tsx`

**Interfaces:**
- Consumes: `normalizeEditorLink` from Task 1 and the editor's existing `savedRangeRef`/`emit()` flow.
- Produces: toolbar button “超链接”, accessible dialog fields “链接地址”, “保存链接”, “移除链接”, and serialized safe `<a>` HTML.

- [ ] **Step 1: Write failing DOM interaction tests**

```tsx
function selectEditorText(text: string): void {
  const editor = screen.getByRole("textbox", { name: "邮件正文" });
  const node = Array.from(editor.childNodes).find((child) => child.textContent?.includes(text))!;
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.mouseUp(editor);
}

selectEditorText("初始正文");
fireEvent.click(screen.getByRole("button", { name: "超链接" }));
fireEvent.change(screen.getByLabelText("链接地址"), {
  target: { value: "example.com/help" }
});
fireEvent.click(screen.getByRole("button", { name: "保存链接" }));
expect(screen.getByTestId("value")).toHaveTextContent(
  'href=\\"https://example.com/help\\"'
);

selectEditorText("初始正文");
fireEvent.click(screen.getByRole("button", { name: "超链接" }));
expect(screen.getByLabelText("链接地址")).toHaveValue("https://example.com/help");
fireEvent.click(screen.getByRole("button", { name: "移除链接" }));
expect(screen.getByTestId("value")).not.toHaveTextContent("<a");
```

Also cover no selection (URL becomes visible text), unsafe-scheme error, cancel preserving content, and selection restoration after dialog focus.

- [ ] **Step 2: Run the editor test and verify RED**

Run: `npm test -- tests/unit/components/mail-rich-editor.test.tsx`

Expected: FAIL because the toolbar action and dialog do not exist.

- [ ] **Step 3: Implement selection-aware link operations**

```ts
function applyLink(): void {
  const editor = editorRef.current;
  const range = savedRangeRef.current;
  const normalized = normalizeEditorLink(linkValue);
  if (!editor || !range) {
    setLinkError("请先在正文中选择文字或放置光标");
    return;
  }
  if (!normalized.ok) {
    setLinkError({
      EMPTY_LINK: "请输入链接地址",
      UNSAFE_LINK: "仅支持 HTTPS 或邮件地址链接",
      INVALID_LINK: "链接地址格式不正确"
    }[normalized.code]);
    return;
  }
  restoreRange(range);
  const anchor = activeAnchorRef.current ?? document.createElement("a");
  anchor.href = normalized.href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  if (!activeAnchorRef.current) {
    if (range.collapsed) anchor.textContent = normalized.href;
    else anchor.append(range.extractContents());
    range.insertNode(anchor);
  }
  closeLinkDialog();
  emit();
}
```

Find the active anchor with `Element.closest("a")` only when it is inside `editorRef.current`. Removing a link unwraps its child nodes rather than deleting visible text. Use an accessible in-page dialog, not `window.prompt`.

- [ ] **Step 4: Run the editor test and verify GREEN**

Run: `npm test -- tests/unit/components/mail-rich-editor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/mail/mail-rich-editor.tsx src/components/workspaces/workspace.module.css tests/unit/components/mail-rich-editor.test.tsx
git commit -m "feat: edit hyperlinks in visual mail"
```

### Task 3: Verify source/preview round-trip and the real composer workflow

**Files:**
- Modify: `tests/e2e/html-mail-workflow.spec.ts`
- Modify only if verification exposes a defect: files already listed in Tasks 1–2.

**Interfaces:**
- Consumes: completed editor-link tasks and existing preview API.
- Produces: browser-level proof that generated links survive visual/source/preview transitions and unsafe links are removed server-side.

- [ ] **Step 1: Add the failing E2E scenario**

```ts
test("adds a safe hyperlink and preserves it in send preview", async ({ page }) => {
  await page.goto("/mail?view=replies&compose=1");
  const editor = page.getByRole("textbox", { name: "邮件正文" });
  await editor.fill("查看帮助");
  await editor.selectText();
  await page.getByRole("button", { name: "超链接" }).click();
  await page.getByLabel("链接地址").fill("righttoken.ai/help");
  await page.getByRole("button", { name: "保存链接" }).click();
  await page.getByRole("button", { name: "发送预览" }).click();
  const source = await page.getByTitle("HTML 邮件发送预览").getAttribute("srcdoc");
  expect(source).toContain('href="https://righttoken.ai/help"');
  expect(source).toContain('rel="noopener noreferrer"');
});
```

- [ ] **Step 2: Run the focused E2E test**

Run: `npm run test:e2e -- tests/e2e/html-mail-workflow.spec.ts`

Expected: PASS after Tasks 1–2; if it fails, fix only the demonstrated round-trip defect and rerun.

- [ ] **Step 3: Run all editor-related unit tests**

Run: `npm test -- tests/unit/components/mail-rich-editor.test.tsx tests/unit/components/mail-html-preview.test.tsx tests/unit/modules/mail/html-policy.test.ts tests/unit/mail/editor-link.test.ts`

Expected: PASS.

- [ ] **Step 4: Run static and production checks**

Run: `npm run lint && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit the E2E coverage and leave the branch local**

```bash
git add tests/e2e/html-mail-workflow.spec.ts
git commit -m "test: cover mail editor hyperlinks"
git status --short
```

Expected: clean worktree; do not push.
