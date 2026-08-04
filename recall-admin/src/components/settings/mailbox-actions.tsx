"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";
import {
  mailSyncStatusText
} from "@/modules/mail/sync-error";

export function MailboxActions({
  mailboxId,
  mailboxName,
  configurationVersion
}: {
  mailboxId: string;
  mailboxName: string;
  configurationVersion: number;
}): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<
    "test" | "sync" | "delete" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function testConnection(): Promise<void> {
    setBusy("test");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/integrations/mailboxes/${mailboxId}/test`,
        { method: "POST" }
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        setError(mailSyncStatusText(result?.code ?? null));
        return;
      }
      setMessage(
        "收信和发信连接均正常；测试连接不会收取邮件。"
      );
      router.refresh();
    } catch {
      setError("网络连接异常。");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy("sync");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/mail/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mailboxId })
      });
      const result = (await response.json().catch(() => null)) as {
        code?: string;
        received?: number;
        matched?: number;
        unmatched?: number;
      } | null;
      if (!response.ok) {
        setError(mailSyncStatusText(result?.code ?? null));
        return;
      }
      setMessage(
        `收信完成：收到 ${result?.received ?? 0} 封，已关联 ${result?.matched ?? 0} 封，未匹配 ${result?.unmatched ?? 0} 封`
      );
      router.refresh();
    } catch {
      setError("网络连接异常。");
    } finally {
      setBusy(null);
    }
  }

  async function deleteConfiguration(): Promise<void> {
    const confirmed = window.confirm(
      `确定删除“${mailboxName}”吗？邮箱账号、密码和收发服务器配置将永久删除，历史邮件和群发记录会保留。`
    );
    if (!confirmed) {
      return;
    }

    setBusy("delete");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/integrations/mailboxes/${mailboxId}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ configurationVersion })
        }
      );
      if (!response.ok) {
        if (response.status === 404) {
          setError("邮箱配置已不存在，列表已刷新。");
          router.refresh();
          return;
        }
        if (response.status === 409) {
          setError("邮箱配置已更新，列表已刷新。");
          router.refresh();
          return;
        }
        setError("邮箱配置删除失败，原有数据未改变。");
        return;
      }
      setMessage("邮箱配置已删除，历史邮件和群发记录已保留。");
      router.refresh();
    } catch {
      setError("网络连接异常，邮箱配置未删除。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className={styles.inlineActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={testConnection}
          disabled={busy !== null}
        >
          {busy === "test" ? "正在测试" : "测试连接"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={syncNow}
          disabled={busy !== null}
        >
          {busy === "sync" ? "正在收取" : "立即收取邮件"}
        </button>
        <button
          className={styles.dangerButton}
          type="button"
          onClick={deleteConfiguration}
          disabled={busy !== null}
        >
          {busy === "delete" ? "正在删除" : "删除邮箱"}
        </button>
      </div>
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
    </div>
  );
}
