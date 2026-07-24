"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

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

export function MailComposer({
  tasks,
  mailboxes,
  initialSubject,
  initialBody
}: MailComposerProps): React.JSX.Element {
  const router = useRouter();
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [mailboxId, setMailboxId] = useState(
    mailboxes[0]?.id ?? ""
  );
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedTask = tasks.find((task) => task.id === taskId);
  const unresolved = useMemo(
    () => unresolvedVariables(subject, body),
    [subject, body]
  );
  const blocked =
    !selectedTask ||
    !mailboxId ||
    selectedTask.suppressed ||
    unresolved.length > 0 ||
    !subject.trim() ||
    !body.trim();

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
          subject,
          bodyText: body
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
          SMTP_SEND_FAILED: "邮箱发送失败，请检查邮箱连接。"
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
              onChange={(event) => setTaskId(event.target.value)}
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
            <label>最终收件人</label>
            <input
              className={styles.input}
              value={selectedTask?.recipient ?? ""}
              readOnly
            />
          </div>
        </div>
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
        <div className={styles.field}>
          <label htmlFor="mail-body">邮件正文</label>
          <textarea
            className={styles.textarea}
            id="mail-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            required
            disabled={submitting}
          />
        </div>

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
