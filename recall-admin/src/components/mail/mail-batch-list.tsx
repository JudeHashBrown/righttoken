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
  retryableFailedRecipients: number;
  createdAt: string;
};

type MailBatchListProps = {
  batches: MailBatchListItem[];
  visible?: boolean;
};

const statusText: Record<MailBatchListItem["status"], string> = {
  PENDING: "等待发送",
  RUNNING: "发送中",
  COMPLETED: "已完成",
  PARTIAL_FAILURE: "部分失败",
  FAILED: "发送失败"
};

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function MailBatchList({
  batches,
  visible = false
}: MailBatchListProps): React.JSX.Element {
  if (!visible) {
    return <></>;
  }

  return (
    <section
      aria-label="群发进度"
      className={styles.mailBatchHistory}
      id="mail-batch-history"
    >
      <div className={styles.mailBatchHistoryHeader}>
        <h2>群发进度</h2>
        <span>共 {batches.length} 条历史记录</span>
      </div>
      {batches.length ? (
        <ul aria-label="群发历史明细" className={styles.mailBatchHistoryList}>
          {batches.map((batch) => (
            <li key={batch.id}>
              <time dateTime={batch.createdAt}>{dateTime(batch.createdAt)}</time>
              <div>
                <strong>{batch.subject}</strong>
                <span>{batch.audienceLabel}</span>
              </div>
              <span>{statusText[batch.status]}</span>
              <span>总计 {batch.totalRecipients}</span>
              <span>成功 {batch.sentRecipients}</span>
              <span>跳过 {batch.skippedRecipients}</span>
              <span>失败 {batch.failedRecipients}</span>
              <span>待处理 {batch.pendingRecipients}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.mailBatchHistoryEmpty}>暂无群发记录</p>
      )}
    </section>
  );
}
