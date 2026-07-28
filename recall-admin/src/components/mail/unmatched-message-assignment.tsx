"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

type UserOption = {
  id: string;
  externalUserId: string;
  displayName: string | null;
  email: string;
  currentSegment: string;
};

export function UnmatchedMessageAssignment({
  messageId,
  users
}: {
  messageId: string;
  users: UserOption[];
}): React.JSX.Element {
  const router = useRouter();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/mail/messages/${encodeURIComponent(
          messageId
        )}/assign`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId })
        }
      );
      if (!response.ok) {
        setError("关联失败，请确认用户后重试。");
        return;
      }
      router.push("/mail?view=pending");
      router.refresh();
    } catch {
      setError("网络连接异常，来信尚未关联。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.assignmentForm} onSubmit={submit}>
      <div>
        <strong>关联 RightToken 用户</strong>
        <p>关联后将建立会话并生成待回复任务</p>
      </div>
      <select
        aria-label="选择关联用户"
        className={styles.select}
        onChange={(event) => setUserId(event.target.value)}
        value={userId}
      >
        {users.length ? null : (
          <option value="">当前范围内没有可选用户</option>
        )}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName || user.externalUserId} · {user.email} ·{" "}
            {user.currentSegment} 组
          </option>
        ))}
      </select>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button
        className={styles.button}
        disabled={!userId || submitting}
        type="submit"
      >
        {submitting ? "关联中…" : "确认关联"}
      </button>
    </form>
  );
}
