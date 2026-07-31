"use client";

import { useState, type FormEvent } from "react";
import styles from "@/components/workspaces/workspace.module.css";
import {
  MailRichEditor,
  type MailEditorAsset,
  type MailRichContent
} from "@/components/mail/mail-rich-editor";

type Props = {
  initialSubject: string;
  initialBody: string;
  initialHtml?: string;
  initialAssets?: MailEditorAsset[];
  onClose(): void;
  onSaved(): void;
};

export function MailTemplateManager({
  initialSubject,
  initialBody,
  initialHtml,
  initialAssets = [],
  onClose,
  onSaved
}: Props): React.JSX.Element {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState<MailRichContent>({
    bodyHtml:
      initialHtml ??
      (initialBody
        ? `<p>${initialBody
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</p>`
        : ""),
    bodyText: initialBody,
    assets: initialAssets
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/mail/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          subject,
          bodyText: content.bodyText,
          bodyHtml: content.bodyHtml,
          assets: content.assets.map(
            ({ id, disposition, sortOrder }) => ({
              id,
              disposition,
              sortOrder
            })
          )
        })
      });
      if (!response.ok) {
        setError("模板保存失败，请检查内容后重试。");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("网络连接异常，模板尚未保存。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.templateEditor} onSubmit={submit}>
      <div className={styles.templateEditorHeader}>
        <div>
          <strong>新建公共模板</strong>
          <p>保存后所有运营成员都可以使用</p>
        </div>
        <button
          className={styles.secondaryButton}
          onClick={onClose}
          type="button"
        >
          取消
        </button>
      </div>
      <div className={styles.editorGrid}>
        <div className={styles.field}>
          <label htmlFor="new-template-name">模板名称</label>
          <input
            className={styles.input}
            id="new-template-name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="new-template-subject">邮件主题</label>
          <input
            className={styles.input}
            id="new-template-subject"
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
            required
            value={subject}
          />
        </div>
      </div>
      <MailRichEditor
        idPrefix="new-template"
        label="邮件正文"
        onChange={setContent}
        subject={subject}
        value={content}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button
        className={styles.button}
        disabled={
          saving ||
          !name.trim() ||
          !subject.trim() ||
          !content.bodyText.trim()
        }
        type="submit"
      >
        {saving ? "保存中…" : "保存模板"}
      </button>
    </form>
  );
}
