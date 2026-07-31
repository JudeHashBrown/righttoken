"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export type MailBatchListItem = {
  id: string;
  audienceLabel: string;
  subject: string;
  status:
    | "PENDING"
    | "RUNNING"
    | "COMPLETED"
    | "PARTIAL_FAILURE"
    | "FAILED";
  totalRecipients: number;
  pendingRecipients: number;
  sentRecipients: number;
  skippedRecipients: number;
  failedRecipients: number;
  createdAt: string;
};

type MailBatchListProps = {
  batches: MailBatchListItem[];
};

const statusText: Record<MailBatchListItem["status"], string> = {
  PENDING: "等待发送",
  RUNNING: "发送中",
  COMPLETED: "已完成",
  PARTIAL_FAILURE: "部分失败",
  FAILED: "发送失败"
};

export function MailBatchList({
  batches
}: MailBatchListProps): React.JSX.Element | null {
  const router = useRouter();
  const [retryingId, setRetryingId] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (batches.length === 0) {
    return null;
  }

  async function retry(batchId: string): Promise<void> {
    setRetryingId(batchId);
    setError(null);
    try {
      const response = await fetch(
        `/api/mail/batches/${encodeURIComponent(batchId)}/retry`,
        { method: "POST" }
      );
      if (!response.ok) {
        setError("失败项暂时无法重试，请稍后再试。");
        return;
      }
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>群发进度</h2>
          <p>每位用户均为独立邮件，不共享收件人列表</p>
        </div>
      </div>
      <div className={styles.mailBatchGrid}>
        {batches.map((batch) => (
          <article className={styles.mailBatchCard} key={batch.id}>
            <div className={styles.mailBatchHeading}>
              <span>{batch.audienceLabel}</span>
              <span>{statusText[batch.status]}</span>
            </div>
            <strong className={styles.mailBatchSubject}>
              {batch.subject}
            </strong>
            <div
              className={styles.mailBatchCounts}
              aria-label="发送进度"
            >
              <span>待处理 {batch.pendingRecipients}</span>
              <span>成功 {batch.sentRecipients}</span>
              <span>跳过 {batch.skippedRecipients}</span>
              <span>失败 {batch.failedRecipients}</span>
            </div>
            <div className={styles.inlineActions}>
              <span>共 {batch.totalRecipients} 人</span>
              {batch.failedRecipients > 0 ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={retryingId === batch.id}
                  onClick={() => retry(batch.id)}
                >
                  {retryingId === batch.id
                    ? "正在重试"
                    : "重试失败项"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
