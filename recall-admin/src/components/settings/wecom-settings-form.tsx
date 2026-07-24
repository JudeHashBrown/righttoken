"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export function WecomSettingsForm(): React.JSX.Element {
  const router = useRouter();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setSuccess(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/integrations/wecom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          enabled: data.get("enabled") === "on",
          webhookUrl
        })
      });
      if (!response.ok) {
        setError("企微连接未保存，请检查 Webhook 地址。");
        return;
      }
      setWebhookUrl("");
      setSuccess("企微连接已安全保存");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function testConnection(): Promise<void> {
    setBusy("test");
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/integrations/wecom/test", {
        method: "POST"
      });
      if (!response.ok) {
        setError("企微测试失败，请先保存并检查 Webhook。");
        return;
      }
      setSuccess("企微测试消息已发送");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>连接企业微信群机器人</h2>
          <p>Webhook 会整体加密保存，消息只包含脱敏用户摘要</p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <div className={styles.editorGrid}>
          <div className={styles.field}>
            <label htmlFor="wecom-display-name">连接名称</label>
            <input
              className={styles.input}
              id="wecom-display-name"
              name="displayName"
              defaultValue="企微运营群"
              required
              disabled={busy !== null}
            />
          </div>
          <div className={`${styles.field} ${styles.fieldGrow}`}>
            <label htmlFor="wecom-webhook">
              企微机器人 Webhook
            </label>
            <input
              className={styles.input}
              id="wecom-webhook"
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              required
              disabled={busy !== null}
            />
          </div>
        </div>
        <label className={styles.toggle}>
          <input
            name="enabled"
            type="checkbox"
            defaultChecked
            disabled={busy !== null}
          />
          保存后启用
        </label>
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
            disabled={busy !== null}
          >
            {busy === "save" ? "正在保存" : "保存企微连接"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={testConnection}
            disabled={busy !== null}
          >
            {busy === "test" ? "正在测试" : "发送测试消息"}
          </button>
        </div>
      </form>
    </section>
  );
}
