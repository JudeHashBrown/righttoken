"use client";

import styles from "@/components/workspaces/workspace.module.css";
import type {
  MailEditorAsset
} from "@/components/mail/mail-rich-editor";

export type MailTemplateSummary = {
  id: string;
  key: string;
  version: number;
  name: string;
  locale: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  assets: MailEditorAsset[];
  active: boolean;
};

type Props = {
  templates: MailTemplateSummary[];
  selectedTemplateId: string | null;
  dirty: boolean;
  onSelect(template: MailTemplateSummary): void;
  onCreate(): void;
  onUpdate(): void;
  onToggle(): void;
};

export function MailTemplateTabs({
  templates,
  selectedTemplateId,
  dirty,
  onSelect,
  onCreate,
  onUpdate,
  onToggle
}: Props): React.JSX.Element {
  const selected = templates.find(
    (template) => template.id === selectedTemplateId
  );

  function select(template: MailTemplateSummary): void {
    if (
      template.id !== selectedTemplateId &&
      dirty &&
      !window.confirm(
        "当前回复内容已修改。切换模板会覆盖未发送的修改，是否继续？"
      )
    ) {
      return;
    }
    onSelect(template);
  }

  return (
    <div className={styles.templateBar}>
      <div
        aria-label="公共邮件模板"
        className={styles.templateTabs}
        role="tablist"
      >
        {templates.map((template) => (
          <button
            aria-selected={template.id === selectedTemplateId}
            className={styles.templateTab}
            key={template.id}
            onClick={() => select(template)}
            role="tab"
            type="button"
          >
            {template.name}
          </button>
        ))}
        {templates.length === 0 ? (
          <span className={styles.templateEmpty}>
            暂无公共模板
          </span>
        ) : null}
      </div>
      <div className={styles.templateActions}>
        <button
          className={styles.secondaryButton}
          onClick={onCreate}
          type="button"
        >
          新建模板
        </button>
        <button
          className={styles.secondaryButton}
          disabled={!selected}
          onClick={onUpdate}
          type="button"
        >
          更新当前模板
        </button>
        <button
          className={styles.secondaryButton}
          disabled={!selected}
          onClick={onToggle}
          type="button"
        >
          {selected?.active ? "停用当前模板" : "启用当前模板"}
        </button>
      </div>
    </div>
  );
}
