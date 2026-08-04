"use client";

import {
  Bold,
  Code2,
  Eye,
  FileUp,
  ImagePlus,
  Italic,
  Link2,
  List,
  Monitor,
  Paperclip,
  Underline
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import {
  MailAssetList
} from "@/components/mail/mail-asset-list";
import {
  MailHtmlPreview
} from "@/components/mail/mail-html-preview";
import type {
  MailHtmlDiagnostics
} from "@/modules/mail/html-policy";
import { normalizeEditorLink } from "@/modules/mail/editor-link";
import styles from "@/components/workspaces/workspace.module.css";

export type MailEditorAsset = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  previewUrl: string;
  disposition: "INLINE" | "ATTACHMENT";
  cid?: string | null;
  sortOrder: number;
};

export type MailRichContent = {
  bodyHtml: string;
  bodyText: string;
  assets: MailEditorAsset[];
};

type UploadedAsset = Omit<
  MailEditorAsset,
  "disposition" | "sortOrder"
>;

type EditorMode = "VISUAL" | "SOURCE" | "PREVIEW";

type MailPreviewResult = {
  html: string;
  text: string;
  diagnostics: MailHtmlDiagnostics;
  visualEditorCompatible: boolean;
  unresolvedVariables: string[];
  canSend: boolean;
};

const MAX_IMAGE_COUNT = 10;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function isComplexHtml(value: string): boolean {
  return (
    /<(?:html|head|body|title|meta|style|table|caption|colgroup|col|thead|tbody|tfoot|tr|th|td)\b/i.test(
      value
    ) || /\s(?:style|class|id)=/i.test(value)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function simplifiedVisualHtml(
  text: string,
  assets: MailEditorAsset[]
): string {
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
  const inlineImages = assets
    .filter((asset) => asset.disposition === "INLINE")
    .map(
      (asset) =>
        `<img data-mail-asset-id="${asset.id}" alt="${escapeHtml(
          asset.fileName
        )}">`
    )
    .join("");
  return `${paragraphs}${inlineImages}`;
}

function hydrateHtml(
  bodyHtml: string,
  assets: MailEditorAsset[]
): string {
  if (typeof document === "undefined") return bodyHtml;
  const hydrateImages = (root: ParentNode): void => {
    for (const image of root.querySelectorAll("img")) {
      const id = image.getAttribute("data-mail-asset-id");
      if (!id) {
        const source = image.getAttribute("src") ?? "";
        if (!source.startsWith("https://")) {
          image.remove();
        }
        continue;
      }
      const asset = assets.find((item) => item.id === id);
      if (asset) {
        image.setAttribute("src", asset.previewUrl);
        image.setAttribute(
          "alt",
          image.getAttribute("alt") || asset.fileName
        );
      } else {
        image.remove();
      }
    }
  };
  const isCompleteDocument =
    /^\s*<!doctype\s+html\s*>/i.test(bodyHtml) ||
    /<(?:html|head|body)\b/i.test(bodyHtml);
  if (isCompleteDocument) {
    const parsed = new DOMParser().parseFromString(
      bodyHtml,
      "text/html"
    );
    hydrateImages(parsed);
    const doctype = parsed.doctype
      ? `<!DOCTYPE ${parsed.doctype.name}>`
      : "";
    return `${doctype}${parsed.documentElement.outerHTML}`;
  }

  const template = document.createElement("template");
  template.innerHTML = bodyHtml;
  hydrateImages(template.content);
  return template.innerHTML;
}

function serializeEditor(editor: HTMLElement): {
  bodyHtml: string;
  bodyText: string;
} {
  const clone = editor.cloneNode(true) as HTMLElement;
  for (const image of clone.querySelectorAll("img")) {
    if (image.hasAttribute("data-mail-asset-id")) {
      image.removeAttribute("src");
    }
  }
  return {
    bodyHtml: clone.innerHTML.trim(),
    bodyText: (editor.innerText || editor.textContent || "").trim()
  };
}

function uploadError(code: string | undefined): string {
  const messages: Record<string, string> = {
    MAIL_IMAGE_UNSUPPORTED:
      "图片格式不支持，请上传 JPG、PNG 或 WebP",
    MAIL_IMAGE_TOO_LARGE: "单张图片不能超过 5 MB",
    MAIL_IMAGE_INVALID: "图片无法识别，请重新选择",
    MAIL_ASSET_INVALID_FILE: "请选择有效的图片文件",
    MAIL_ASSET_STORAGE_UNAVAILABLE:
      "图片存储暂不可用，请联系管理员"
  };
  return messages[code ?? ""] ?? "图片上传失败，请重试";
}

export function MailRichEditor({
  idPrefix,
  label,
  subject = "",
  value,
  onChange
}: {
  idPrefix: string;
  label: string;
  subject?: string;
  value: MailRichContent;
  onChange(value: MailRichContent): void;
}): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const activeAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [mode, setMode] = useState<EditorMode>(() =>
    isComplexHtml(value.bodyHtml) ? "SOURCE" : "VISUAL"
  );
  const [lastBodyHtml, setLastBodyHtml] = useState(
    value.bodyHtml
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [preview, setPreview] =
    useState<MailPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] =
    useState<string | null>(null);

  if (lastBodyHtml !== value.bodyHtml) {
    setLastBodyHtml(value.bodyHtml);
    if (mode === "VISUAL" && isComplexHtml(value.bodyHtml)) {
      setMode("SOURCE");
    }
  }
  const assetFingerprint = value.assets
    .map(
      (asset) =>
        `${asset.id}:${asset.disposition}:${asset.sortOrder}`
    )
    .join("|");

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [onChange, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (
      mode !== "VISUAL" ||
      !editor ||
      isComplexHtml(value.bodyHtml)
    ) {
      return;
    }
    const hydrated = hydrateHtml(value.bodyHtml, value.assets);
    if (editor.innerHTML !== hydrated) {
      editor.innerHTML = hydrated;
    }
  }, [mode, value.assets, value.bodyHtml]);

  useEffect(() => {
    if (mode === "VISUAL") {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
          const current = valueRef.current;
          const response = await fetch("/api/mail/preview", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              subject,
              bodyHtml: current.bodyHtml,
              assets: current.assets.map(
                ({ id, disposition, sortOrder }) => ({
                  id,
                  disposition,
                  sortOrder
                })
              )
            }),
            signal: controller.signal
          });
          const result = (await response
            .json()
            .catch(() => null)) as MailPreviewResult | null;
          if (!response.ok || !result) {
            throw new Error("MAIL_PREVIEW_FAILED");
          }
          setPreview(result);
          const latest = valueRef.current;
          if (latest.bodyText !== result.text) {
            onChangeRef.current({
              ...latest,
              bodyText: result.text
            });
          }
        } catch {
          if (!controller.signal.aborted) {
            setPreview(null);
            setPreviewError(
              "预览暂时不可用，请稍后重试。发送前必须完成检查。"
            );
          }
        } finally {
          if (!controller.signal.aborted) {
            setPreviewLoading(false);
          }
        }
      },
      mode === "PREVIEW" ? 0 : 250
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    assetFingerprint,
    mode,
    subject,
    value.bodyHtml
  ]);

  function emit(assets = value.assets): void {
    const editor = editorRef.current;
    if (!editor) return;
    onChange({ ...serializeEditor(editor), assets });
  }

  function saveSelection(): void {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (
      !editor ||
      !selection ||
      selection.rangeCount === 0 ||
      !editor.contains(selection.anchorNode)
    ) {
      return;
    }
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function anchorForRange(
    range: Range,
    editor: HTMLElement
  ): HTMLAnchorElement | null {
    const node = range.startContainer;
    const element =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    const anchor = element?.closest("a") ?? null;
    return anchor instanceof HTMLAnchorElement &&
      editor.contains(anchor)
      ? anchor
      : null;
  }

  function openLinkDialog(): void {
    saveSelection();
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    const anchor =
      editor && range ? anchorForRange(range, editor) : null;
    activeAnchorRef.current = anchor;
    setLinkValue(anchor?.getAttribute("href") ?? "");
    setLinkError(null);
    setLinkDialogOpen(true);
  }

  function closeLinkDialog(): void {
    setLinkDialogOpen(false);
    setLinkValue("");
    setLinkError(null);
    activeAnchorRef.current = null;
  }

  function applyLink(): void {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (
      !editor ||
      !range ||
      !editor.contains(range.commonAncestorContainer)
    ) {
      setLinkError("请先在正文中选择文字或放置光标");
      return;
    }
    const normalized = normalizeEditorLink(linkValue);
    if (!normalized.ok) {
      setLinkError(
        {
          EMPTY_LINK: "请输入链接地址",
          UNSAFE_LINK: "仅支持 HTTPS 或邮件地址链接",
          INVALID_LINK: "链接地址格式不正确"
        }[normalized.code]
      );
      return;
    }
    const activeAnchor = activeAnchorRef.current;
    if (activeAnchor && editor.contains(activeAnchor)) {
      activeAnchor.setAttribute("href", normalized.href);
      activeAnchor.setAttribute("target", "_blank");
      activeAnchor.setAttribute("rel", "noopener noreferrer");
    } else {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", normalized.href);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      if (range.collapsed) {
        anchor.textContent = normalized.href;
      } else {
        anchor.append(range.extractContents());
      }
      range.insertNode(anchor);
    }
    emit();
    closeLinkDialog();
  }

  function removeLink(): void {
    const editor = editorRef.current;
    const anchor = activeAnchorRef.current;
    if (!editor || !anchor || !editor.contains(anchor)) {
      setLinkError("当前选中的文字没有超链接");
      return;
    }
    anchor.replaceWith(...Array.from(anchor.childNodes));
    emit();
    closeLinkDialog();
  }

  function insertInlineImage(asset: MailEditorAsset): void {
    const editor = editorRef.current;
    if (!editor) return;
    const image = document.createElement("img");
    image.setAttribute("data-mail-asset-id", asset.id);
    image.setAttribute("src", asset.previewUrl);
    image.setAttribute("alt", asset.fileName);
    const range = savedRangeRef.current;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(image);
      range.setStartAfter(image);
      range.collapse(true);
    } else {
      editor.append(image);
    }
  }

  async function upload(
    file: File,
    disposition: MailEditorAsset["disposition"]
  ): Promise<void> {
    if (value.assets.length >= MAX_IMAGE_COUNT) {
      setError("一封邮件最多添加 10 张图片");
      return;
    }
    const total =
      value.assets.reduce((sum, asset) => sum + asset.byteSize, 0) +
      file.size;
    if (total > MAX_TOTAL_BYTES) {
      setError("图片总大小不能超过 20 MB");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/mail/assets", {
        method: "POST",
        body: form
      });
      const result = (await response.json().catch(() => null)) as {
        asset?: UploadedAsset;
        code?: string;
      } | null;
      if (!response.ok || !result?.asset) {
        setError(uploadError(result?.code));
        return;
      }
      const asset: MailEditorAsset = {
        ...result.asset,
        disposition,
        sortOrder: value.assets.length
      };
      const assets = [...value.assets, asset];
      if (disposition === "INLINE") {
        insertInlineImage(asset);
      }
      emit(assets);
    } catch {
      setError("图片上传失败，请重试");
    } finally {
      setUploading(false);
    }
  }

  async function selectFile(
    event: ChangeEvent<HTMLInputElement>,
    disposition: MailEditorAsset["disposition"]
  ): Promise<void> {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    for (const file of files) {
      await upload(file, disposition);
    }
    input.value = "";
  }

  function removeAsset(assetId: string): void {
    const editor = editorRef.current;
    if (!editor) return;
    for (const image of editor.querySelectorAll(
      "img[data-mail-asset-id]"
    )) {
      if (image.getAttribute("data-mail-asset-id") === assetId) {
        image.remove();
      }
    }
    emit(value.assets.filter((asset) => asset.id !== assetId));
  }

  function format(command: "bold" | "italic" | "underline" | "insertUnorderedList"): void {
    editorRef.current?.focus();
    document.execCommand(command);
    emit();
  }

  function selectMode(nextMode: EditorMode): void {
    if (
      nextMode === "VISUAL" &&
      mode !== "VISUAL" &&
      preview &&
      !preview.visualEditorCompatible
    ) {
      const confirmed = window.confirm(
        "当前 HTML 包含复杂布局。切换到可视化编辑会简化表格、样式和响应式布局，是否继续？"
      );
      if (!confirmed) {
        return;
      }
      onChange({
        ...value,
        bodyHtml: simplifiedVisualHtml(
          preview.text,
          value.assets
        ),
        bodyText: preview.text
      });
    } else if (
      nextMode === "VISUAL" &&
      mode !== "VISUAL" &&
      !preview
    ) {
      setPreviewError("请等待 HTML 安全检查完成后再切换。");
      return;
    }
    setMode(nextMode);
  }

  async function importHtml(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (
      !/\.html?$/i.test(file.name) &&
      file.type !== "text/html"
    ) {
      setError("请选择 .html 或 .htm 文件");
      input.value = "";
      return;
    }
    try {
      const bodyHtml = await file.text();
      onChange({
        ...value,
        bodyHtml,
        bodyText: ""
      });
      setPreview(null);
      setError(null);
    } catch {
      setError("HTML 文件读取失败，请重新选择");
    } finally {
      input.value = "";
    }
  }

  return (
    <div className={styles.mailRichField}>
      <label id={`${idPrefix}-label`}>{label}</label>
      <div className={styles.mailEditorModeBar}>
        <button
          aria-pressed={mode === "VISUAL"}
          className={
            mode === "VISUAL" ? styles.mailEditorModeActive : ""
          }
          onClick={() => selectMode("VISUAL")}
          type="button"
        >
          <Monitor aria-hidden="true" size={15} />
          可视化编辑
        </button>
        <button
          aria-pressed={mode === "SOURCE"}
          className={
            mode === "SOURCE" ? styles.mailEditorModeActive : ""
          }
          onClick={() => selectMode("SOURCE")}
          type="button"
        >
          <Code2 aria-hidden="true" size={15} />
          HTML 源码
        </button>
        <button
          aria-pressed={mode === "PREVIEW"}
          className={
            mode === "PREVIEW" ? styles.mailEditorModeActive : ""
          }
          onClick={() => selectMode("PREVIEW")}
          type="button"
        >
          <Eye aria-hidden="true" size={15} />
          发送预览
        </button>
        {mode === "SOURCE" ? (
          <button
            className={styles.mailEditorImportButton}
            onClick={() => htmlInputRef.current?.click()}
            type="button"
          >
            <FileUp aria-hidden="true" size={15} />
            导入 HTML
          </button>
        ) : null}
      </div>
      {mode === "VISUAL" ? (
        <>
          <div
            aria-label="邮件正文工具栏"
            className={styles.mailEditorToolbar}
            role="toolbar"
          >
            <button
              aria-label="加粗"
              onClick={() => format("bold")}
              type="button"
            >
              <Bold aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="斜体"
              onClick={() => format("italic")}
              type="button"
            >
              <Italic aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="下划线"
              onClick={() => format("underline")}
              type="button"
            >
              <Underline aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="项目符号"
              onClick={() => format("insertUnorderedList")}
              type="button"
            >
              <List aria-hidden="true" size={16} />
            </button>
            <button
              aria-label="超链接"
              onClick={openLinkDialog}
              type="button"
            >
              <Link2 aria-hidden="true" size={16} />
            </button>
            <span
              aria-hidden="true"
              className={styles.toolbarDivider}
            />
            <button
              disabled={uploading}
              onClick={() => {
                saveSelection();
                inlineInputRef.current?.click();
              }}
              type="button"
            >
              <ImagePlus aria-hidden="true" size={16} />
              插入正文图片
            </button>
            <button
              disabled={uploading}
              onClick={() =>
                attachmentInputRef.current?.click()
              }
              type="button"
            >
              <Paperclip aria-hidden="true" size={16} />
              添加图片附件
            </button>
            {uploading ? <span>上传中…</span> : null}
          </div>
          <div
            aria-labelledby={`${idPrefix}-label`}
            aria-multiline="true"
            className={styles.mailRichEditor}
            contentEditable
            id={`${idPrefix}-body`}
            onBlur={saveSelection}
            onInput={() => emit()}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            ref={editorRef}
            role="textbox"
            suppressContentEditableWarning
          />
          {linkDialogOpen ? (
            <div
              aria-labelledby={`${idPrefix}-link-title`}
              aria-modal="true"
              className={styles.mailLinkDialog}
              role="dialog"
            >
              <strong id={`${idPrefix}-link-title`}>
                {activeAnchorRef.current
                  ? "编辑超链接"
                  : "插入超链接"}
              </strong>
              <div className={styles.field}>
                <label htmlFor={`${idPrefix}-link-value`}>
                  链接地址
                </label>
                <input
                  autoFocus
                  className={styles.input}
                  id={`${idPrefix}-link-value`}
                  onChange={(event) => {
                    setLinkValue(event.target.value);
                    setLinkError(null);
                  }}
                  placeholder="example.com 或 mailto:name@example.com"
                  value={linkValue}
                />
              </div>
              {linkError ? (
                <p className={styles.error} role="alert">
                  {linkError}
                </p>
              ) : null}
              <div className={styles.inlineActions}>
                <button
                  className={styles.secondaryButton}
                  onClick={closeLinkDialog}
                  type="button"
                >
                  取消
                </button>
                {activeAnchorRef.current ? (
                  <button
                    className={styles.dangerButton}
                    onClick={removeLink}
                    type="button"
                  >
                    移除链接
                  </button>
                ) : null}
                <button
                  className={styles.button}
                  onClick={applyLink}
                  type="button"
                >
                  保存链接
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {mode === "SOURCE" ? (
        <textarea
          aria-label="HTML 邮件源码"
          className={styles.mailHtmlSource}
          onChange={(event) => {
            onChange({
              ...value,
              bodyHtml: event.target.value,
              bodyText: ""
            });
            setPreview(null);
            setPreviewError(null);
          }}
          spellCheck={false}
          value={value.bodyHtml}
        />
      ) : null}
      {mode === "PREVIEW" ? (
        <MailHtmlPreview
          diagnostics={preview?.diagnostics ?? null}
          error={previewError}
          html={
            preview
              ? hydrateHtml(preview.html, value.assets)
              : ""
          }
          loading={previewLoading}
          unresolvedVariables={
            preview?.unresolvedVariables ?? []
          }
        />
      ) : null}
      {mode === "SOURCE" && previewError ? (
        <p className={styles.error} role="alert">
          {previewError}
        </p>
      ) : null}
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="选择正文图片"
        className={styles.visuallyHidden}
        multiple
        onChange={(event) => void selectFile(event, "INLINE")}
        ref={inlineInputRef}
        type="file"
      />
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label="选择图片附件"
        className={styles.visuallyHidden}
        multiple
        onChange={(event) => void selectFile(event, "ATTACHMENT")}
        ref={attachmentInputRef}
        type="file"
      />
      <input
        accept=".html,.htm,text/html"
        aria-label="选择 HTML 文件"
        className={styles.visuallyHidden}
        onChange={(event) => void importHtml(event)}
        ref={htmlInputRef}
        type="file"
      />
      <MailAssetList assets={value.assets} onRemove={removeAsset} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
