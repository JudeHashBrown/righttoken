"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";
import {
  MailRichEditor,
  type MailRichContent
} from "@/components/mail/mail-rich-editor";

type ComposerTask = {
  id: string;
  title: string;
  userLabel: string;
  recipient: string;
  suppressed: boolean;
};

type ComposerMailbox = {
  id: string;
  name: string;
  emailAddress: string;
};

type MailComposerProps = {
  tasks: ComposerTask[];
  mailboxes: ComposerMailbox[];
  initialSubject: string;
  initialBody: string;
};

function unresolvedVariables(subject: string, body: string): string[] {
  return Array.from(
    new Set(
      [...subject.matchAll(/\[[^\[\]\n]{1,80}\]/g), ...body.matchAll(/\[[^\[\]\n]{1,80}\]/g)]
        .map((match) => match[0])
        .filter(Boolean)
    )
  );
}

function initialRichContent(value: string): MailRichContent {
  return {
    bodyHtml: value
      .split(/\r?\n/)
      .map((line) => {
        const escaped = line
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        return `<p>${escaped || "<br>"}</p>`;
      })
      .join(""),
    bodyText: value,
    assets: []
  };
}

export function MailComposer({
  tasks,
  mailboxes,
  initialSubject,
  initialBody
}: MailComposerProps): React.JSX.Element {
  const router = useRouter();
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [recipient, setRecipient] = useState(
    tasks[0]?.recipient ?? ""
  );
  const [mailboxId, setMailboxId] = useState(
    mailboxes[0]?.id ?? ""
  );
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState<MailRichContent>(() =>
    initialRichContent(initialBody)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedTask = tasks.find((task) => task.id === taskId);
  const normalizedRecipient = recipient.trim().toLowerCase();
  const originalRecipient =
    selectedTask?.recipient.trim().toLowerCase() ?? "";
  const recipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizedRecipient
  );
  const recipientOverridden =
    Boolean(selectedTask) &&
    recipientValid &&
    normalizedRecipient !== originalRecipient;
  const unresolved = useMemo(
    () => unresolvedVariables(subject, content.bodyText),
    [subject, content.bodyText]
  );
  const blocked =
    !selectedTask ||
    !mailboxId ||
    !recipientValid ||
    selectedTask.suppressed ||
    unresolved.length > 0 ||
    !subject.trim() ||
    !content.bodyText.trim();

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (blocked) {
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId,
          mailboxId,
          recipient: normalizedRecipient,
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
      const result = (await response.json().catch(() => null)) as {
        code?: string;
      } | null;
      if (!response.ok) {
        const messages: Record<string, string> = {
          RECIPIENT_SUPPRESSED: "该用户已退订，禁止发送。",
          RECIPIENT_PAUSED: "该用户当前已暂停联系。",
          CONTACT_FREQUENCY_LIMIT: "距离上次联系时间过短。",
          SMTP_SEND_FAILED: "邮箱发送失败，请检查邮箱连接。",
          MAIL_ASSET_MISSING:
            "部分图片已失效，请删除后重新上传。",
          MAIL_ASSET_LIMIT_EXCEEDED:
            "一封邮件最多添加 10 张图片。",
          MAIL_ASSET_TOTAL_TOO_LARGE:
            "图片总大小不能超过 20 MB。",
          MAIL_INLINE_ASSET_MISMATCH:
            "正文图片与邮件内容不一致，请重新插入。"
        };
        setError(
          messages[result?.code ?? ""] ??
            "邮件未发送，请检查内容后重试。"
        );
        return;
      }
      setSuccess("邮件已发送并记录");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function selectTask(nextTaskId: string): void {
    setTaskId(nextTaskId);
    setRecipient(
      tasks.find((task) => task.id === nextTaskId)?.recipient ?? ""
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>审核并发送邮件</h2>
          <p>发送前可编辑最终主题与正文；发送版本会永久保存</p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <div className={styles.editorGrid}>
          <div className={styles.field}>
            <label htmlFor="mail-task">关联任务与用户</label>
            <select
              className={styles.select}
              id="mail-task"
              value={taskId}
              onChange={(event) => selectTask(event.target.value)}
              disabled={submitting || tasks.length === 0}
            >
              {tasks.length === 0 ? (
                <option value="">暂无可发送任务</option>
              ) : null}
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.userLabel} · {task.title}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="mailbox">发件邮箱</label>
            <select
              className={styles.select}
              id="mailbox"
              value={mailboxId}
              onChange={(event) => setMailboxId(event.target.value)}
              disabled={submitting || mailboxes.length === 0}
            >
              {mailboxes.length === 0 ? (
                <option value="">请先在系统设置连接邮箱</option>
              ) : null}
              {mailboxes.map((mailbox) => (
                <option key={mailbox.id} value={mailbox.id}>
                  {mailbox.name} · {mailbox.emailAddress}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="mail-recipient">最终收件人</label>
            <input
              className={styles.input}
              id="mail-recipient"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              required
              disabled={submitting}
            />
          </div>
        </div>
        {recipientOverridden ? (
          <p className={styles.notice}>
            <strong>当前使用手动收件人</strong>
            <br />
            邮件仍会关联所选任务，并记录实际收件地址。
          </p>
        ) : null}
        <div className={styles.field}>
          <label htmlFor="mail-subject">邮件主题</label>
          <input
            className={styles.input}
            id="mail-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
            required
            disabled={submitting}
          />
        </div>
        <MailRichEditor
          idPrefix="mail"
          label="邮件正文"
          onChange={setContent}
          value={content}
        />

        {unresolved.length ? (
          <p className={styles.error}>
            仍有未替换变量：{unresolved.join("、")}
          </p>
        ) : null}
        {selectedTask?.suppressed ? (
          <p className={styles.error}>该用户已退订，禁止发送</p>
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
            type="submit"
            disabled={blocked || submitting}
          >
            {submitting ? "正在发送" : "审核并发送"}
          </button>
        </div>
      </form>
    </section>
  );
}
