"use client";

import {
  useEffect,
  useState,
  type FormEvent
} from "react";
import { LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./two-factor.module.css";

type TwoFactorMode = "enroll" | "verify";

type EnrollmentMaterial = {
  otpauthUrl: string;
  qrDataUrl: string;
  pendingSecretToken: string;
};

async function requestEnrollment(): Promise<EnrollmentMaterial> {
  const response = await fetch("/api/auth/2fa/setup", {
    method: "POST"
  });
  const result = (await response.json()) as EnrollmentMaterial;
  if (!response.ok) {
    throw new Error("setup failed");
  }
  return result;
}

export function TwoFactorForm({
  mode
}: {
  mode: TwoFactorMode;
}): React.JSX.Element {
  const router = useRouter();
  const [material, setMaterial] =
    useState<EnrollmentMaterial | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(mode === "enroll");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(
    null
  );

  async function loadEnrollment(): Promise<void> {
    setLoadingSetup(true);
    setErrorMessage(null);
    try {
      setMaterial(await requestEnrollment());
    } catch {
      setErrorMessage("暂时无法生成验证器配置，请稍后重试。");
    } finally {
      setLoadingSetup(false);
    }
  }

  useEffect(() => {
    if (mode !== "enroll") {
      return;
    }

    let active = true;
    void requestEnrollment()
      .then((result) => {
        if (active) {
          setMaterial(result);
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage(
            "暂时无法生成验证器配置，请稍后重试。"
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingSetup(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: formData.get("code"),
          ...(material
            ? { pendingSecretToken: material.pendingSecretToken }
            : {})
        })
      });
      const result = (await response.json()) as {
        verified?: boolean;
        recoveryCodes?: string[];
        code?: string;
      };
      if (
        response.status === 409 &&
        result.code === "TWO_FACTOR_SETUP_REQUIRED"
      ) {
        router.replace("/2fa/setup?mode=enroll");
        router.refresh();
        return;
      }
      if (!response.ok || !result.verified) {
        setErrorMessage("验证码无效或已过期，请输入新的验证码。");
        return;
      }

      if (result.recoveryCodes?.length) {
        setRecoveryCodes(result.recoveryCodes);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (recoveryCodes) {
    return (
      <section className={styles.recovery} aria-live="polite">
        <h2>保存恢复码</h2>
        <p>
          每个恢复码只能使用一次。请保存到安全位置，离开此页面后将不再显示。
        </p>
        <ol className={styles.recoveryList}>
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ol>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
        >
          我已安全保存，进入管理台
        </button>
      </section>
    );
  }

  return (
    <div>
      {mode === "enroll" ? (
        <section className={styles.enrollment}>
          {loadingSetup ? (
            <div className={styles.loading} aria-live="polite">
              <LoaderCircle
                className={styles.spinner}
                aria-hidden="true"
                size={20}
              />
              正在生成安全配置
            </div>
          ) : material ? (
            <>
              <div className={styles.qrFrame}>
                <Image
                  src={material.qrDataUrl}
                  width={216}
                  height={216}
                  alt="RightToken 二次验证二维码"
                  unoptimized
                  priority
                />
              </div>
              <div className={styles.setupCopy}>
                <h2>使用验证器扫描二维码</h2>
                <p>
                  可使用企业微信、1Password、Google Authenticator
                  等支持 TOTP 的验证器。
                </p>
                <details>
                  <summary>无法扫码？查看手动密钥</summary>
                  <code>
                    {new URL(material.otpauthUrl).searchParams.get(
                      "secret"
                    )}
                  </code>
                </details>
              </div>
            </>
          ) : (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void loadEnrollment()}
            >
              重新生成配置
            </button>
          )}
        </section>
      ) : (
        <p className={styles.verifyHint}>
          打开你的验证器，输入当前显示的 6 位动态验证码。
        </p>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor="totp-code">6 位验证码</label>
        <input
          id="totp-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          disabled={submitting || (mode === "enroll" && !material)}
        />

        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          className={styles.primaryButton}
          type="submit"
          disabled={submitting || (mode === "enroll" && !material)}
        >
          {submitting ? "正在验证" : mode === "enroll" ? "绑定并验证" : "完成验证"}
        </button>
      </form>
    </div>
  );
}
