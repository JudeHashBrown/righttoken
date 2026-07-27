"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export function RightTokenSettingsForm(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<"simulator" | "http">("simulator");
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(
    null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload =
      mode === "simulator"
        ? {
            mode,
            displayName: "RightToken 本地模拟数据",
            enabled: form.get("enabled") === "on"
          }
        : {
            mode,
            displayName: "RightToken 正式用户接口",
            enabled: form.get("enabled") === "on",
            baseUrl: form.get("baseUrl"),
            usersPath: form.get("usersPath"),
            apiToken: form.get("apiToken"),
            eventSecret: form.get("eventSecret") || undefined
          };
    try {
      const response = await fetch("/api/integrations/righttoken", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        setError("数据源未保存，请检查接口地址和密钥格式。");
        return;
      }
      setMessage("RightToken 数据源已安全保存");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: "test" | "sync") {
    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/integrations/righttoken/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body:
            action === "sync"
              ? JSON.stringify({ mode: "full" })
              : undefined
        }
      );
      const result = (await response.json().catch(() => null)) as {
        scanned?: number;
      } | null;
      if (!response.ok) {
        setError(
          action === "test"
            ? "连接测试失败，请检查配置。"
            : "校准失败，请先测试连接。"
        );
        return;
      }
      setMessage(
        action === "test"
          ? "RightToken 数据源连接正常"
          : `校准完成：检查 ${result?.scanned ?? 0} 位用户`
      );
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
          <h2>连接 RightToken 用户数据</h2>
          <p>
            正式接口未接入前可使用本地模拟数据；接口密钥整体加密保存
          </p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={save}>
        <div className={styles.editorGrid}>
          <div className={styles.field}>
            <label htmlFor="righttoken-mode">数据源模式</label>
            <select
              className={styles.input}
              id="righttoken-mode"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as "simulator" | "http")
              }
              disabled={busy !== null}
            >
              <option value="simulator">本地模拟数据（100 位用户）</option>
              <option value="http">RightToken 正式接口</option>
            </select>
          </div>
          {mode === "http" ? (
            <>
              <div className={styles.field}>
                <label htmlFor="righttoken-base-url">接口根地址</label>
                <input
                  className={styles.input}
                  id="righttoken-base-url"
                  name="baseUrl"
                  type="url"
                  placeholder="https://righttoken.ai"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="righttoken-users-path">用户接口路径</label>
                <input
                  className={styles.input}
                  id="righttoken-users-path"
                  name="usersPath"
                  defaultValue="/api/v1/admin/recall/users"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="righttoken-api-token">读取接口密钥</label>
                <input
                  className={styles.input}
                  id="righttoken-api-token"
                  name="apiToken"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="righttoken-event-secret">
                  实时事件密钥（可选）
                </label>
                <input
                  className={styles.input}
                  id="righttoken-event-secret"
                  name="eventSecret"
                  type="password"
                  minLength={32}
                  autoComplete="new-password"
                />
              </div>
            </>
          ) : null}
        </div>
        <label className={styles.toggle}>
          <input name="enabled" type="checkbox" defaultChecked />
          保存后启用自动校准
        </label>
        {message ? (
          <p className={styles.success} role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.inlineActions}>
          <button className={styles.button} type="submit" disabled={busy !== null}>
            {busy === "save" ? "正在保存" : "保存数据源"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => runAction("test")}
            disabled={busy !== null}
          >
            {busy === "test" ? "正在测试" : "测试连接"}
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => runAction("sync")}
            disabled={busy !== null}
          >
            {busy === "sync" ? "正在校准" : "立即全量校准"}
          </button>
        </div>
      </form>
    </section>
  );
}
