"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/(auth)/login/login.module.css";

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
    const password = String(formData.get("password") ?? "");
    const passwordConfirmation = String(
      formData.get("passwordConfirmation") ?? ""
    );
    if (password !== passwordConfirmation) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/members/invitations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          displayName: formData.get("displayName"),
          password
        })
      });
      if (!response.ok) {
        setError("邀请已失效、已被使用或账号信息不符合要求。");
        return;
      }

      setCompleted(true);
      router.replace("/login");
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
      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor="accept-password">设置密码</label>
          <span>至少 12 位</span>
        </div>
        <input
          id="accept-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          disabled={submitting || completed}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="accept-password-confirmation">确认密码</label>
        <input
          id="accept-password-confirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
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
          账号已开通，正在前往登录页
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
