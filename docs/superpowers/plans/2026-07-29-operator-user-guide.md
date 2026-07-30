# RightToken Operator User Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a visually verified Chinese Word manual that enables a new ordinary operator to use the six daily RightToken operations modules without technical assistance.

**Architecture:** Maintain the manual content as a focused Markdown source, then generate a deterministic DOCX with a small Python builder using the bundled document runtime. Render the DOCX to page images and inspect every page before delivery; keep administrative and backend-only information out of both the source and the final artifact.

**Tech Stack:** Markdown, bundled Python 3, `python-docx`, WordprocessingML helpers, LibreOffice-based `render_docx.py`.

## Global Constraints

- Deliver only an editable Word document (`.docx`).
- Cover only: 用户运营概览、任务中心、用户中心、邮件中心、用户分组查看、数据报表.
- Use ordinary operations language; do not expose database fields, API names, code terms, Boolean expressions, or internal rule-engine wording.
- Do not include passwords, keys, real user email addresses, real IP addresses, or other sensitive user data.
- Use the `compact_reference_guide` document design preset and RightToken blue-purple accents.
- Render and inspect every final DOCX page before delivery.

---

### Task 1: Author the operator-facing source

**Files:**
- Create: `docs/manuals/righttoken-operator-guide-content.md`
- Read: `recall-admin/src/app/(dashboard)/dashboard/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/tasks/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/tasks/[id]/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/users/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/users/[id]/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/mail/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/automation/segments/page.tsx`
- Read: `recall-admin/src/app/(dashboard)/reports/page.tsx`

**Interfaces:**
- Consumes: current visible UI copy, ordinary-operator permissions, and the approved manual design.
- Produces: `righttoken-operator-guide-content.md`, the sole narrative source for the Word builder.

- [ ] **Step 1: Extract the visible ordinary-operator workflow**

Record only labels and actions visible to an operator. Confirm module navigation, filters, task transitions, user detail actions, mail actions, segment read-only behavior, and report meanings directly from the current page and component files.

- [ ] **Step 2: Write the full Chinese source**

Write:

1. 封面信息
2. 五分钟快速上手
3. 每日工作清单
4. 六个模块的详细说明
5. 四个跨模块闭环
6. 常见问题与处理
7. 一页速查表

Every procedure must use numbered steps, begin with an action verb, and contain no more than seven steps.

- [ ] **Step 3: Run the language-safety scan**

Run:

```bash
rg -n "DATABASE|API|true|false|boolean|布尔|接口密钥|密码|registrationIp|externalUserId|SegmentCode|Prisma" docs/manuals/righttoken-operator-guide-content.md
```

Expected: no matches, except a deliberate plain-language statement that real passwords and user data are not included.

- [ ] **Step 4: Review module coverage**

Run:

```bash
rg -n "^## (用户运营概览|任务中心|用户中心|邮件中心|用户分组查看|数据报表)" docs/manuals/righttoken-operator-guide-content.md
```

Expected: exactly six module headings.

### Task 2: Generate the Word manual

**Files:**
- Create: `docs/manuals/build_operator_guide.py`
- Create: `docs/manuals/RightToken用户运营管理后台使用手册.docx`
- Read: `docs/manuals/righttoken-operator-guide-content.md`

**Interfaces:**
- Consumes: the approved Markdown source and exact `compact_reference_guide` design tokens.
- Produces: a deterministic, editable `.docx` with headings, real numbered lists, tables, callout boxes, header, footer, page numbers, and internal visual hierarchy.

- [ ] **Step 1: Implement the DOCX builder**

Use the bundled Python runtime:

```bash
/Users/meichaoqun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  docs/manuals/build_operator_guide.py
```

The builder must:

- use US Letter portrait geometry and exact preset margins;
- create explicit Normal, Heading 1, Heading 2, and Heading 3 styles;
- use real Word numbering for ordered procedures and bullet lists;
- use exact-width tables for module summaries and quick-reference content;
- add RightToken-branded header and page-number footer;
- keep headings with the next paragraph;
- set Chinese fonts explicitly;
- scrub creator metadata.

- [ ] **Step 2: Generate the Word file**

Run:

```bash
/Users/meichaoqun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  docs/manuals/build_operator_guide.py
```

Expected: `docs/manuals/RightToken用户运营管理后台使用手册.docx` exists and is non-empty.

- [ ] **Step 3: Run structural audits**

Run:

```bash
/Users/meichaoqun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/meichaoqun/.codex/plugins/cache/openai-primary-runtime/documents/26.727.11326/skills/documents/scripts/heading_audit.py \
  docs/manuals/RightToken用户运营管理后台使用手册.docx
```

Then run:

```bash
/Users/meichaoqun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/meichaoqun/.codex/plugins/cache/openai-primary-runtime/documents/26.727.11326/skills/documents/scripts/a11y_audit.py \
  docs/manuals/RightToken用户运营管理后台使用手册.docx
```

Expected: no missing heading hierarchy, table-header, or image-alt issues that affect the manual.

### Task 3: Render, inspect, and finalize

**Files:**
- Inspect: `docs/manuals/RightToken用户运营管理后台使用手册.docx`
- Create temporarily: `/tmp/righttoken-operator-guide-render/page-*.png`
- Modify if required: `docs/manuals/build_operator_guide.py`
- Regenerate if required: `docs/manuals/RightToken用户运营管理后台使用手册.docx`

**Interfaces:**
- Consumes: the generated DOCX.
- Produces: a final DOCX whose every rendered page has passed visual inspection.

- [ ] **Step 1: Render the complete document**

Run:

```bash
/Users/meichaoqun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/meichaoqun/.codex/plugins/cache/openai-primary-runtime/documents/26.727.11326/skills/documents/render_docx.py \
  docs/manuals/RightToken用户运营管理后台使用手册.docx \
  --output_dir /tmp/righttoken-operator-guide-render
```

Expected: one PNG per Word page.

- [ ] **Step 2: Inspect every rendered page**

Check every `page-*.png` at full detail for:

- clipped Chinese text;
- broken or overly dense tables;
- headings stranded at page bottoms;
- oversized whitespace;
- list-number alignment;
- inconsistent callout padding;
- missing page numbers;
- header or footer collisions.

- [ ] **Step 3: Correct and re-render**

If any page fails, modify only the builder or source responsible for the defect, regenerate the DOCX, clear the temporary render output, and repeat Steps 1–2 until all pages pass.

- [ ] **Step 4: Run final privacy and file checks**

Run:

```bash
/Users/meichaoqun/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  /Users/meichaoqun/.codex/plugins/cache/openai-primary-runtime/documents/26.727.11326/skills/documents/scripts/privacy_scrub.py \
  docs/manuals/RightToken用户运营管理后台使用手册.docx \
  --out docs/manuals/RightToken用户运营管理后台使用手册.clean.docx
```

Replace the final DOCX with the scrubbed copy, render it once more, and verify page count and layout are unchanged.

- [ ] **Step 5: Commit the final manual**

```bash
git add \
  docs/manuals/righttoken-operator-guide-content.md \
  docs/manuals/build_operator_guide.py \
  docs/manuals/RightToken用户运营管理后台使用手册.docx
git commit -m "docs: add operator user guide"
```
