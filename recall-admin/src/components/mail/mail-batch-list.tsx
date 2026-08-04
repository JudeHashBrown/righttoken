"use client";

import { useRef, useState } from "react";
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

type BounceDetail = {
  actionableBounceCount: number;
  actionableBounceEmails: string[];
  actionableBounceList: string;
  senderMailboxName: string;
  subject: string;
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
  const [loadingBounceId, setLoadingBounceId] =
    useState<string | null>(null);
  const [bounceRetryingId, setBounceRetryingId] =
    useState<string | null>(null);
  const [confirmingBounceId, setConfirmingBounceId] =
    useState<string | null>(null);
  const [bounceDetails, setBounceDetails] = useState<
    Record<string, BounceDetail>
  >({});
  const [copiedBatchId, setCopiedBatchId] =
    useState<string | null>(null);
  const bounceIdempotencyKeys = useRef(
    new Map<string, string>()
  );
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

  async function loadBounceDetail(batchId: string): Promise<void> {
    setLoadingBounceId(batchId);
    setError(null);
    try {
      const response = await fetch(
        `/api/mail/batches/${encodeURIComponent(batchId)}`
      );
      if (!response.ok) {
        setError("退信邮箱暂时无法读取，请稍后再试。");
        return;
      }
      const detail = (await response.json()) as BounceDetail;
      setBounceDetails((current) => ({
        ...current,
        [batchId]: detail
      }));
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setLoadingBounceId(null);
    }
  }

  async function copyBounceList(
    batchId: string,
    value: string
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedBatchId(batchId);
    } catch {
      setError("复制失败，请手动选择邮箱列表复制。");
    }
  }

  async function retryFinalBounces(
    batchId: string
  ): Promise<void> {
    setBounceRetryingId(batchId);
    setError(null);
    const idempotencyKey =
      bounceIdempotencyKeys.current.get(batchId) ??
      `bounce-retry-${batchId}-${Date.now()}`;
    bounceIdempotencyKeys.current.set(batchId, idempotencyKey);
    try {
      const response = await fetch(
        `/api/mail/batches/${encodeURIComponent(batchId)}/bounce-retry`,
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey }
        }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { code?: string }
          | null;
        setError(
          body?.code === "NO_ACTIONABLE_BOUNCES"
            ? "这些退信邮箱已经创建过重发任务，无需重复操作。"
            : "最终退信暂时无法重新发送，请稍后再试。"
        );
        return;
      }
      bounceIdempotencyKeys.current.delete(batchId);
      setConfirmingBounceId(null);
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setBounceRetryingId(null);
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
              {batch.failedRecipients > 0 ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={loadingBounceId === batch.id}
                  onClick={() => loadBounceDetail(batch.id)}
                >
                  {loadingBounceId === batch.id
                    ? "正在读取"
                    : "查看退信邮箱"}
                </button>
              ) : null}
            </div>
            {bounceDetails[batch.id] ? (
              <div className={styles.bounceListPanel}>
                {bounceDetails[batch.id]!
                  .actionableBounceCount > 0 ? (
                  <>
                    <label
                      htmlFor={`bounce-list-${batch.id}`}
                    >
                      最终退信邮箱（用英文分号分隔）
                    </label>
                    <textarea
                      className={styles.textarea}
                      id={`bounce-list-${batch.id}`}
                      readOnly
                      value={
                        bounceDetails[batch.id]!
                          .actionableBounceList
                      }
                    />
                    <div className={styles.inlineActions}>
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() =>
                          copyBounceList(
                            batch.id,
                            bounceDetails[batch.id]!
                              .actionableBounceList
                          )
                        }
                      >
                        {copiedBatchId === batch.id
                          ? "已复制"
                          : "复制邮箱列表"}
                      </button>
                      <button
                        className={styles.button}
                        type="button"
                        disabled={
                          bounceRetryingId === batch.id
                        }
                        onClick={() =>
                          setConfirmingBounceId(batch.id)
                        }
                      >
                        {bounceRetryingId === batch.id
                          ? "正在创建重发任务"
                          : "重新发送最终退信"}
                      </button>
                    </div>
                    {confirmingBounceId === batch.id ? (
                      <div
                        aria-labelledby={`bounce-confirm-title-${batch.id}`}
                        aria-modal="true"
                        className={styles.bounceConfirmDialog}
                        role="dialog"
                      >
                        <strong
                          id={`bounce-confirm-title-${batch.id}`}
                        >
                          确认重新发送最终退信
                        </strong>
                        <p>
                          将使用邮箱
                          {" "}
                          <b>
                            {
                              bounceDetails[batch.id]!
                                .senderMailboxName
                            }
                          </b>
                          {" "}
                          重新发送“
                          {bounceDetails[batch.id]!.subject}
                          ”，共
                          {" "}
                          {
                            bounceDetails[batch.id]!
                              .actionableBounceCount
                          }
                          {" "}
                          个最终退信邮箱。
                        </p>
                        <p>
                          系统会创建新的群发任务，每封邮件继续按
                          2-4 分钟随机间隔发送。
                        </p>
                        <div className={styles.inlineActions}>
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            onClick={() =>
                              setConfirmingBounceId(null)
                            }
                          >
                            取消
                          </button>
                          <button
                            className={styles.button}
                            type="button"
                            disabled={
                              bounceRetryingId === batch.id
                            }
                            onClick={() =>
                              retryFinalBounces(
                                batch.id
                              )
                            }
                          >
                            {bounceRetryingId === batch.id
                              ? "正在创建"
                              : "确认创建重发任务"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>暂无可重新发送的最终退信邮箱。</p>
                )}
              </div>
            ) : null}
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
