"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SegmentConfig } from "@/modules/segmentation/types";
import styles from "@/components/workspaces/workspace.module.css";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type SegmentRuleEditorProps = {
  initialConfig: SegmentConfig;
};

function numberValue(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

export function SegmentRuleEditor({
  initialConfig
}: SegmentRuleEditorProps): React.JSX.Element {
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
    const config = {
      registrationUnpaidMs:
        numberValue(formData, "registrationUnpaidHours") * HOUR_MS,
      checkoutUnpaidMs:
        numberValue(formData, "checkoutUnpaidMinutes") * 60 * 1000,
      paidWithoutCallMs:
        numberValue(formData, "paidWithoutCallHours") * HOUR_MS,
      inactiveMs: numberValue(formData, "inactiveDays") * DAY_MS,
      emptyBalanceMinor: numberValue(formData, "emptyBalanceMinor"),
      emptyBalanceReminderMs:
        numberValue(formData, "emptyBalanceReminderDays") * DAY_MS
    };

    try {
      const response = await fetch("/api/automation/segment-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config)
      });
      const result = (await response.json().catch(() => null)) as {
        version?: number;
      } | null;
      if (!response.ok || !result?.version) {
        setError("分组规则未发布，请检查输入后重试。");
        return;
      }

      setMessage(`分组规则 v${result.version} 已发布`);
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
          <h2>规则参数</h2>
          <p>发布后，新进入队列和重新计算的用户会使用最新版本</p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <div className={styles.editorGrid}>
          <div className={styles.field}>
            <label htmlFor="registration-unpaid-hours">
              A 组观察时长（小时）
            </label>
            <input
              className={styles.input}
              id="registration-unpaid-hours"
              name="registrationUnpaidHours"
              type="number"
              min="0.25"
              max="720"
              step="0.25"
              defaultValue={
                (initialConfig.registrationUnpaidMs ?? 2 * HOUR_MS) /
                HOUR_MS
              }
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="checkout-unpaid-minutes">
              B 组观察时长（分钟）
            </label>
            <input
              className={styles.input}
              id="checkout-unpaid-minutes"
              name="checkoutUnpaidMinutes"
              type="number"
              min="5"
              max="10080"
              step="5"
              defaultValue={
                (initialConfig.checkoutUnpaidMs ?? 30 * 60 * 1000) /
                60 /
                1000
              }
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="paid-without-call-hours">
              C 组观察时长（小时）
            </label>
            <input
              className={styles.input}
              id="paid-without-call-hours"
              name="paidWithoutCallHours"
              type="number"
              min="1"
              max="2160"
              step="1"
              defaultValue={
                (initialConfig.paidWithoutCallMs ?? DAY_MS) / HOUR_MS
              }
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="inactive-days">D 组停用阈值（天）</label>
            <input
              className={styles.input}
              id="inactive-days"
              name="inactiveDays"
              type="number"
              min="1"
              max="365"
              step="1"
              defaultValue={initialConfig.inactiveMs / DAY_MS}
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="empty-balance-minor">
              E 组余额阈值（最小货币单位）
            </label>
            <input
              className={styles.input}
              id="empty-balance-minor"
              name="emptyBalanceMinor"
              type="number"
              step="1"
              defaultValue={initialConfig.emptyBalanceMinor}
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="empty-balance-reminder-days">
              E 组提醒等待（天）
            </label>
            <input
              className={styles.input}
              id="empty-balance-reminder-days"
              name="emptyBalanceReminderDays"
              type="number"
              min="0.25"
              max="365"
              step="0.25"
              defaultValue={
                (initialConfig.emptyBalanceReminderMs ?? 3 * DAY_MS) /
                DAY_MS
              }
              required
              disabled={submitting}
            />
          </div>
        </div>

        <p className={styles.notice}>
          F 组服务异常始终立即提醒，G 组为健康用户且不创建个人召回任务。
        </p>
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
            {submitting ? "正在发布" : "发布分组规则"}
          </button>
        </div>
      </form>
    </section>
  );
}
