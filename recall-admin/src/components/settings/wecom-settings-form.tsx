"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

type BusyAction =
  | "app-save"
  | "app-test"
  | "robot-save"
  | "robot-test"
  | null;

export function WecomSettingsForm(): React.JSX.Element {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testRecipient, setTestRecipient] = useState("");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function begin(action: Exclude<BusyAction, null>) {
    setBusy(action);
    setError(null);
    setSuccess(null);
  }

  async function saveApp(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    begin("app-save");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        "/api/integrations/wecom/app",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName: data.get("displayName"),
            enabled: data.get("enabled") === "on",
            corpId: data.get("corpId"),
            agentId: data.get("agentId"),
            secret
          })
        }
      );
      if (!response.ok) {
        setError("企业微信应用未保存，请检查配置信息。");
        return;
      }
      setSecret("");
      setSuccess("企业微信应用已安全保存");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function testApp(): Promise<void> {
    begin("app-test");
    try {
      const response = await fetch(
        "/api/integrations/wecom/app/test",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recipient: testRecipient })
        }
      );
      if (!response.ok) {
        setError(
          "应用测试失败，请检查凭据和测试成员 UserID。"
        );
        return;
      }
      setSuccess("企业微信应用测试消息已发送");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function saveRobot(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    begin("robot-save");
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

  async function testRobot(): Promise<void> {
    begin("robot-test");
    try {
      const response = await fetch(
        "/api/integrations/wecom/test",
        { method: "POST" }
      );
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

  const feedback = (
    <>
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
    </>
  );

  return (
    <>
      {feedback}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>企业微信应用</h2>
            <p>向当前运营负责人发送脱敏任务通知</p>
          </div>
        </div>
        <form className={styles.formBody} onSubmit={saveApp}>
          <div className={styles.editorGrid}>
            <div className={styles.field}>
              <label htmlFor="wecom-app-display-name">
                连接名称
              </label>
              <input
                className={styles.input}
                id="wecom-app-display-name"
                name="displayName"
                defaultValue="RightToken 运营应用"
                required
                disabled={busy !== null}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="wecom-corp-id">企业 CorpID</label>
              <input
                className={styles.input}
                id="wecom-corp-id"
                name="corpId"
                autoComplete="off"
                required
                disabled={busy !== null}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="wecom-agent-id">
                应用 AgentID
              </label>
              <input
                className={styles.input}
                id="wecom-agent-id"
                name="agentId"
                inputMode="numeric"
                required
                disabled={busy !== null}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="wecom-secret">应用 Secret</label>
              <input
                className={styles.input}
                id="wecom-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="new-password"
                required
                disabled={busy !== null}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="wecom-test-recipient">
                测试成员 UserID
              </label>
              <input
                className={styles.input}
                id="wecom-test-recipient"
                value={testRecipient}
                onChange={(event) =>
                  setTestRecipient(event.target.value)
                }
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
          <div className={styles.inlineActions}>
            <button
              className={styles.button}
              type="submit"
              disabled={busy !== null}
            >
              {busy === "app-save"
                ? "正在保存"
                : "保存应用连接"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={testApp}
              disabled={busy !== null || !testRecipient.trim()}
            >
              {busy === "app-test"
                ? "正在测试"
                : "发送应用测试"}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>运营群机器人</h2>
            <p>紧急任务和无人负责事件发送到运营群</p>
          </div>
        </div>
        <form className={styles.formBody} onSubmit={saveRobot}>
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
                onChange={(event) =>
                  setWebhookUrl(event.target.value)
                }
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
          <div className={styles.inlineActions}>
            <button
              className={styles.button}
              type="submit"
              disabled={busy !== null}
            >
              {busy === "robot-save"
                ? "正在保存"
                : "保存企微连接"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={testRobot}
              disabled={busy !== null}
            >
              {busy === "robot-test"
                ? "正在测试"
                : "发送测试消息"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
