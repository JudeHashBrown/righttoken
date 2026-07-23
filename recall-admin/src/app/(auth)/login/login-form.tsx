"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

type LoginFormProps = {
  redirectTo: string;
};

const errorMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "邮箱或密码不正确，请重新输入。",
  LOGIN_RATE_LIMITED: "尝试次数过多，请稍后再试。",
  INVALID_ORIGIN: "登录请求未通过安全校验，请刷新页面后重试。",
  INVALID_LOGIN_REQUEST: "请检查邮箱和密码格式。"
};

export function LoginForm({
  redirectTo
}: LoginFormProps): React.JSX.Element {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password")
        })
      });
      const result = (await response.json()) as {
        code?: string;
        nextStep?: "ENROLL_2FA" | "VERIFY_2FA";
      };

      if (!response.ok) {
        setErrorMessage(
          errorMessages[result.code ?? ""] ??
            "暂时无法登录，请稍后重试。"
        );
        return;
      }

      const destination =
        result.nextStep === "ENROLL_2FA"
          ? "/2fa/setup?mode=enroll"
          : result.nextStep === "VERIFY_2FA"
            ? "/2fa/setup?mode=verify"
            : redirectTo;
      router.replace(destination);
      router.refresh();
    } catch {
      setErrorMessage("网络连接异常，请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="email">邮箱</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          disabled={submitting}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor="password">密码</label>
          <span>至少 12 位</span>
        </div>
        <div className={styles.passwordControl}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            minLength={12}
            required
            disabled={submitting}
          />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
            disabled={submitting}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        className={styles.submit}
        type="submit"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <LoaderCircle
              className={styles.spinner}
              aria-hidden="true"
              size={18}
            />
            正在验证
          </>
        ) : (
          "登录"
        )}
      </button>
    </form>
  );
}
