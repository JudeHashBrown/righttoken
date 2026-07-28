"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/(auth)/members/invitations/accept/invitation.module.css";

type InvitationAcceptFormProps = {
  token: string;
};

export function InvitationAcceptForm({
  token
}: InvitationAcceptFormProps): React.JSX.Element {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);

    setSubmitting(true);
    try {
      const response = await fetch("/api/members/invitations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          displayName: formData.get("displayName")
        })
      });
      if (!response.ok) {
        setError("邀请已失效、已被使用或账号信息不符合要求。");
        return;
      }

      setCompleted(true);
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="accept-display-name">姓名</label>
        <input
          id="accept-display-name"
          name="displayName"
          type="text"
          autoComplete="name"
          maxLength={80}
          required
          disabled={submitting || completed}
        />
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {completed ? (
        <p className={styles.success} role="status">
          成员已开通，正在进入后台
        </p>
      ) : null}

      <button
        className={styles.submit}
        type="submit"
        disabled={submitting || completed || token.length < 20}
      >
        {submitting ? "正在开通" : "完成账号开通"}
      </button>
    </form>
  );
}
