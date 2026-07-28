"use client";

import {
  useMemo,
  useState,
  type FormEvent
} from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";
import {
  MailTemplateTabs,
  type MailTemplateSummary
} from "@/components/mail/mail-template-tabs";
import {
  MailTemplateManager
} from "@/components/mail/mail-template-manager";

export type MailThreadDetail = {
  id: string;
  subject: string;
  user: {
    id: string;
    externalUserId: string;
    displayName: string | null;
    email: string;
    currentSegment: string;
    countryCode: string | null;
    region: string | null;
    owner: { id: string; displayName: string } | null;
    unsubscribedAt: string | null;
    pausedAt: string | null;
    task: {
      id: string;
      title: string;
      status: string;
      assigneeId: string | null;
    } | null;
  };
  mailbox: {
    id: string;
    name: string;
    emailAddress: string;
    enabled: boolean;
  };
  messages: ReadonlyArray<{
    id: string;
    direction: string;
    status: string;
    fromAddress: string;
    toAddresses: readonly string[];
    subject: string;
    bodyText: string;
    sentAt: string | null;
    receivedAt: string | null;
    createdAt: string;
  }>;
};

type Props = {
  thread: MailThreadDetail;
  templates: MailTemplateSummary[];
  canArchiveTemplates: boolean;
};

function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim())
    ? subject.trim()
    : `Re: ${subject.trim()}`;
}

function unresolvedVariables(
  subject: string,
  body: string
): string[] {
  return Array.from(
    new Set(
      [
        ...subject.matchAll(/\[[^\[\]\n]{1,80}\]/g),
        ...body.matchAll(/\[[^\[\]\n]{1,80}\]/g)
      ].map((match) => match[0])
    )
  );
}
export function MailReplyEditor({
  thread,
  templates
}: Props): React.JSX.Element {
  const activeTemplates = templates.filter(
    (template) => template.active
  );
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | null
  >(null);
  const [subject, setSubject] = useState(
    replySubject(thread.subject)
  );
  const [bodyText, setBodyText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showTemplateCreator, setShowTemplateCreator] =
    useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );
  const unresolved = useMemo(
    () => unresolvedVariables(subject, bodyText),
    [subject, bodyText]
  );
  const suppressed = Boolean(thread.user.unsubscribedAt);
  const paused = Boolean(thread.user.pausedAt);
  const blocked =
    !thread.mailbox.enabled ||
    !thread.user.task ||
    suppressed ||
    paused ||
    !subject.trim() ||
    !bodyText.trim() ||
    unresolved.length > 0;

  function selectTemplate(template: MailTemplateSummary): void {
    setSelectedTemplateId(template.id);
    setSubject(template.subject);
    setBodyText(template.bodyText);
    setDirty(false);
    setError(null);
    setSuccess(null);
  }

  async function updateTemplate(): Promise<void> {
    if (!selectedTemplate || !subject.trim() || !bodyText.trim()) {
      return;
    }
    setError(null);
    const response = await fetch(
      `/api/mail/templates/${encodeURIComponent(
        selectedTemplate.key
      )}/versions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: selectedTemplate.name,
          subject,
          bodyText
        })
      }
    ).catch(() => null);
    if (!response?.ok) {
      setError("模板更新失败，请刷新后重试。");
      return;
    }
    setSuccess("公共模板已发布新版本");
    setDirty(false);
    router.refresh();
  }

  async function toggleTemplate(): Promise<void> {
    if (!selectedTemplate) {
      return;
    }
    const response = await fetch(
      `/api/mail/templates/${encodeURIComponent(
        selectedTemplate.key
      )}/toggle`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: !selectedTemplate.active
        })
      }
    ).catch(() => null);
    if (!response?.ok) {
      setError("模板状态修改失败，请稍后重试。");
      return;
    }
    setSuccess(
      selectedTemplate.active ? "模板已停用" : "模板已启用"
    );
    setSelectedTemplateId(null);
    router.refresh();
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (blocked || !thread.user.task) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/mail/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          taskId: thread.user.task.id,
          mailboxId: thread.mailbox.id,
          recipient: thread.user.email,
          subject,
          bodyText,
          templateId: selectedTemplateId
        })
      });
      const result = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      if (!response.ok) {
        const messages: Record<string, string> = {
          RECIPIENT_SUPPRESSED: "该用户已退订，禁止发送邮件。",
          RECIPIENT_PAUSED: "该用户当前已暂停联系。",
          CONTACT_FREQUENCY_LIMIT: "距离上次联系时间过短。",
          SMTP_SEND_FAILED: "邮箱发送失败，回复草稿已保留。"
        };
        setError(
          messages[result?.code ?? ""] ??
            "回复发送失败，当前内容已保留。"
        );
        return;
      }
      setSuccess("回复已发送并记录到当前会话");
      setDirty(false);
      router.refresh();
    } catch {
      setError("网络连接异常，回复内容已保留。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.replyEditor}>
      <div className={styles.replyEditorHeader}>
        <div>
          <h3>回复用户</h3>
          <p>
            通过 {thread.mailbox.name} 回复至 {thread.user.email}
          </p>
        </div>
      </div>
      <MailTemplateTabs
        dirty={dirty}
        onCreate={() => setShowTemplateCreator(true)}
        onSelect={selectTemplate}
        onToggle={() => void toggleTemplate()}
        onUpdate={() => void updateTemplate()}
        selectedTemplateId={selectedTemplateId}
            templates={activeTemplates}
      />
      {showTemplateCreator ? (
        <MailTemplateManager
          initialBody={bodyText}
          initialSubject={subject}
          onClose={() => setShowTemplateCreator(false)}
          onSaved={() => router.refresh()}
        />
      ) : null}
      <form className={styles.replyForm} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="reply-subject">邮件主题</label>
          <input
            className={styles.input}
            id="reply-subject"
            maxLength={200}
            onChange={(event) => {
              setSubject(event.target.value);
              setDirty(true);
            }}
            required
            value={subject}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="reply-body">邮件正文</label>
          <textarea
            className={styles.textarea}
            id="reply-body"
            onChange={(event) => {
              setBodyText(event.target.value);
              setDirty(true);
            }}
            required
            rows={8}
            value={bodyText}
          />
        </div>
        {suppressed ? (
          <p className={styles.error}>
            该用户已退订，禁止发送邮件
          </p>
        ) : null}
        {paused ? (
          <p className={styles.error}>
            该用户当前已暂停联系
          </p>
        ) : null}
        {unresolved.length ? (
          <p className={styles.error}>
            仍有未替换内容：{unresolved.join("、")}
          </p>
        ) : null}
        {!thread.user.task ? (
          <p className={styles.notice}>
            当前会话没有可处理的邮件任务，暂时不能发送回复。
          </p>
        ) : null}
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
        <div className={styles.inlineActions}>
          <button
            className={styles.button}
            disabled={blocked || submitting}
            type="submit"
          >
            {submitting ? "发送中…" : "发送回复"}
          </button>
          {selectedTemplate ? (
            <span className={styles.helperText}>
              本次使用：{selectedTemplate.name} v
              {selectedTemplate.version}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
