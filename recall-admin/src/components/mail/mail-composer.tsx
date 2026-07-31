"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";
import {
  MailRichEditor,
  type MailRichContent
} from "@/components/mail/mail-rich-editor";

type ComposerUser = {
  id: string;
  label: string;
  email: string;
  suppressed: boolean;
  paused: boolean;
};

type ComposerTask = {
  id: string;
  userId?: string;
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

type ComposerTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  assets: MailRichContent["assets"];
};

type AudienceMode = "USER" | "SEGMENT" | "ALL";

type AudiencePreview = {
  label: string;
  total: number;
  estimatedSkipped: number;
};

const segmentOptions = [
  "F",
  "A",
  "B",
  "C",
  "D",
  "E",
  "G"
] as const;

type MailComposerProps = {
  tasks: ComposerTask[];
  users?: ComposerUser[];
  mailboxes: ComposerMailbox[];
  templates?: ComposerTemplate[];
  initialUserId?: string | null;
  initialTaskId?: string | null;
  initialSubject: string;
  initialBody: string;
  closeHref?: string;
};

function unresolvedVariables(
  subject: string,
  body: string
): string[] {
  return Array.from(
    new Set(
      [
        ...subject.matchAll(/\[[^\[\]\n]{1,80}\]/g),
        ...body.matchAll(/\[[^\[\]\n]{1,80}\]/g)
      ]
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

function taskUser(task: ComposerTask): ComposerUser {
  return {
    id: task.userId ?? `task-user:${task.id}`,
    label: task.userLabel,
    email: task.recipient,
    suppressed: task.suppressed,
    paused: false
  };
}

export function MailComposer({
  tasks,
  users = [],
  mailboxes,
  templates = [],
  initialUserId = null,
  initialTaskId = null,
  initialSubject,
  initialBody,
  closeHref
}: MailComposerProps): React.JSX.Element {
  const router = useRouter();
  const initialTask =
    tasks.find((task) => task.id === initialTaskId) ??
    (initialTaskId ? undefined : tasks[0]);
  const initialUsers = useMemo(() => {
    const byId = new Map(
      users.map((user) => [user.id, user])
    );
    for (const task of tasks) {
      const user = taskUser(task);
      if (!byId.has(user.id)) {
        byId.set(user.id, user);
      }
    }
    return [...byId.values()];
  }, [tasks, users]);
  const firstUserId =
    initialUserId ??
    (initialTask ? taskUser(initialTask).id : "");
  const firstUser =
    initialUsers.find((user) => user.id === firstUserId) ??
    null;
  const [availableUsers, setAvailableUsers] =
    useState(initialUsers);
  const [userQuery, setUserQuery] = useState("");
  const [userId, setUserId] = useState(firstUser?.id ?? "");
  const [taskId, setTaskId] = useState(initialTask?.id ?? "");
  const [recipient, setRecipient] = useState(
    firstUser?.email ?? ""
  );
  const [mailboxId, setMailboxId] = useState(
    mailboxes[0]?.id ?? ""
  );
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState<MailRichContent>(() =>
    initialRichContent(initialBody)
  );
  const [audienceMode, setAudienceMode] =
    useState<AudienceMode>("USER");
  const [segment, setSegment] =
    useState<(typeof segmentOptions)[number]>("F");
  const [audiencePreview, setAudiencePreview] =
    useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] =
    useState(false);
  const batchIdempotencyKey = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedUser =
    availableUsers.find((user) => user.id === userId) ??
    initialUsers.find((user) => user.id === userId) ??
    null;
  const selectedTask = tasks.find((task) => task.id === taskId);
  const userTasks = tasks.filter(
    (task) => taskUser(task).id === userId
  );
  const normalizedRecipient = recipient.trim().toLowerCase();
  const originalRecipient =
    selectedUser?.email.trim().toLowerCase() ?? "";
  const recipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizedRecipient
  );
  const recipientOverridden =
    Boolean(selectedUser) &&
    recipientValid &&
    normalizedRecipient !== originalRecipient;
  const unresolved = useMemo(
    () => unresolvedVariables(subject, content.bodyText),
    [subject, content.bodyText]
  );
  const contentBlocked =
    !mailboxId ||
    unresolved.length > 0 ||
    !subject.trim() ||
    !content.bodyText.trim();
  const blocked =
    contentBlocked ||
    (audienceMode === "USER"
      ? !selectedUser ||
        !recipientValid ||
        selectedUser.suppressed ||
        selectedUser.paused
      : previewLoading ||
        !audiencePreview ||
        audiencePreview.total === 0);

  useEffect(() => {
    if (audienceMode !== "USER") {
      return;
    }
    const query = userQuery.trim();
    if (query.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/mail/compose-context?query=${encodeURIComponent(
            query
          )}`,
          { signal: controller.signal }
        );
        const result = (await response.json().catch(() => null)) as {
          users?: ComposerUser[];
        } | null;
        if (response.ok && result?.users) {
          setAvailableUsers((current) => {
            const byId = new Map(
              current
                .filter((user) => user.id === userId)
                .map((user) => [user.id, user])
            );
            for (const user of result.users ?? []) {
              byId.set(user.id, user);
            }
            return [...byId.values()];
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("用户搜索暂时不可用，请稍后重试。");
        }
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [audienceMode, userId, userQuery]);

  useEffect(() => {
    if (audienceMode === "USER") {
      return;
    }
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      mode: audienceMode,
      ...(audienceMode === "SEGMENT"
        ? { segment }
        : {})
    });
    fetch(`/api/mail/audience-preview?${parameters}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const result = (await response
          .json()
          .catch(() => null)) as AudiencePreview | null;
        if (!response.ok || !result) {
          throw new Error("MAIL_AUDIENCE_PREVIEW_FAILED");
        }
        setAudiencePreview(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("受众人数暂时无法计算，请稍后重试。");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      });
    return () => controller.abort();
  }, [audienceMode, segment]);

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
      const assets = content.assets.map(
        ({ id, disposition, sortOrder }) => ({
          id,
          disposition,
          sortOrder
        })
      );
      let response: Response;
      if (audienceMode === "USER") {
        if (!selectedUser) {
          return;
        }
        response = await fetch("/api/mail/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: selectedUser.id,
            ...(taskId ? { taskId } : {}),
            mailboxId,
            recipient: normalizedRecipient,
            subject,
            bodyText: content.bodyText,
            bodyHtml: content.bodyHtml,
            assets
          })
        });
      } else {
        batchIdempotencyKey.current ??=
          globalThis.crypto?.randomUUID?.() ??
          `mail-batch-${Date.now()}`;
        response = await fetch("/api/mail/batches", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": batchIdempotencyKey.current
          },
          body: JSON.stringify({
            mode: audienceMode,
            ...(audienceMode === "SEGMENT"
              ? { segment }
              : {}),
            mailboxId,
            subject,
            bodyText: content.bodyText,
            bodyHtml: content.bodyHtml,
            assets
          })
        });
      }
      const result = (await response.json().catch(() => null)) as {
        code?: string;
        taskId?: string;
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
            "正文图片与邮件内容不一致，请重新插入。",
          EMPTY_MAIL_AUDIENCE: "当前受众没有可发送用户。",
          MAILBOX_DISABLED: "发件邮箱当前未启用。"
        };
        setError(
          messages[result?.code ?? ""] ??
            "邮件未发送，请检查内容后重试。"
        );
        return;
      }
      if (result?.taskId) {
        setTaskId(result.taskId);
      }
      setSuccess(
        audienceMode === "USER"
          ? "邮件已发送，任务已进入等待用户回复"
          : "群发任务已创建，可在下方查看进度"
      );
      if (audienceMode !== "USER") {
        batchIdempotencyKey.current = null;
      }
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function selectUser(nextUserId: string): void {
    const user = availableUsers.find(
      (candidate) => candidate.id === nextUserId
    );
    setUserId(nextUserId);
    setRecipient(user?.email ?? "");
    setTaskId(
      tasks.find(
        (task) => taskUser(task).id === nextUserId
      )?.id ?? ""
    );
    setError(null);
    setSuccess(null);
  }

  function selectAudienceMode(nextMode: AudienceMode): void {
    setAudienceMode(nextMode);
    setAudiencePreview(null);
    setPreviewLoading(nextMode !== "USER");
    setError(null);
    setSuccess(null);
    batchIdempotencyKey.current = null;
  }

  function selectTask(nextTaskId: string): void {
    setTaskId(nextTaskId);
    const task = tasks.find(
      (candidate) => candidate.id === nextTaskId
    );
    if (!task) {
      return;
    }
    const user = taskUser(task);
    setUserId(user.id);
    setRecipient(user.email);
  }

  function selectTemplate(templateId: string): void {
    const template = templates.find(
      (candidate) => candidate.id === templateId
    );
    if (!template) {
      return;
    }
    setSubject(template.subject);
    setContent({
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText,
      assets: template.assets
    });
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>写邮件</h2>
          <p>选择个人、一个分组或全部用户，并审核最终内容</p>
        </div>
        {closeHref ? (
          <Link
            className={styles.secondaryButton}
            href={closeHref}
          >
            关闭写信
          </Link>
        ) : null}
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <fieldset className={styles.segmentPicker}>
          <legend>发送对象</legend>
          {[
            ["USER", "指定用户"],
            ["SEGMENT", "指定分组"],
            ["ALL", "全部用户"]
          ].map(([mode, label]) => (
            <label key={mode}>
              <input
                type="radio"
                name="mail-audience-mode"
                checked={audienceMode === mode}
                onChange={() =>
                  selectAudienceMode(mode as AudienceMode)
                }
                disabled={submitting}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {audienceMode === "SEGMENT" ? (
          <div className={styles.field}>
            <label htmlFor="mail-segment">选择分组</label>
            <select
              className={styles.select}
              id="mail-segment"
              value={segment}
              onChange={(event) => {
                const nextSegment = event.target
                  .value as (typeof segmentOptions)[number];
                if (nextSegment === segment) {
                  return;
                }
                setSegment(nextSegment);
                setAudiencePreview(null);
                setPreviewLoading(true);
              }}
              disabled={submitting}
            >
              {segmentOptions.map((option) => (
                <option key={option} value={option}>
                  {option} 组全员
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {audienceMode !== "USER" ? (
          <p className={styles.notice}>
            <strong>
              每位用户将收到独立邮件，无法看到其他收件人邮箱
            </strong>
            <br />
            {previewLoading
              ? "正在计算预计人数…"
              : audiencePreview
                ? `预计 ${audiencePreview.total} 人，自动跳过 ${audiencePreview.estimatedSkipped} 人`
                : "尚未取得受众人数"}
          </p>
        ) : null}
        <div className={styles.editorGrid}>
          {audienceMode === "USER" ? (
            <>
              <div className={styles.field}>
            <label htmlFor="mail-user-search">搜索用户</label>
            <input
              className={styles.input}
              id="mail-user-search"
              onChange={(event) =>
                setUserQuery(event.target.value)
              }
              placeholder="输入邮箱、用户编号或姓名"
              value={userQuery}
            />
              </div>
              <div className={styles.field}>
            <label htmlFor="mail-user">选择用户</label>
            <select
              className={styles.select}
              id="mail-user"
              value={userId}
              onChange={(event) =>
                selectUser(event.target.value)
              }
              disabled={submitting}
            >
              <option value="">请选择 RightToken 用户</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label} · {user.email}
                </option>
              ))}
            </select>
              </div>
              <div className={styles.field}>
            <label htmlFor="mail-task">关联任务（可选）</label>
            <select
              className={styles.select}
              id="mail-task"
              value={taskId}
              onChange={(event) =>
                selectTask(event.target.value)
              }
              disabled={submitting || !selectedUser}
            >
              <option value="">发送后创建跟进任务</option>
              {userTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
              {selectedTask &&
              !userTasks.some(
                (task) => task.id === selectedTask.id
              ) ? (
                <option value={selectedTask.id}>
                  {selectedTask.title}
                </option>
              ) : null}
            </select>
              </div>
            </>
          ) : null}
          <div className={styles.field}>
            <label htmlFor="mailbox">发件邮箱</label>
            <select
              className={styles.select}
              id="mailbox"
              value={mailboxId}
              onChange={(event) =>
                setMailboxId(event.target.value)
              }
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
          {audienceMode === "USER" ? (
            <div className={styles.field}>
            <label htmlFor="mail-recipient">最终收件人</label>
            <input
              className={styles.input}
              id="mail-recipient"
              type="email"
              value={recipient}
              onChange={(event) =>
                setRecipient(event.target.value)
              }
              required
              disabled={submitting || !selectedUser}
            />
            </div>
          ) : null}
          {templates.length ? (
            <div className={styles.field}>
              <label htmlFor="mail-template">使用模板</label>
              <select
                className={styles.select}
                id="mail-template"
                defaultValue=""
                onChange={(event) =>
                  selectTemplate(event.target.value)
                }
                disabled={submitting}
              >
                <option value="">不使用模板</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        {audienceMode === "USER" && recipientOverridden ? (
          <p className={styles.notice}>
            <strong>已修改收件邮箱</strong>
            <br />
            邮件仍会关联所选用户与任务，并记录实际收件地址。
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
          subject={subject}
          value={content}
        />

        {unresolved.length ? (
          <p className={styles.error}>
            模板中仍有待填写内容：{unresolved.join("、")}
          </p>
        ) : null}
        {audienceMode === "USER" &&
        selectedUser?.suppressed ? (
          <p className={styles.error}>该用户已退订，禁止发送</p>
        ) : null}
        {audienceMode === "USER" && selectedUser?.paused ? (
          <p className={styles.error}>该用户当前已暂停联系</p>
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
            {submitting
              ? "正在发送"
              : audienceMode === "USER"
                ? "确认并发送"
                : "确认创建群发"}
          </button>
        </div>
      </form>
    </section>
  );
}
