import { MailboxActions } from "@/components/settings/mailbox-actions";
import styles from "@/components/workspaces/workspace.module.css";

export type MailboxStatusDetailData = {
  id: string;
  name: string;
  emailAddress: string;
  enabled: boolean;
  configurationVersion: number;
  statusText: string;
  lastTestedAt: string | null;
  lastSyncedAt: string | null;
};

function dateTime(value: string | null): string {
  if (!value) {
    return "尚无记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export function MailboxStatusDetail({
  mailbox
}: {
  mailbox: MailboxStatusDetailData;
}): React.JSX.Element {
  return (
    <div className={styles.mailboxStatusDetail}>
      <header className={styles.mailDetailHeader}>
        <div>
          <h2>{mailbox.name}</h2>
          <p>{mailbox.emailAddress}</p>
        </div>
        <span
          className={
            mailbox.enabled
              ? styles.statusGood
              : styles.statusWaiting
          }
        >
          {mailbox.enabled ? "已启用" : "未启用"}
        </span>
      </header>
      <div className={styles.mailboxHealth}>
        <span>当前状态</span>
        <strong>{mailbox.statusText}</strong>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span className={styles.detailLabel}>最近连接测试</span>
          <strong>{dateTime(mailbox.lastTestedAt)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.detailLabel}>最近成功同步</span>
          <strong>{dateTime(mailbox.lastSyncedAt)}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.detailLabel}>自动同步频率</span>
          <strong>每 2 分钟</strong>
        </div>
      </div>
      <MailboxActions
        mailboxId={mailbox.id}
        mailboxName={mailbox.name}
        configurationVersion={mailbox.configurationVersion}
      />
    </div>
  );
}
