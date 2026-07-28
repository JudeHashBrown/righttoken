"use client";

import {
  Bold,
  ImagePlus,
  Italic,
  List,
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

const MAX_IMAGE_COUNT = 10;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function hydrateHtml(
  bodyHtml: string,
  assets: MailEditorAsset[]
): string {
  if (typeof document === "undefined") return bodyHtml;
  const template = document.createElement("template");
  template.innerHTML = bodyHtml;
  for (const image of template.content.querySelectorAll("img")) {
    const id = image.getAttribute("data-mail-asset-id");
    const asset = assets.find((item) => item.id === id);
    if (asset) {
      image.setAttribute("src", asset.previewUrl);
      image.setAttribute("alt", image.getAttribute("alt") || asset.fileName);
    } else {
      image.remove();
    }
  }
  return template.innerHTML;
}

function serializeEditor(editor: HTMLElement): {
  bodyHtml: string;
  bodyText: string;
} {
  const clone = editor.cloneNode(true) as HTMLElement;
  for (const image of clone.querySelectorAll("img")) {
    image.removeAttribute("src");
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
    MAIL_ASSET_INVALID_FILE: "请选择有效的图片文件"
  };
  return messages[code ?? ""] ?? "图片上传失败，请重试";
}

export function MailRichEditor({
  idPrefix,
  label,
  value,
  onChange
}: {
  idPrefix: string;
  label: string;
  value: MailRichContent;
  onChange(value: MailRichContent): void;
}): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const hydrated = hydrateHtml(value.bodyHtml, value.assets);
    if (editor.innerHTML !== hydrated) {
      editor.innerHTML = hydrated;
    }
  }, [value.assets, value.bodyHtml]);

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

  return (
    <div className={styles.mailRichField}>
      <label id={`${idPrefix}-label`}>{label}</label>
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
        <span aria-hidden="true" className={styles.toolbarDivider} />
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
          onClick={() => attachmentInputRef.current?.click()}
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
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
      />
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
      <MailAssetList assets={value.assets} onRemove={removeAsset} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
