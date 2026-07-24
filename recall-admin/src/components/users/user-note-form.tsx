"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export function UserNoteForm({
  userId
}: {
  userId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body })
      });
      if (!response.ok) {
        throw new Error("备注保存失败，请重试");
      }
      setBody("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "备注保存失败"
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.formBody} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="user-note">新增运营备注</label>
        <textarea
          className={styles.textarea}
          id="user-note"
          maxLength={2_000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="记录已采取的行动、用户反馈或下一步安排"
          required
          value={body}
        />
      </div>
      <div className={styles.inlineActions}>
        <button
          className={styles.button}
          disabled={pending || !body.trim()}
          type="submit"
        >
          {pending ? "保存中…" : "保存备注"}
        </button>
        <span className={styles.secondaryText}>
          备注会进入用户时间线，并记录操作人。
        </span>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
