"use client";

import {
  useMemo,
  useState,
  type FormEvent
} from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";
import {
  MailTemplateManager
} from "@/components/mail/mail-template-manager";
import type {
  MailTemplateSummary
} from "@/components/mail/mail-template-tabs";
import {
  MailRichEditor,
  type MailRichContent
} from "@/components/mail/mail-rich-editor";

export function MailTemplateLibrary({
  templates
}: {
  templates: MailTemplateSummary[];
}): React.JSX.Element {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(
    templates[0]?.key ?? null
  );
  const selected = useMemo(
    () =>
      templates.find((template) => template.key === selectedKey) ??
      null,
    [selectedKey, templates]
  );
  const [name, setName] = useState(selected?.name ?? "");
  const [subject, setSubject] = useState(selected?.subject ?? "");
  const [content, setContent] = useState<MailRichContent>({
    bodyHtml: selected?.bodyHtml ?? "",
    bodyText: selected?.bodyText ?? "",
    assets: selected?.assets ?? []
  });
  const [dirty, setDirty] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function selectTemplate(template: MailTemplateSummary): void {
    if (
      template.key !== selectedKey &&
      dirty &&
      !window.confirm(
        "当前模板内容尚未发布。切换模板会丢失这些修改，是否继续？"
      )
    ) {
      return;
    }
    setSelectedKey(template.key);
    setName(template.name);
    setSubject(template.subject);
    setContent({
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      assets: template.assets
    });
    setDirty(false);
    setError(null);
    setSuccess(null);
  }

  function change(
    setter: (value: string) => void,
    value: string
  ): void {
    setter(value);
    setDirty(true);
    setError(null);
    setSuccess(null);
  }

  function changeContent(value: MailRichContent): void {
    setContent(value);
    setDirty(true);
    setError(null);
    setSuccess(null);
  }

  async function publish(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/mail/templates/${encodeURIComponent(
          selected.key
        )}/versions`,
        {
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
        }
      );
      if (!response.ok) {
        setError("模板发布失败，请检查内容后重试。");
        return;
      }
      setDirty(false);
      setSuccess("新版本已发布");
      router.refresh();
    } catch {
      setError("网络连接异常，当前修改尚未发布。");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(): Promise<void> {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/mail/templates/${encodeURIComponent(
          selected.key
        )}/toggle`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: !selected.active })
        }
      );
      if (!response.ok) {
        setError("模板状态修改失败，请稍后重试。");
        return;
      }
      setSuccess(selected.active ? "模板已停用" : "模板已启用");
      router.refresh();
    } catch {
      setError("网络连接异常，模板状态没有改变。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.templateLibrary}>
      <header className={styles.templateLibraryHeader}>
        <div>
          <h2>公共邮件模板</h2>
          <p>
            所有运营成员均可使用和维护，共 {templates.length} 个模板
          </p>
        </div>
        <button
          className={styles.secondaryButton}
          onClick={() => setShowCreator(true)}
          type="button"
        >
          新建模板
        </button>
      </header>

      {showCreator ? (
        <MailTemplateManager
          initialBody=""
          initialSubject=""
          onClose={() => setShowCreator(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}

      {templates.length === 0 && !showCreator ? (
        <div className={styles.templateLibraryEmpty}>
          <strong>还没有公共邮件模板</strong>
          <p>创建后，运营人员回复用户时可以直接选用并修改。</p>
          <button
            className={styles.button}
            onClick={() => setShowCreator(true)}
            type="button"
          >
            新建第一个模板
          </button>
        </div>
      ) : null}

      {templates.length > 0 ? (
        <>
          <div
            aria-label="公共邮件模板"
            className={styles.templateLibraryTabs}
            role="tablist"
          >
            {templates.map((template) => (
              <button
                aria-selected={template.key === selectedKey}
                className={styles.templateTab}
                key={template.key}
                onClick={() => selectTemplate(template)}
                role="tab"
                type="button"
              >
                {template.name}
                {!template.active ? " · 已停用" : ""}
              </button>
            ))}
          </div>

          {selected ? (
            <form
              className={styles.templateLibraryForm}
              onSubmit={publish}
            >
              <div className={styles.templateLibraryMeta}>
                <span>
                  当前版本 v{selected.version}
                </span>
                <span
                  className={
                    selected.active
                      ? styles.statusGood
                      : styles.statusWaiting
                  }
                >
                  {selected.active ? "使用中" : "已停用"}
                </span>
              </div>
              <div className={styles.editorGrid}>
                <div className={styles.field}>
                  <label htmlFor="library-template-name">
                    模板名称
                  </label>
                  <input
                    className={styles.input}
                    id="library-template-name"
                    maxLength={80}
                    onChange={(event) =>
                      change(setName, event.target.value)
                    }
                    required
                    value={name}
                  />
                </div>
                <div
                  className={`${styles.field} ${styles.templateSubjectField}`}
                >
                  <label htmlFor="library-template-subject">
                    邮件主题
                  </label>
                  <input
                    className={styles.input}
                    id="library-template-subject"
                    maxLength={200}
                    onChange={(event) =>
                      change(setSubject, event.target.value)
                    }
                    required
                    value={subject}
                  />
                </div>
              </div>
              <MailRichEditor
                idPrefix="library-template"
                label="邮件正文"
                onChange={changeContent}
                value={content}
              />
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p className={styles.success} role="status">
                  {success}
                </p>
              ) : null}
              <footer className={styles.templateLibraryFooter}>
                <button
                  className={styles.button}
                  disabled={
                    saving ||
                    !dirty ||
                    !name.trim() ||
                    !subject.trim() ||
                    !content.bodyText.trim()
                  }
                  type="submit"
                >
                  {saving ? "发布中…" : "发布新版本"}
                </button>
                <button
                  className={styles.secondaryButton}
                  disabled={saving}
                  onClick={toggle}
                  type="button"
                >
                  {selected.active ? "停用模板" : "启用模板"}
                </button>
              </footer>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
