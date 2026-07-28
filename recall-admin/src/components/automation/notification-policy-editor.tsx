"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { NotificationPolicy } from "@/modules/notifications/policy-config";
import styles from "@/components/workspaces/workspace.module.css";

type NotificationPolicyEditorProps = {
  initialConfig: NotificationPolicy;
};

const levels = [
  { key: "urgent", label: "紧急" },
  { key: "important", label: "重要" },
  { key: "normal", label: "普通" }
] as const;

function numberValue(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

export function NotificationPolicyEditor({
  initialConfig
}: NotificationPolicyEditorProps): React.JSX.Element {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const levelConfig = (key: (typeof levels)[number]["key"]) => ({
      wecom: formData.get(`${key}Wecom`) === "on",
      email: formData.get(`${key}Email`) === "on",
      repeatMinutes: numberValue(formData, `${key}RepeatMinutes`),
      escalateMinutes: numberValue(formData, `${key}EscalateMinutes`)
    });
    const config: NotificationPolicy = {
      urgent: levelConfig("urgent"),
      important: levelConfig("important"),
      normal: levelConfig("normal"),
      dailyDigestTime: String(formData.get("dailyDigestTime"))
    };

    try {
      const response = await fetch(
        "/api/automation/notification-policies",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(config)
        }
      );
      const result = (await response.json().catch(() => null)) as {
        version?: number;
      } | null;
      if (!response.ok || !result?.version) {
        setError("通知策略未发布，请检查输入后重试。");
        return;
      }
      setMessage(`通知策略 v${result.version} 已发布`);
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
          <h2>通知策略编辑</h2>
          <p>后台通知始终保留；外部通道连接后按这里的规则发送</p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <div className={styles.notificationGrid}>
          {levels.map(({ key, label }) => (
            <fieldset className={styles.ruleCard} key={key}>
              <legend>{label}任务</legend>
              <label className={styles.toggle}>
                <input
                  name={`${key}Wecom`}
                  type="checkbox"
                  defaultChecked={initialConfig[key].wecom}
                  disabled={submitting}
                />
                发送企微通知
              </label>
              <label className={styles.toggle}>
                <input
                  name={`${key}Email`}
                  type="checkbox"
                  defaultChecked={initialConfig[key].email}
                  disabled={submitting}
                />
                发送邮件通知
              </label>
              <div className={styles.field}>
                <label htmlFor={`${key}-repeat`}>
                  重复提醒间隔（分钟，0 为关闭）
                </label>
                <input
                  className={styles.input}
                  id={`${key}-repeat`}
                  name={`${key}RepeatMinutes`}
                  type="number"
                  min="0"
                  max="10080"
                  step="5"
                  defaultValue={initialConfig[key].repeatMinutes}
                  required
                  disabled={submitting}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor={`${key}-escalate`}>
                  升级管理员时间（分钟，0 为关闭）
                </label>
                <input
                  className={styles.input}
                  id={`${key}-escalate`}
                  name={`${key}EscalateMinutes`}
                  type="number"
                  min="0"
                  max="43200"
                  step="5"
                  defaultValue={initialConfig[key].escalateMinutes}
                  required
                  disabled={submitting}
                />
              </div>
            </fieldset>
          ))}
        </div>
        <div className={styles.field}>
          <label htmlFor="daily-digest-time">每日汇总时间</label>
          <input
            className={styles.input}
            id="daily-digest-time"
            name="dailyDigestTime"
            type="time"
            defaultValue={initialConfig.dailyDigestTime}
            required
            disabled={submitting}
          />
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className={styles.success} role="status">
            {message}
          </p>
        ) : null}
        <div className={styles.inlineActions}>
          <button
            className={styles.button}
            type="submit"
            disabled={submitting}
          >
            {submitting ? "正在发布" : "发布通知策略"}
          </button>
        </div>
      </form>
    </section>
  );
}
